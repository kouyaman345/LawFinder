#!/usr/bin/env npx tsx
/**
 * 削除条文の処理スクリプト
 * 
 * XMLファイルから削除条文（範囲表記）を検出し、
 * 個別の削除条文としてデータベースに登録する
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 漢数字変換
function kanjiToNumber(kanji: string): number {
  const kanjiMap: { [key: string]: number } = {
    '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000
  };
  
  let result = 0;
  let temp = 0;
  
  for (const char of kanji) {
    const num = kanjiMap[char];
    if (num >= 10) {
      result += (temp || 1) * num;
      temp = 0;
    } else if (num !== undefined) {
      temp = temp * 10 + num;
    }
  }
  
  return result + temp;
}

function numberToKanji(num: number): string {
  if (num === 0) return '〇';
  
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
  if (num < 10) return digits[num];
  if (num === 10) return '十';
  if (num < 20) return '十' + digits[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return digits[tens] + '十' + (ones > 0 ? digits[ones] : '');
  }
  if (num === 100) return '百';
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    let result = (hundreds === 1 ? '' : digits[hundreds]) + '百';
    if (remainder > 0) {
      if (remainder < 10) {
        result += digits[remainder];
      } else if (remainder === 10) {
        result += '十';
      } else if (remainder < 20) {
        result += '十' + digits[remainder - 10];
      } else {
        const tens = Math.floor(remainder / 10);
        const ones = remainder % 10;
        result += digits[tens] + '十' + (ones > 0 ? digits[ones] : '');
      }
    }
    return result;
  }
  if (num === 1000) return '千';
  
  return num.toString();
}

/**
 * 削除条文範囲を処理
 */
async function processDeletedRange(lawId: string, xmlPath: string) {
  console.log(`\n📝 ${lawId} の削除条文を処理中...`);
  
  const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
  
  // 削除条文の範囲表記を検出（例: <Article Num="618:683">）
  const rangeRegex = /<Article\s+Num="(\d+):(\d+)"[^>]*>([\s\S]*?)<\/Article>/g;
  let match;
  const deletedRanges: Array<{ start: number; end: number; title: string }> = [];
  
  while ((match = rangeRegex.exec(xmlContent)) !== null) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const content = match[3];
    
    // タイトルを抽出
    const titleMatch = content.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
    const title = titleMatch ? titleMatch[1] : `第${numberToKanji(start)}条から第${numberToKanji(end)}条まで`;
    
    deletedRanges.push({ start, end, title });
    console.log(`  範囲削除を検出: ${title}`);
  }
  
  // 個別の削除条文も検出
  const singleDeletedRegex = /<Article\s+Num="(\d+)"[^>]*Delete="true"[^>]*>([\s\S]*?)<\/Article>/g;
  const singleDeleted: number[] = [];
  
  while ((match = singleDeletedRegex.exec(xmlContent)) !== null) {
    const num = parseInt(match[1], 10);
    singleDeleted.push(num);
  }
  
  // 「削除」というコンテンツを持つ条文も検出
  const deletedContentRegex = /<Article\s+Num="(\d+)"[^>]*>([\s\S]*?)<ParagraphSentence>\s*<Sentence[^>]*>削除<\/Sentence>\s*<\/ParagraphSentence>[\s\S]*?<\/Article>/g;
  
  while ((match = deletedContentRegex.exec(xmlContent)) !== null) {
    const num = parseInt(match[1], 10);
    if (!singleDeleted.includes(num)) {
      singleDeleted.push(num);
    }
  }
  
  // データベースに登録
  const articlesToCreate = [];
  
  // 範囲削除の処理
  for (const range of deletedRanges) {
    // 範囲全体を表す条文を作成
    const rangeId = `${lawId}_range_${range.start}_${range.end}`;
    
    // 既存のチェック
    const existing = await prisma.article.findFirst({
      where: {
        lawId,
        articleNumber: {
          in: [`${range.start}:${range.end}`, `${numberToKanji(range.start)}から${numberToKanji(range.end)}まで`]
        }
      }
    });
    
    if (!existing) {
      articlesToCreate.push({
        id: rangeId,
        lawId,
        articleNumber: `${numberToKanji(range.start)}から${numberToKanji(range.end)}まで`,
        articleTitle: '削除',
        sortOrder: range.start,
        isDeleted: true,
        content: ''
      });
    }
    
    // 個別の削除条文も作成（表示用）
    for (let i = range.start; i <= range.end; i++) {
      const articleNum = numberToKanji(i);
      const articleId = `${lawId}_deleted_${i}`;
      
      // 既存チェック
      const existing = await prisma.article.findFirst({
        where: {
          lawId,
          articleNumber: articleNum
        }
      });
      
      if (!existing) {
        articlesToCreate.push({
          id: articleId,
          lawId,
          articleNumber: articleNum,
          articleTitle: '削除',
          sortOrder: i,
          isDeleted: true,
          content: ''
        });
      }
    }
  }
  
  // 個別削除条文の処理
  for (const num of singleDeleted) {
    const articleNum = numberToKanji(num);
    const articleId = `${lawId}_deleted_${num}`;
    
    // 既存チェック
    const existing = await prisma.article.findFirst({
      where: {
        lawId,
        articleNumber: articleNum
      }
    });
    
    if (!existing) {
      articlesToCreate.push({
        id: articleId,
        lawId,
        articleNumber: articleNum,
        articleTitle: '削除',
        sortOrder: num,
        isDeleted: true,
        content: ''
      });
    } else if (!existing.isDeleted) {
      // 既存条文を削除フラグに更新
      await prisma.article.update({
        where: { id: existing.id },
        data: { isDeleted: true, articleTitle: '削除' }
      });
      console.log(`  第${articleNum}条を削除条文に更新`);
    }
  }
  
  // バッチ作成
  if (articlesToCreate.length > 0) {
    await prisma.article.createMany({
      data: articlesToCreate,
      skipDuplicates: true
    });
    console.log(`  ✅ ${articlesToCreate.length}件の削除条文を登録`);
  }
  
  return {
    ranges: deletedRanges.length,
    singles: singleDeleted.length,
    total: articlesToCreate.length
  };
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  const targetLawId = args[0];
  
  try {
    if (targetLawId) {
      // 特定法令の処理
      const xmlPath = `laws_data/sample/${targetLawId}.xml`;
      if (!fs.existsSync(xmlPath)) {
        console.error(`XMLファイルが見つかりません: ${xmlPath}`);
        return;
      }
      
      const result = await processDeletedRange(targetLawId, xmlPath);
      console.log(`\n✅ 処理完了: 範囲${result.ranges}件、個別${result.singles}件、計${result.total}件`);
    } else {
      // 全法令の処理
      const xmlFiles = fs.readdirSync('laws_data/sample').filter(f => f.endsWith('.xml'));
      let totalProcessed = 0;
      
      for (const xmlFile of xmlFiles) {
        const lawId = xmlFile.replace('.xml', '');
        const xmlPath = `laws_data/sample/${xmlFile}`;
        
        const result = await processDeletedRange(lawId, xmlPath);
        totalProcessed += result.total;
      }
      
      console.log(`\n✅ 全体処理完了: ${totalProcessed}件の削除条文を処理`);
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  main();
}