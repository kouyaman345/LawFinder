#!/usr/bin/env npx tsx
/**
 * 追加法令インポートスクリプト
 * laws_dataディレクトリから追加の法令をPostgreSQLにインポート
 */

import { PrismaClient } from '../src/generated/prisma-pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const prisma = new PrismaClient();

// 簡易XMLパーサー
class SimpleXMLParser {
  parse(xml: string): any {
    const result: any = {
      articles: []
    };

    // 法令名の抽出
    const titleMatch = xml.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    result.title = titleMatch ? titleMatch[1] : '無題';

    // 法令番号の抽出
    const numMatch = xml.match(/<LawNum>([^<]+)<\/LawNum>/);
    result.lawNumber = numMatch ? numMatch[1] : null;

    // 条文の抽出
    const articleRegex = /<Article[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g;
    let articleMatch;
    
    while ((articleMatch = articleRegex.exec(xml)) !== null) {
      const article: any = {
        number: articleMatch[1],
        content: '',
        paragraphs: []
      };

      // 条見出しの抽出
      const titleMatch = articleMatch[2].match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      if (titleMatch) {
        article.title = titleMatch[1];
      }

      // 章・節の抽出
      const chapterMatch = xml.substring(0, articleMatch.index).match(/<Chapter[^>]*Num="([^"]+)"[^>]*>[\s\S]*?<ChapterTitle>([^<]+)<\/ChapterTitle>/g);
      if (chapterMatch && chapterMatch.length > 0) {
        const lastChapter = chapterMatch[chapterMatch.length - 1];
        const chapterTitleMatch = lastChapter.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
        if (chapterTitleMatch) {
          article.chapter = chapterTitleMatch[1];
        }
      }

      // 項の抽出（簡略化）
      const paragraphRegex = /<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g;
      let paragraphMatch;
      let paragraphNum = 1;
      
      while ((paragraphMatch = paragraphRegex.exec(articleMatch[2])) !== null) {
        const paragraph: any = {
          number: paragraphNum++,
          content: this.extractText(paragraphMatch[1]),
          items: []
        };

        // 号の抽出
        const itemRegex = /<Item[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Item>/g;
        let itemMatch;
        
        while ((itemMatch = itemRegex.exec(paragraphMatch[1])) !== null) {
          paragraph.items.push({
            number: itemMatch[1],
            content: this.extractText(itemMatch[2])
          });
        }

        article.paragraphs.push(paragraph);
      }

      // 第1項の内容を条文本文として設定
      if (article.paragraphs.length > 0) {
        article.content = article.paragraphs[0].content;
      }

      result.articles.push(article);
    }

    return result;
  }

  private extractText(xml: string): string {
    return xml.replace(/<[^>]+>/g, '').trim();
  }
}

async function importAdditionalLaws() {
  console.log('🚀 追加法令のインポートを開始します...\n');
  const startTime = performance.now();
  
  const parser = new SimpleXMLParser();
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    articles: 0
  };

  // 既にインポート済みの法令を取得
  const existingLaws = await prisma.law.findMany({
    select: { id: true }
  });
  const existingIds = new Set(existingLaws.map(l => l.id));
  console.log(`📊 既存の法令: ${existingIds.size}件\n`);

  // laws_dataディレクトリから法令を探す
  const lawsDataPath = './laws_data';
  const dirs = fs.readdirSync(lawsDataPath);
  
  // 追加対象の法令IDを収集（最大20件）
  const targetLawIds: string[] = [];
  for (const dir of dirs) {
    if (dir.length >= 15 && dir.includes('AC')) { // 法令IDパターン
      const lawId = dir.substring(0, 15); // 最初の15文字が法令ID
      if (!existingIds.has(lawId) && !targetLawIds.includes(lawId)) {
        targetLawIds.push(lawId);
        if (targetLawIds.length >= 20) break; // 最大20件
      }
    }
  }

  console.log(`📚 ${targetLawIds.length}件の新規法令をインポートします\n`);

  for (const lawId of targetLawIds) {
    stats.total++;
    
    try {
      // XMLファイルを探す
      const xmlPath = findXmlFile(lawId);
      if (!xmlPath) {
        console.log(`⚠️  ${lawId}: XMLファイルが見つかりません`);
        stats.skipped++;
        continue;
      }

      const xml = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = parser.parse(xml);
      
      console.log(`📖 ${parsed.title || lawId}（${lawId}）`);
      console.log(`  📊 ${parsed.articles.length}条を検出`);

      // トランザクションでデータベースに保存
      await prisma.$transaction(async (tx) => {
        // 法令作成
        const law = await tx.law.create({
          data: {
            id: lawId,
            title: parsed.title || `法令 ${lawId}`,
            lawNumber: parsed.lawNumber,
            lawType: detectLawType(parsed.title),
            xmlContent: xml,
            status: '現行'
          }
        });

        // 条文作成（重複チェック付き）
        let sortOrder = 0;
        const seenArticles = new Set<string>();
        
        for (const articleData of parsed.articles) {
          if (seenArticles.has(articleData.number)) continue;
          seenArticles.add(articleData.number);
          
          const article = await tx.article.create({
            data: {
              lawId: law.id,
              articleNumber: articleData.number,
              articleTitle: articleData.title,
              content: articleData.content || '',
              chapter: articleData.chapter,
              section: articleData.section,
              sortOrder: sortOrder++,
              isDeleted: false
            }
          });
          stats.articles++;

          // 項作成
          for (const paragraphData of articleData.paragraphs) {
            const paragraph = await tx.paragraph.create({
              data: {
                articleId: article.id,
                paragraphNumber: paragraphData.number,
                content: paragraphData.content
              }
            });

            // 号作成
            for (const itemData of paragraphData.items) {
              await tx.item.create({
                data: {
                  paragraphId: paragraph.id,
                  itemNumber: itemData.number,
                  content: itemData.content
                }
              });
            }
          }
        }
      }, {
        timeout: 60000
      });

      stats.success++;
      console.log(`  ✅ インポート完了\n`);
      
    } catch (error: any) {
      stats.failed++;
      console.error(`  ❌ エラー: ${error.message}\n`);
    }
  }

  const elapsed = (performance.now() - startTime) / 1000;
  
  console.log('='.repeat(60));
  console.log('📊 インポート結果');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${stats.success}/${stats.total} 法令`);
  console.log(`⚠️  スキップ: ${stats.skipped} 法令`);
  console.log(`❌ 失敗: ${stats.failed} 法令`);
  console.log(`📄 新規条文数: ${stats.articles}`);
  console.log(`⏱️  処理時間: ${elapsed.toFixed(2)}秒`);
  console.log('='.repeat(60));
}

function findXmlFile(lawId: string): string | null {
  const lawsDataPath = './laws_data';
  
  // ディレクトリから検索
  const dirs = fs.readdirSync(lawsDataPath);
  for (const dir of dirs) {
    if (dir.startsWith(lawId)) {
      const dirPath = path.join(lawsDataPath, dir);
      if (fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        if (xmlFile) {
          return path.join(dirPath, xmlFile);
        }
      }
    }
  }
  
  return null;
}

function detectLawType(title: string): string {
  if (!title) return '法律';
  if (title.includes('憲法')) return '憲法';
  if (title.includes('法律')) return '法律';
  if (title.includes('政令')) return '政令';
  if (title.includes('省令')) return '省令';
  if (title.includes('規則')) return '規則';
  if (title.includes('条例')) return '条例';
  return '法律';
}

// 実行
importAdditionalLaws()
  .then(async () => {
    // データ件数の確認
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    console.log(`\n📊 データベース統計:`);
    console.log(`  法令総数: ${lawCount}`);
    console.log(`  条文総数: ${articleCount}`);
    
    console.log('\n✅ 追加インポートが完了しました！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラー:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });