#!/usr/bin/env npx tsx
/**
 * PostgreSQL法令データベース構築スクリプト
 * 法令XMLを解析してPostgreSQLにインポート
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

      // 章・節の抽出（親要素から）
      const chapterMatch = xml.substring(0, articleMatch.index).match(/<Chapter[^>]*Num="([^"]+)"[^>]*>[\s\S]*?<ChapterTitle>([^<]+)<\/ChapterTitle>/g);
      if (chapterMatch && chapterMatch.length > 0) {
        const lastChapter = chapterMatch[chapterMatch.length - 1];
        const chapterTitleMatch = lastChapter.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
        if (chapterTitleMatch) {
          article.chapter = chapterTitleMatch[1];
        }
      }

      // 項の抽出
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

async function importLaws() {
  console.log('🚀 PostgreSQL法令データベースの構築を開始します...\n');
  const startTime = performance.now();
  
  const parser = new SimpleXMLParser();
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    articles: 0,
    paragraphs: 0,
    items: 0
  };

  // インポート対象の法令
  const targetLaws = [
    { id: '129AC0000000089', name: '民法' },
    { id: '140AC0000000045', name: '刑法' },
    { id: '322AC0000000049', name: '労働基準法' },
    { id: '417AC0000000086', name: '会社法' },
    { id: '132AC0000000048', name: '商法' }
  ];

  for (const lawInfo of targetLaws) {
    stats.total++;
    console.log(`\n📖 ${lawInfo.name}（${lawInfo.id}）を処理中...`);
    
    try {
      // XMLファイルを探す
      const xmlPath = findXmlFile(lawInfo.id);
      if (!xmlPath) {
        throw new Error('XMLファイルが見つかりません');
      }

      console.log(`  📁 XMLファイル: ${xmlPath}`);
      const xml = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = parser.parse(xml);
      console.log(`  📊 ${parsed.articles.length}条を検出`);

      // トランザクションでデータベースに保存
      await prisma.$transaction(async (tx) => {
        // 既存データの削除（カスケード削除のため、法令を削除すれば関連データも削除される）
        const existingLaw = await tx.law.findUnique({
          where: { id: lawInfo.id }
        });
        
        if (existingLaw) {
          await tx.law.delete({ 
            where: { id: lawInfo.id } 
          });
          console.log(`  🗑️  既存データを削除`);
        }

        // 法令作成
        const law = await tx.law.create({
          data: {
            id: lawInfo.id,
            title: parsed.title || lawInfo.name,
            lawNumber: parsed.lawNumber,
            lawType: '法律',
            xmlContent: xml,
            status: '現行'
          }
        });

        // 条文作成（重複チェック付き）
        let sortOrder = 0;
        const seenArticles = new Set<string>();
        
        for (const articleData of parsed.articles) {
          // 重複チェック
          if (seenArticles.has(articleData.number)) {
            console.log(`  ⚠️  重複条番号をスキップ: ${articleData.number}`);
            continue;
          }
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
            stats.paragraphs++;

            // 号作成
            for (const itemData of paragraphData.items) {
              await tx.item.create({
                data: {
                  paragraphId: paragraph.id,
                  itemNumber: itemData.number,
                  content: itemData.content
                }
              });
              stats.items++;
            }
          }
        }
      }, {
        timeout: 60000 // 60秒のタイムアウト
      });

      stats.success++;
      console.log(`✅ ${lawInfo.name} のインポート完了（${parsed.articles.length}条）`);
      
    } catch (error: any) {
      stats.failed++;
      console.error(`❌ ${lawInfo.name} のインポート失敗:`, error.message);
    }
  }

  const elapsed = (performance.now() - startTime) / 1000;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 インポート結果');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${stats.success}/${stats.total} 法令`);
  console.log(`📄 条文数: ${stats.articles}`);
  console.log(`📝 項数: ${stats.paragraphs}`);
  console.log(`📌 号数: ${stats.items}`);
  if (stats.failed > 0) {
    console.log(`❌ 失敗: ${stats.failed} 法令`);
  }
  console.log(`⏱️  処理時間: ${elapsed.toFixed(2)}秒`);
  console.log('='.repeat(60));
}

function findXmlFile(lawId: string): string | null {
  const lawsDataPath = './laws_data';
  
  // サンプルディレクトリを優先的にチェック
  const samplePath = path.join(lawsDataPath, 'sample', `${lawId}.xml`);
  if (fs.existsSync(samplePath)) {
    return samplePath;
  }

  // メインディレクトリから検索
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

// 実行
importLaws()
  .then(async () => {
    console.log('\n✅ PostgreSQL法令データベースの構築が完了しました！');
    
    // データ件数の確認
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    console.log(`\n📊 データベース統計:`);
    console.log(`  法令数: ${lawCount}`);
    console.log(`  条文総数: ${articleCount}`);
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラー:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });