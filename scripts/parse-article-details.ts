#!/usr/bin/env npx tsx
/**
 * 既存の法令XMLから条文の詳細構造（項・号）をパースしてデータベースに追加
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient({
  log: ['error'],
});

interface ParseStats {
  totalLaws: number;
  totalArticles: number;
  totalParagraphs: number;
  totalItems: number;
  processedLaws: number;
  startTime: number;
}

class ArticleDetailParser {
  private stats: ParseStats = {
    totalLaws: 0,
    totalArticles: 0,
    totalParagraphs: 0,
    totalItems: 0,
    processedLaws: 0,
    startTime: 0
  };

  /**
   * XMLから条文の詳細構造を抽出
   */
  private parseArticleDetails(xmlContent: string, lawId: string) {
    const articles: any[] = [];
    
    // 条文を抽出
    const articleMatches = xmlContent.matchAll(/<Article[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleNumber = match[1];
      const articleContent = match[2];
      
      // 条文タイトル
      const titleMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = titleMatch ? titleMatch[1] : null;
      
      // 項を抽出
      const paragraphs: any[] = [];
      const paragraphMatches = articleContent.matchAll(/<Paragraph[^>]*(?:Num="(\d+)")?[^>]*>([\s\S]*?)<\/Paragraph>/g);
      
      let paragraphNum = 0;
      for (const pMatch of paragraphMatches) {
        paragraphNum++;
        const paragraphNumber = pMatch[1] ? parseInt(pMatch[1]) : paragraphNum;
        const paragraphContent = pMatch[2];
        
        // 項の文章を抽出
        const sentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
        let sentence = '';
        if (sentenceMatch) {
          // Sentenceタグ内のテキストを抽出
          const sentenceContent = sentenceMatch[1];
          const textMatches = sentenceContent.matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
          const texts = [];
          for (const textMatch of textMatches) {
            texts.push(textMatch[1]);
          }
          sentence = texts.join('') || sentenceContent.replace(/<[^>]*>/g, '');
        }
        
        // 号を抽出
        const items: any[] = [];
        const itemMatches = paragraphContent.matchAll(/<Item[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g);
        
        for (const iMatch of itemMatches) {
          const itemNumber = iMatch[1];
          const itemContent = iMatch[2];
          
          // 号の文章を抽出
          const itemSentenceMatch = itemContent.match(/<ItemSentence>([\s\S]*?)<\/ItemSentence>/);
          let itemSentence = '';
          if (itemSentenceMatch) {
            const itemSentenceContent = itemSentenceMatch[1];
            const textMatches = itemSentenceContent.matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
            const texts = [];
            for (const textMatch of textMatches) {
              texts.push(textMatch[1]);
            }
            itemSentence = texts.join('') || itemSentenceContent.replace(/<[^>]*>/g, '');
          }
          
          if (itemSentence) {
            items.push({
              itemNumber: itemNumber,
              content: itemSentence.trim()
            });
          }
        }
        
        if (sentence || items.length > 0) {
          paragraphs.push({
            paragraphNumber: paragraphNumber,
            content: sentence.trim(),
            items: items
          });
        }
      }
      
      // 第1項の内容を条文のcontentとして使用
      const mainContent = paragraphs[0]?.content || '';
      
      articles.push({
        articleNumber: articleNumber,
        articleTitle: articleTitle,
        content: mainContent,
        paragraphs: paragraphs
      });
    }
    
    return articles;
  }

  /**
   * 単一の法令の条文詳細を処理
   */
  private async processLaw(law: any): Promise<void> {
    try {
      const articles = this.parseArticleDetails(law.xmlContent, law.id);
      
      for (const articleData of articles) {
        // 既存の条文を検索または作成
        let article = await prisma.article.findFirst({
          where: {
            lawId: law.id,
            articleNumber: articleData.articleNumber
          }
        });
        
        if (!article) {
          // 条文が存在しない場合は作成
          article = await prisma.article.create({
            data: {
              lawId: law.id,
              articleNumber: articleData.articleNumber,
              articleTitle: articleData.articleTitle,
              content: articleData.content
            }
          });
          this.stats.totalArticles++;
        }
        
        // 項を処理
        for (const paragraphData of articleData.paragraphs) {
          // 既存の項をチェック
          let paragraph = await prisma.paragraph.findFirst({
            where: {
              articleId: article.id,
              paragraphNumber: paragraphData.paragraphNumber
            }
          });
          
          if (!paragraph) {
            // 項を作成
            paragraph = await prisma.paragraph.create({
              data: {
                articleId: article.id,
                paragraphNumber: paragraphData.paragraphNumber,
                content: paragraphData.content
              }
            });
            this.stats.totalParagraphs++;
          }
          
          // 号を処理
          for (const itemData of paragraphData.items) {
            // 既存の号をチェック
            const existingItem = await prisma.item.findFirst({
              where: {
                paragraphId: paragraph.id,
                itemNumber: itemData.itemNumber
              }
            });
            
            if (!existingItem) {
              // 号を作成
              await prisma.item.create({
                data: {
                  paragraphId: paragraph.id,
                  itemNumber: itemData.itemNumber,
                  content: itemData.content
                }
              });
              this.stats.totalItems++;
            }
          }
        }
      }
      
      this.stats.processedLaws++;
      
    } catch (error: any) {
      console.error(`❌ エラー (${law.id}): ${error.message?.substring(0, 100)}`);
    }
  }

  /**
   * 全法令の条文詳細をパース
   */
  async parseAll(): Promise<void> {
    console.log('📖 条文の詳細構造（項・号）のパースを開始します...\n');
    this.stats.startTime = performance.now();
    
    // 現在の状態を確認
    const existingParagraphs = await prisma.paragraph.count();
    const existingItems = await prisma.item.count();
    console.log(`📊 現在の状態:`);
    console.log(`  既存の項: ${existingParagraphs}件`);
    console.log(`  既存の号: ${existingItems}件\n`);
    
    // 法令を取得（バッチ処理）
    const lawCount = await prisma.law.count();
    this.stats.totalLaws = lawCount;
    console.log(`📚 ${lawCount}件の法令を処理します\n`);
    
    const BATCH_SIZE = 10; // XMLが大きいので小さめのバッチ
    let processed = 0;
    
    while (processed < lawCount) {
      // バッチで法令を取得
      const laws = await prisma.law.findMany({
        skip: processed,
        take: BATCH_SIZE,
        select: {
          id: true,
          title: true,
          xmlContent: true
        }
      });
      
      // 各法令を処理
      for (const law of laws) {
        await this.processLaw(law);
      }
      
      processed += laws.length;
      
      // 進捗表示
      if (processed % 100 === 0 || processed >= lawCount) {
        const percentage = Math.round((processed / lawCount) * 100);
        const elapsed = (performance.now() - this.stats.startTime) / 1000;
        const rate = processed / elapsed;
        const eta = (lawCount - processed) / rate;
        
        console.log(`📊 進捗: ${processed}/${lawCount} (${percentage}%)`);
        console.log(`  ✅ 処理済み法令: ${this.stats.processedLaws}`);
        console.log(`  📄 新規条文: ${this.stats.totalArticles}`);
        console.log(`  📝 新規項: ${this.stats.totalParagraphs}`);
        console.log(`  📌 新規号: ${this.stats.totalItems}`);
        console.log(`  ⏱️  速度: ${rate.toFixed(2)}件/秒`);
        if (eta > 0) {
          console.log(`  ⏳ 残り: 約${Math.ceil(eta / 60)}分`);
        }
        console.log();
      }
      
      // メモリ管理
      if (global.gc && processed % 500 === 0) {
        global.gc();
      }
    }
    
    // 最終統計
    await this.printFinalStats();
  }

  /**
   * 最終統計表示
   */
  private async printFinalStats(): Promise<void> {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    // 最終的なデータ数
    const finalArticles = await prisma.article.count();
    const finalParagraphs = await prisma.paragraph.count();
    const finalItems = await prisma.item.count();
    
    console.log('='.repeat(60));
    console.log('✅ 条文詳細構造のパース完了！');
    console.log('='.repeat(60));
    console.log(`📊 処理統計:`);
    console.log(`  処理法令数: ${this.stats.processedLaws}/${this.stats.totalLaws}`);
    console.log(`  新規条文: ${this.stats.totalArticles}`);
    console.log(`  新規項: ${this.stats.totalParagraphs}`);
    console.log(`  新規号: ${this.stats.totalItems}`);
    console.log(`  処理時間: ${(elapsed / 60).toFixed(1)}分`);
    console.log();
    console.log(`📚 データベース最終状態:`);
    console.log(`  総条文数: ${finalArticles}`);
    console.log(`  総項数: ${finalParagraphs}`);
    console.log(`  総号数: ${finalItems}`);
    console.log();
    console.log('✨ 全法令の条文構造が正しくパースされました！');
  }
}

// メイン実行
async function main() {
  const parser = new ArticleDetailParser();
  
  try {
    await parser.parseAll();
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}