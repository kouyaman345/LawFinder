#!/usr/bin/env npx tsx
/**
 * SQLite法令データベース構築スクリプト（簡易版）
 * PostgreSQL移行前のテスト用
 */

import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const prisma = new PrismaClient();

// XMLパーサー（簡易版）
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
  console.log('📚 法令データベースの構築を開始します...\n');
  const startTime = performance.now();
  
  const parser = new SimpleXMLParser();
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    articles: 0
  };

  // サンプル法令のリスト
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

      const xml = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = parser.parse(xml);

      // データベースに保存
      await prisma.$transaction(async (tx) => {
        // 既存データの削除
        await tx.reference.deleteMany({ where: { fromArticleId: { contains: lawInfo.id } } });
        await tx.item.deleteMany({ where: { paragraph: { article: { lawId: lawInfo.id } } } });
        await tx.paragraph.deleteMany({ where: { article: { lawId: lawInfo.id } } });
        await tx.article.deleteMany({ where: { lawId: lawInfo.id } });
        await tx.law.deleteMany({ where: { id: lawInfo.id } });

        // 法令作成
        const law = await tx.law.create({
          data: {
            id: lawInfo.id,
            title: parsed.title || lawInfo.name,
            lawNumber: parsed.lawNumber,
            lawType: '法律',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        // 条文作成
        for (const articleData of parsed.articles) {
          const article = await tx.article.create({
            data: {
              lawId: law.id,
              articleNumber: articleData.number,
              articleTitle: articleData.title,
              content: articleData.content || '',
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
      });

      stats.success++;
      console.log(`✅ ${lawInfo.name} のインポート完了（${parsed.articles.length}条）`);
      
    } catch (error) {
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
  .then(() => {
    console.log('\n✅ 法令データベースの構築が完了しました！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラー:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });