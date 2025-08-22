#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const prisma = new PrismaClient();

interface ArticleData {
  articleNumber: string;
  articleTitle?: string;
  content: string;
  paragraphs: {
    paragraphNumber: number;
    content: string;
    items: {
      itemNumber: string;
      content: string;
    }[];
  }[];
  part?: string;
  chapter?: string;
  section?: string;
  division?: string;
  sortOrder: number;
  isDeleted?: boolean;
}

/**
 * XMLから条文データを抽出
 */
function extractArticlesFromXML(xmlContent: string): ArticleData[] {
  const articles: ArticleData[] = [];
  let sortOrder = 0;
  
  // 本則の条文を抽出
  const mainProvisionMatch = xmlContent.match(/<MainProvision>([\s\S]*?)<\/MainProvision>/);
  if (mainProvisionMatch) {
    const mainContent = mainProvisionMatch[1];
    
    // 各条文を抽出
    const articleMatches = mainContent.matchAll(/<Article\s+[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleXml = match[0];
      const articleContent = match[1];
      
      // 条番号を取得
      const numMatch = articleXml.match(/Num="([^"]+)"/);
      if (!numMatch) continue;
      
      const articleNumber = numMatch[1].replace(/[第条]/g, '');
      
      // 条見出しを取得
      const captionMatch = articleContent.match(/<ArticleCaption[^>]*>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : undefined;
      
      // 削除条文かチェック
      const isDeleted = articleXml.includes('Delete="true"') || articleContent.includes('削除');
      
      // 項を抽出
      const paragraphs: any[] = [];
      const paragraphMatches = articleContent.matchAll(/<Paragraph\s+[^>]*>([\s\S]*?)<\/Paragraph>/g);
      
      let paragraphNumber = 0;
      for (const pMatch of paragraphMatches) {
        paragraphNumber++;
        const paragraphContent = pMatch[1];
        
        // 項本文を取得（Sentenceタグ内のテキストをすべて結合）
        const sentenceMatches = paragraphContent.matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
        let content = '';
        for (const sMatch of sentenceMatches) {
          content += sMatch[1];
        }
        content = content.trim();
        
        // 号を抽出
        const items: any[] = [];
        const itemMatches = paragraphContent.matchAll(/<Item\s+[^>]*>([\s\S]*?)<\/Item>/g);
        
        for (const iMatch of itemMatches) {
          const itemContent = iMatch[1];
          const itemNumMatch = iMatch[0].match(/Num="([^"]+)"/);
          if (itemNumMatch) {
            // 号本文を取得（Sentenceタグ内のテキストをすべて結合）
            const itemSentenceMatches = itemContent.matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
            let itemText = '';
            for (const isMatch of itemSentenceMatches) {
              itemText += isMatch[1];
            }
            items.push({
              itemNumber: itemNumMatch[1],
              content: itemText.trim()
            });
          }
        }
        
        paragraphs.push({
          paragraphNumber,
          content,
          items
        });
      }
      
      // 全体の条文テキストを生成
      let fullContent = '';
      if (articleTitle) {
        fullContent = `（${articleTitle}）\n`;
      }
      for (const para of paragraphs) {
        if (para.content) {
          fullContent += para.content + '\n';
        }
        for (const item of para.items) {
          fullContent += `${item.itemNumber} ${item.content}\n`;
        }
      }
      
      articles.push({
        articleNumber,
        articleTitle,
        content: fullContent.trim() || (isDeleted ? '削除' : ''),
        paragraphs,
        division: '本則',
        sortOrder: sortOrder++,
        isDeleted
      });
    }
  }
  
  // 附則の条文を抽出
  const supplementMatches = xmlContent.matchAll(/<SupplProvision[^>]*>([\s\S]*?)<\/SupplProvision>/g);
  for (const supMatch of supplementMatches) {
    const supContent = supMatch[1];
    
    // 附則の条文を抽出
    const articleMatches = supContent.matchAll(/<Article\s+[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleXml = match[0];
      const articleContent = match[1];
      
      const numMatch = articleXml.match(/Num="([^"]+)"/);
      if (!numMatch) continue;
      
      const articleNumber = numMatch[1].replace(/[第条]/g, '');
      
      const captionMatch = articleContent.match(/<ArticleCaption[^>]*>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : undefined;
      
      const paragraphs: any[] = [];
      const paragraphMatches = articleContent.matchAll(/<Paragraph\s+[^>]*>([\s\S]*?)<\/Paragraph>/g);
      
      let paragraphNumber = 0;
      for (const pMatch of paragraphMatches) {
        paragraphNumber++;
        const paragraphContent = pMatch[1];
        
        const sentenceMatch = paragraphContent.match(/<ParagraphSentence[^>]*>(?:<Sentence[^>]*>)?([^<]+)/);
        const content = sentenceMatch ? sentenceMatch[1].trim() : '';
        
        paragraphs.push({
          paragraphNumber,
          content,
          items: []
        });
      }
      
      let fullContent = '';
      if (articleTitle) {
        fullContent = `（${articleTitle}）\n`;
      }
      for (const para of paragraphs) {
        if (para.content) {
          fullContent += para.content + '\n';
        }
      }
      
      articles.push({
        articleNumber: `附則${articleNumber}`,
        articleTitle,
        content: fullContent.trim(),
        paragraphs,
        division: '附則',
        sortOrder: sortOrder++,
        isDeleted: false
      });
    }
  }
  
  return articles;
}

/**
 * 法令データをインポート
 */
async function importLawData(lawId: string) {
  console.log(chalk.cyan(`\n📚 法令 ${lawId} のデータをインポート中...`));
  
  try {
    // 現在のバージョンを取得
    const currentVersion = await prisma.lawVersion.findFirst({
      where: {
        lawId,
        isLatest: true
      }
    });
    
    if (!currentVersion) {
      console.error(chalk.red(`法令 ${lawId} の現在バージョンが見つかりません`));
      return;
    }
    
    // XMLコンテンツがあるか確認
    if (!currentVersion.xmlContent) {
      console.log(chalk.yellow(`XMLコンテンツがデータベースにありません。ファイルから読み込みます...`));
      
      // XMLファイルを探す
      const lawsDir = path.join(process.cwd(), 'laws_data');
      const dirs = fs.readdirSync(lawsDir).filter(d => d.startsWith(lawId));
      
      if (dirs.length === 0) {
        console.error(chalk.red(`法令 ${lawId} のXMLファイルが見つかりません`));
        return;
      }
      
      // 最新のディレクトリを選択
      const latestDir = dirs.sort().reverse()[0];
      const xmlPath = path.join(lawsDir, latestDir, `${latestDir}.xml`);
      
      if (!fs.existsSync(xmlPath)) {
        console.error(chalk.red(`XMLファイルが見つかりません: ${xmlPath}`));
        return;
      }
      
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      
      // XMLコンテンツをデータベースに保存
      await prisma.lawVersion.update({
        where: { id: currentVersion.id },
        data: { xmlContent }
      });
      
      currentVersion.xmlContent = xmlContent;
      console.log(chalk.green(`✅ XMLコンテンツをデータベースに保存しました`));
    }
    
    // 既存の条文を削除
    await prisma.article.deleteMany({
      where: { versionId: currentVersion.id }
    });
    
    // XMLから条文を抽出
    const articles = extractArticlesFromXML(currentVersion.xmlContent);
    console.log(chalk.cyan(`📝 ${articles.length}個の条文を抽出しました`));
    
    // 条文をデータベースに保存
    for (const article of articles) {
      const createdArticle = await prisma.article.create({
        data: {
          versionId: currentVersion.id,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle,
          content: article.content,
          part: article.part,
          chapter: article.chapter,
          section: article.section,
          division: article.division,
          sortOrder: article.sortOrder,
          isDeleted: article.isDeleted || false
        }
      });
      
      // 項を保存
      for (const paragraph of article.paragraphs) {
        const createdParagraph = await prisma.paragraph.create({
          data: {
            articleId: createdArticle.id,
            paragraphNumber: paragraph.paragraphNumber,
            content: paragraph.content
          }
        });
        
        // 号を保存
        for (const item of paragraph.items) {
          await prisma.item.create({
            data: {
              paragraphId: createdParagraph.id,
              itemNumber: item.itemNumber,
              content: item.content
            }
          });
        }
      }
      
      // 進捗表示
      if (article.sortOrder % 50 === 0) {
        console.log(chalk.gray(`  処理済み: ${article.sortOrder}/${articles.length}`));
      }
    }
    
    console.log(chalk.green(`✅ 法令 ${lawId} のインポートが完了しました（${articles.length}条）`));
    
  } catch (error) {
    console.error(chalk.red(`❌ エラー: ${error}`));
  }
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.yellow('使用方法: npx tsx scripts/import-law-data.ts [法令ID]'));
    console.log(chalk.yellow('例: npx tsx scripts/import-law-data.ts 129AC0000000089'));
    console.log(chalk.cyan('\n主要な法令をインポートします...'));
    
    // 主要な法令をインポート
    const majorLaws = [
      '129AC0000000089', // 民法
      '132AC0000000048', // 商法
      '140AC0000000045', // 刑法
      '417AC0000000086', // 会社法
      '322AC0000000049'  // 労働基準法
    ];
    
    for (const lawId of majorLaws) {
      await importLawData(lawId);
    }
  } else {
    await importLawData(args[0]);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);