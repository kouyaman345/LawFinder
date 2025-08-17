#!/usr/bin/env npx tsx
/**
 * XMLファイルから民法の条文データを完全に復元するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 漢数字変換
function arabicToKanji(num: number): string {
  if (num === 0) return '〇';
  
  const kanjiDigits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
  if (num < 10) return kanjiDigits[num];
  if (num === 10) return '十';
  if (num < 20) return '十' + kanjiDigits[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return kanjiDigits[tens] + '十' + (ones > 0 ? kanjiDigits[ones] : '');
  }
  if (num === 100) return '百';
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    let result = (hundreds === 1 ? '' : kanjiDigits[hundreds]) + '百';
    if (remainder > 0) {
      if (remainder < 10) {
        result += kanjiDigits[remainder];
      } else if (remainder === 10) {
        result += '十';
      } else if (remainder < 20) {
        result += '十' + kanjiDigits[remainder - 10];
      } else {
        const tens = Math.floor(remainder / 10);
        const ones = remainder % 10;
        result += kanjiDigits[tens] + '十' + (ones > 0 ? kanjiDigits[ones] : '');
      }
    }
    return result;
  }
  if (num === 1000) return '千';
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    let result = (thousands === 1 ? '' : kanjiDigits[thousands]) + '千';
    if (remainder > 0) {
      result += arabicToKanji(remainder);
    }
    return result;
  }
  
  return num.toString();
}

async function restoreArticles() {
  console.log('📝 XMLから民法の条文データを復元します...');
  
  const xmlPath = 'laws_data/129AC0000000089_20280613_505AC0000000053/129AC0000000089_20280613_505AC0000000053.xml';
  const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
  
  // 既存の民法条文をすべて削除
  console.log('🗑️  既存の民法条文を削除中...');
  await prisma.paragraph.deleteMany({
    where: {
      article: {
        lawId: '129AC0000000089'
      }
    }
  });
  await prisma.article.deleteMany({
    where: {
      lawId: '129AC0000000089'
    }
  });
  console.log('✅ 削除完了');
  
  // 条文を抽出して処理
  const articleRegex = /<Article\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g;
  let match;
  let articlesCreated = 0;
  let articlesToCreate = [];
  let paragraphsToCreate = [];
  
  while ((match = articleRegex.exec(xmlContent)) !== null) {
    const articleNum = parseInt(match[1], 10);
    const articleContent = match[2];
    
    // ArticleCaption（見出し）を抽出
    const captionMatch = articleContent.match(/<ArticleCaption>(.*?)<\/ArticleCaption>/);
    const caption = captionMatch ? captionMatch[1] : '';
    
    // 漢数字の条番号
    const kanjiNum = arabicToKanji(articleNum);
    
    // 条文データを作成（UUIDを使用）
    const articleId = `${Date.now()}_${articleNum}_${Math.random().toString(36).substring(2, 9)}`;
    articlesToCreate.push({
      id: articleId,
      lawId: '129AC0000000089',
      articleNumber: kanjiNum,
      articleTitle: caption,
      sortOrder: articleNum,
      isDeleted: false,
      content: ''  // 後で段落から構築
    });
    
    // 段落を抽出
    const paragraphRegex = /<Paragraph\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Paragraph>/g;
    let paraMatch;
    let paragraphNum = 0;
    
    while ((paraMatch = paragraphRegex.exec(articleContent)) !== null) {
      paragraphNum++;
      const paragraphContent = paraMatch[2];
      
      // ParagraphSentenceを抽出
      const sentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
      if (sentenceMatch) {
        const sentence = sentenceMatch[1]
          .replace(/<[^>]+>/g, '') // HTMLタグを除去
          .replace(/\s+/g, '')      // 空白を除去
          .trim();
        
        if (sentence) {
          paragraphsToCreate.push({
            id: `${articleId}_para${paragraphNum}`,
            articleId: articleId,
            paragraphNumber: paragraphNum,
            content: sentence,
            items: []
          });
        }
      }
    }
    
    articlesCreated++;
    if (articlesCreated % 100 === 0) {
      console.log(`  ${articlesCreated}条処理済み...`);
    }
  }
  
  // バッチで作成
  console.log(`\n📚 ${articlesToCreate.length}条、${paragraphsToCreate.length}項を登録中...`);
  
  await prisma.article.createMany({
    data: articlesToCreate
  });
  
  await prisma.paragraph.createMany({
    data: paragraphsToCreate
  });
  
  console.log('✅ 登録完了');
  
  // 第99-102条の確認
  console.log('\n📋 第99条〜第102条の確認:');
  const checkArticles = await prisma.article.findMany({
    where: {
      lawId: '129AC0000000089',
      sortOrder: {
        gte: 99,
        lte: 102
      }
    },
    orderBy: { sortOrder: 'asc' },
    include: {
      paragraphs: {
        orderBy: { paragraphNumber: 'asc' },
        take: 1
      }
    }
  });
  
  for (const article of checkArticles) {
    console.log(`第${article.articleNumber}条 ${article.articleTitle}`);
    if (article.paragraphs[0]) {
      console.log(`  第1項: ${article.paragraphs[0].content.substring(0, 50)}...`);
    }
  }
  
  console.log('\n✅ XMLからの復元が完了しました');
}

// 実行
if (require.main === module) {
  restoreArticles()
    .then(() => prisma.$disconnect())
    .catch((error) => {
      console.error('❌ エラー:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}