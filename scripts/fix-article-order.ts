#!/usr/bin/env npx tsx
/**
 * 民法の条文順序を修正するスクリプト
 * XMLファイルから正しい順序を取得してデータベースを更新
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 漢数字変換テーブル
const kanjiToArabic: { [key: string]: number } = {
  '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '二十': 20, '三十': 30, '四十': 40, '五十': 50,
  '六十': 60, '七十': 70, '八十': 80, '九十': 90,
  '百': 100, '千': 1000
};

// アラビア数字から漢数字への変換
function arabicToKanji(num: number): string {
  if (num === 0) return '〇';
  
  const kanjiDigits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];
  
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
  
  return num.toString(); // 1000以上はそのまま
}

// 条番号を数値に変換（ソート用）
function parseArticleNumber(articleNum: string): number {
  // 枝番号を考慮（例: "九十八の二" -> 98.2）
  const match = articleNum.match(/^(.+?)の(.+)$/);
  if (match) {
    const base = parseKanjiNumber(match[1]);
    const branch = parseKanjiNumber(match[2]);
    return base + branch / 100; // 枝番号は小数点で表現
  }
  
  return parseKanjiNumber(articleNum);
}

// 漢数字を数値に変換
function parseKanjiNumber(kanji: string): number {
  // すでにアラビア数字の場合
  if (/^\d+$/.test(kanji)) {
    return parseInt(kanji, 10);
  }
  
  let result = 0;
  let temp = 0;
  
  for (let i = 0; i < kanji.length; i++) {
    const char = kanji[i];
    const num = kanjiToArabic[char];
    
    if (num === undefined) {
      // 複合文字をチェック
      const twoChar = kanji.substring(i, i + 2);
      const twoNum = kanjiToArabic[twoChar];
      if (twoNum !== undefined) {
        if (twoNum >= 10) {
          result += (temp || 1) * twoNum;
          temp = 0;
        } else {
          temp = temp * 10 + twoNum;
        }
        i++; // 2文字分進める
        continue;
      }
    }
    
    if (num !== undefined) {
      if (num >= 10) {
        if (num === 10 && temp === 0) {
          temp = 10;
        } else {
          result += (temp || 1) * num;
          temp = 0;
        }
      } else {
        temp = temp * 10 + num;
      }
    }
  }
  
  return result + temp;
}

async function fixArticleOrder() {
  console.log('📝 民法の条文順序を修正します...');
  
  // XMLファイルを読み込み
  const xmlPath = 'laws_data/129AC0000000089_20280613_505AC0000000053/129AC0000000089_20280613_505AC0000000053.xml';
  const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
  
  // 条文を抽出
  const articleRegex = /<Article\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g;
  const articles: Array<{ num: number; kanjiNum: string; title: string }> = [];
  
  let match;
  while ((match = articleRegex.exec(xmlContent)) !== null) {
    const articleNum = parseInt(match[1], 10);
    const articleContent = match[2];
    
    // タイトルを抽出
    const titleMatch = articleContent.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
    const title = titleMatch ? titleMatch[1] : '';
    
    // 漢数字の条番号を生成
    const kanjiNum = arabicToKanji(articleNum);
    
    articles.push({
      num: articleNum,
      kanjiNum: kanjiNum,
      title: title
    });
  }
  
  console.log(`✅ XMLから${articles.length}条を抽出しました`);
  
  // データベースの条文を更新
  for (const article of articles) {
    // 現在の条文を検索（タイトルで照合）
    const existingArticles = await prisma.article.findMany({
      where: {
        lawId: '129AC0000000089',
        OR: [
          { articleNumber: article.kanjiNum },
          { articleNumber: article.num.toString() },
          { articleTitle: { contains: article.title.substring(0, 10) } }
        ]
      }
    });
    
    if (existingArticles.length > 0) {
      // 最初にマッチした条文を更新
      const targetArticle = existingArticles[0];
      await prisma.article.update({
        where: { id: targetArticle.id },
        data: {
          articleNumber: article.kanjiNum,
          sortOrder: article.num,
          articleTitle: article.title
        }
      });
      console.log(`更新: 第${article.kanjiNum}条 (sortOrder: ${article.num})`);
      
      // 重複を削除
      if (existingArticles.length > 1) {
        const duplicateIds = existingArticles.slice(1).map(a => a.id);
        await prisma.article.deleteMany({
          where: { id: { in: duplicateIds } }
        });
        console.log(`  -> ${duplicateIds.length}件の重複を削除`);
      }
    } else {
      console.log(`⚠️  第${article.kanjiNum}条が見つかりません: ${article.title}`);
    }
  }
  
  // 第99条〜第102条の確認
  console.log('\n📋 第99条〜第102条の確認:');
  const checkArticles = await prisma.article.findMany({
    where: {
      lawId: '129AC0000000089',
      sortOrder: {
        gte: 99,
        lte: 102
      }
    },
    orderBy: { sortOrder: 'asc' }
  });
  
  for (const article of checkArticles) {
    console.log(`  第${article.articleNumber}条 (sortOrder: ${article.sortOrder}): ${article.articleTitle}`);
  }
  
  console.log('\n✅ 条文順序の修正が完了しました');
}

// 実行
if (require.main === module) {
  fixArticleOrder()
    .then(() => prisma.$disconnect())
    .catch((error) => {
      console.error('❌ エラー:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}