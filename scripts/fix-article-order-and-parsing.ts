#!/usr/bin/env npx tsx
/**
 * 条文の並び順とパース問題を修正
 * 1. sortOrderを正しく設定
 * 2. 「三条の二」などの表記を修正
 * 3. 政令・規則の条文パースを改善
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient({
  log: ['error'],
});

interface ProcessStats {
  totalLaws: number;
  processedLaws: number;
  updatedArticles: number;
  parsedNewArticles: number;
  startTime: number;
}

class ArticleOrderFixer {
  private stats: ProcessStats = {
    totalLaws: 0,
    processedLaws: 0,
    updatedArticles: 0,
    parsedNewArticles: 0,
    startTime: 0
  };

  /**
   * 条文番号を数値に変換（ソート用）
   * 例: "1" -> 1, "3_2" -> 3.2, "3の2" -> 3.2
   */
  private parseArticleNumber(articleNum: string): number {
    // まず「の」を「_」に変換
    let normalized = articleNum.replace(/の/g, '_');
    
    // 漢数字を算用数字に変換
    const kanjiToNum: { [key: string]: string } = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
      '百': '100', '千': '1000'
    };
    
    for (const [kanji, num] of Object.entries(kanjiToNum)) {
      normalized = normalized.replace(new RegExp(kanji, 'g'), num);
    }
    
    // "3_2" -> 3.2のように変換
    if (normalized.includes('_')) {
      const parts = normalized.split('_');
      const main = parseFloat(parts[0]) || 0;
      const sub = parseFloat(parts[1]) || 0;
      return main + sub / 1000; // 3.002のような形で表現
    }
    
    return parseFloat(normalized) || 0;
  }

  /**
   * 条文番号の表記を修正
   * 例: "3_2" -> "3の2"
   */
  private formatArticleNumber(articleNum: string): string {
    // "_"を「の」に変換
    return articleNum.replace(/_/g, 'の');
  }

  /**
   * 政令・規則のXMLから条文を再パース
   */
  private parseGovernmentOrdinanceArticles(xmlContent: string): any[] {
    const articles: any[] = [];
    
    // 本則部分を抽出
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    if (!mainProvisionMatch) return articles;
    
    const mainProvision = mainProvisionMatch[1];
    
    // 条文を抽出（より柔軟なパターン）
    const articlePatterns = [
      /<Article[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g,
      /<Article[^>]*>([\s\S]*?)<\/Article>/g
    ];
    
    for (const pattern of articlePatterns) {
      const matches = mainProvision.matchAll(pattern);
      
      for (const match of matches) {
        let articleNumber = '';
        let articleContent = '';
        
        if (match[2]) {
          // Num属性がある場合
          articleNumber = match[1];
          articleContent = match[2];
        } else {
          // Num属性がない場合、ArticleTitleから抽出
          articleContent = match[1];
          const titleMatch = articleContent.match(/<ArticleTitle>第([^条]+)条/);
          if (titleMatch) {
            articleNumber = titleMatch[1];
          }
        }
        
        if (!articleNumber) continue;
        
        // 条文タイトル
        const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
        const articleTitle = captionMatch ? captionMatch[1] : null;
        
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
            const sentenceContent = sentenceMatch[1];
            // Sentenceタグ内のテキストを抽出
            const textMatches = sentenceContent.matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
            const texts = [];
            for (const textMatch of textMatches) {
              texts.push(textMatch[1]);
            }
            sentence = texts.join('') || sentenceContent.replace(/<[^>]*>/g, '');
          }
          
          // 号を抽出
          const items: any[] = [];
          const itemMatches = paragraphContent.matchAll(/<Item[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Item>/g);
          
          for (const iMatch of itemMatches) {
            const itemNumber = iMatch[1];
            const itemContent = iMatch[2];
            
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
          articleNumber: this.formatArticleNumber(articleNumber),
          articleTitle: articleTitle,
          content: mainContent,
          sortOrder: this.parseArticleNumber(articleNumber) * 1000, // ソート用の数値
          paragraphs: paragraphs
        });
      }
    }
    
    // ソート順でソート
    articles.sort((a, b) => a.sortOrder - b.sortOrder);
    
    return articles;
  }

  /**
   * 単一法令の処理
   */
  private async processLaw(law: any): Promise<void> {
    try {
      // 既存の条文を取得
      const existingArticles = await prisma.article.findMany({
        where: { lawId: law.id },
        orderBy: { articleNumber: 'asc' }
      });
      
      // XMLから条文を再パース（政令・規則の場合）
      let parsedArticles: any[] = [];
      if (law.lawType === '政令' || law.lawType === '省令' || law.lawType === '規則' || 
          law.lawNumber?.includes('政令') || law.lawNumber?.includes('省令') || law.lawNumber?.includes('規則')) {
        parsedArticles = this.parseGovernmentOrdinanceArticles(law.xmlContent);
      }
      
      // 既存条文のsortOrderと番号表記を更新
      for (const article of existingArticles) {
        const formattedNumber = this.formatArticleNumber(article.articleNumber);
        const sortOrder = Math.floor(this.parseArticleNumber(article.articleNumber) * 1000);
        
        if (formattedNumber !== article.articleNumber || article.sortOrder !== sortOrder) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              articleNumber: formattedNumber,
              sortOrder: sortOrder
            }
          });
          this.stats.updatedArticles++;
        }
      }
      
      // 政令・規則で新たにパースした条文を追加
      if (parsedArticles.length > 0) {
        const existingNumbers = new Set(existingArticles.map(a => a.articleNumber));
        
        for (const parsed of parsedArticles) {
          // 既存にない条文を追加
          if (!existingNumbers.has(parsed.articleNumber)) {
            const created = await prisma.article.create({
              data: {
                lawId: law.id,
                articleNumber: parsed.articleNumber,
                articleTitle: parsed.articleTitle,
                content: parsed.content,
                sortOrder: parsed.sortOrder
              }
            });
            
            // 項を追加
            for (const para of parsed.paragraphs) {
              const paragraph = await prisma.paragraph.create({
                data: {
                  articleId: created.id,
                  paragraphNumber: para.paragraphNumber,
                  content: para.content
                }
              });
              
              // 号を追加
              for (const item of para.items) {
                await prisma.item.create({
                  data: {
                    paragraphId: paragraph.id,
                    itemNumber: item.itemNumber,
                    content: item.content
                  }
                });
              }
            }
            
            this.stats.parsedNewArticles++;
          }
        }
      }
      
      this.stats.processedLaws++;
      
    } catch (error: any) {
      console.error(`❌ エラー (${law.id}): ${error.message?.substring(0, 100)}`);
    }
  }

  /**
   * 全法令の修正処理
   */
  async fixAll(): Promise<void> {
    console.log('🔧 条文の並び順と表記の修正を開始します...\n');
    this.stats.startTime = performance.now();
    
    // 法令数を取得
    const lawCount = await prisma.law.count();
    this.stats.totalLaws = lawCount;
    console.log(`📚 ${lawCount}件の法令を処理します\n`);
    
    const BATCH_SIZE = 10;
    let processed = 0;
    
    while (processed < lawCount) {
      // バッチで法令を取得
      const laws = await prisma.law.findMany({
        skip: processed,
        take: BATCH_SIZE,
        select: {
          id: true,
          title: true,
          lawType: true,
          lawNumber: true,
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
        console.log(`  📝 更新条文: ${this.stats.updatedArticles}`);
        console.log(`  ➕ 新規パース条文: ${this.stats.parsedNewArticles}`);
        console.log(`  ⏱️  速度: ${rate.toFixed(2)}件/秒`);
        if (eta > 0) {
          console.log(`  ⏳ 残り: 約${Math.ceil(eta / 60)}分`);
        }
        console.log();
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
    
    console.log('='.repeat(60));
    console.log('✅ 条文修正完了！');
    console.log('='.repeat(60));
    console.log(`📊 処理統計:`);
    console.log(`  処理法令数: ${this.stats.processedLaws}/${this.stats.totalLaws}`);
    console.log(`  更新条文数: ${this.stats.updatedArticles}`);
    console.log(`  新規パース条文: ${this.stats.parsedNewArticles}`);
    console.log(`  処理時間: ${(elapsed / 60).toFixed(1)}分`);
    console.log();
    console.log('✨ 条文の並び順と表記が修正されました！');
  }
}

// メイン実行
async function main() {
  const fixer = new ArticleOrderFixer();
  
  try {
    await fixer.fixAll();
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