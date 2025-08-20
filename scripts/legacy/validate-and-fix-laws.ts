#!/usr/bin/env npx tsx
/**
 * 法令データの検証と修正を行う統合スクリプト
 * 
 * 機能:
 * 1. 重複条文のチェックと削除
 * 2. 条文番号の整合性チェック
 * 3. 条文タイトルの修正
 * 4. sortOrderの自動設定
 * 5. 欠落条文の検出
 * 
 * 使用方法:
 *   全法令をチェック: npx tsx scripts/validate-and-fix-laws.ts
 *   特定法令をチェック: npx tsx scripts/validate-and-fix-laws.ts 129AC0000000089
 *   修正モード: npx tsx scripts/validate-and-fix-laws.ts --fix
 *   詳細表示: npx tsx scripts/validate-and-fix-laws.ts --verbose
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// コマンドライン引数の解析
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const verbose = args.includes('--verbose');
const targetLawId = args.find(arg => !arg.startsWith('--'));

// 漢数字変換テーブル
const kanjiNumbers: { [key: string]: number } = {
  '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '百': 100, '千': 1000, '万': 10000
};

/**
 * 漢数字を数値に変換
 */
function kanjiToNumber(kanji: string): number {
  // すでにアラビア数字の場合
  if (/^\d+$/.test(kanji)) {
    return parseInt(kanji, 10);
  }
  
  // 「の」で分割（例: 九十八の二）
  if (kanji.includes('の')) {
    const parts = kanji.split('の');
    const base = kanjiToNumber(parts[0]);
    const sub = kanjiToNumber(parts[1]);
    return base + sub / 1000; // 枝番号は小数で表現
  }
  
  let result = 0;
  let temp = 0;
  let prevNum = 0;
  
  for (let i = 0; i < kanji.length; i++) {
    const char = kanji[i];
    const num = kanjiNumbers[char];
    
    if (num === undefined) continue;
    
    if (num === 10 || num === 100 || num === 1000 || num === 10000) {
      if (temp === 0) temp = 1;
      result += temp * num;
      temp = 0;
    } else {
      if (prevNum === 10 || prevNum === 100 || prevNum === 1000) {
        result += num;
      } else {
        temp = temp * 10 + num;
      }
    }
    prevNum = num;
  }
  
  return result + temp;
}

/**
 * 数値を漢数字に変換
 */
function numberToKanji(num: number): string {
  if (num === 0) return '〇';
  
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
  // 小数部分がある場合（枝番号）
  if (num % 1 !== 0) {
    const base = Math.floor(num);
    const sub = Math.round((num - base) * 1000);
    return `${numberToKanji(base)}の${numberToKanji(sub)}`;
  }
  
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
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    return (thousands === 1 ? '' : digits[thousands]) + '千' + (remainder > 0 ? numberToKanji(remainder) : '');
  }
  
  return num.toString(); // 10000以上は対応しない
}

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  issues: {
    duplicates: Array<{ articleNumber: string; count: number }>;
    missingArticles: number[];
    wrongFormat: Array<{ articleNumber: string; expected: string }>;
    missingSortOrder: string[];
    invalidTitles: Array<{ articleNumber: string; title: string }>;
  };
  stats: {
    totalArticles: number;
    deletedArticles: number;
    validArticles: number;
  };
}

/**
 * 法令データの検証
 */
async function validateLaw(lawId: string): Promise<ValidationResult> {
  const law = await prisma.law.findUnique({
    where: { id: lawId },
    include: {
      articles: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  if (!law) {
    throw new Error(`法令が見つかりません: ${lawId}`);
  }

  const result: ValidationResult = {
    lawId: law.id,
    lawTitle: law.title,
    issues: {
      duplicates: [],
      missingArticles: [],
      wrongFormat: [],
      missingSortOrder: [],
      invalidTitles: []
    },
    stats: {
      totalArticles: law.articles.length,
      deletedArticles: law.articles.filter(a => a.isDeleted).length,
      validArticles: 0
    }
  };

  // 1. 重複チェック
  const articleCounts = new Map<string, number>();
  for (const article of law.articles) {
    const count = articleCounts.get(article.articleNumber) || 0;
    articleCounts.set(article.articleNumber, count + 1);
  }
  
  for (const [articleNumber, count] of articleCounts) {
    if (count > 1) {
      result.issues.duplicates.push({ articleNumber, count });
    }
  }

  // 2. 条文番号の形式チェック
  const articleNumbers = new Set<number>();
  for (const article of law.articles) {
    if (article.isDeleted) continue;
    
    const numValue = kanjiToNumber(article.articleNumber);
    articleNumbers.add(Math.floor(numValue)); // 枝番号を除く
    
    // アラビア数字が混在していないかチェック
    if (/^\d+/.test(article.articleNumber)) {
      const expected = numberToKanji(numValue);
      if (article.articleNumber !== expected) {
        result.issues.wrongFormat.push({
          articleNumber: article.articleNumber,
          expected
        });
      }
    }
    
    // sortOrderのチェック
    if (article.sortOrder === 0 || article.sortOrder === null) {
      result.issues.missingSortOrder.push(article.articleNumber);
    }
    
    // タイトルのチェック（タイトルが条番号の繰り返しになっていないか）
    if (article.articleTitle === `第${article.articleNumber}条` || 
        article.articleTitle === article.articleNumber) {
      result.issues.invalidTitles.push({
        articleNumber: article.articleNumber,
        title: article.articleTitle || ''
      });
    }
  }

  // 3. 欠落条文のチェック（第1条から最大条文番号まで）
  if (articleNumbers.size > 0) {
    const maxArticle = Math.max(...articleNumbers);
    for (let i = 1; i <= maxArticle; i++) {
      if (!articleNumbers.has(i)) {
        // 削除条文でもない場合のみ欠落として報告
        const deleted = law.articles.some(a => 
          a.isDeleted && Math.floor(kanjiToNumber(a.articleNumber)) === i
        );
        if (!deleted) {
          result.issues.missingArticles.push(i);
        }
      }
    }
  }

  result.stats.validArticles = law.articles.filter(a => !a.isDeleted).length;
  
  return result;
}

/**
 * 問題の修正
 */
async function fixLawIssues(lawId: string, issues: ValidationResult['issues']) {
  console.log(`\n📝 ${lawId} の修正を開始...`);
  
  // 1. 重複の削除（最初の1つを残す）
  for (const dup of issues.duplicates) {
    const articles = await prisma.article.findMany({
      where: {
        lawId,
        articleNumber: dup.articleNumber
      },
      orderBy: { createdAt: 'asc' }
    });
    
    if (articles.length > 1) {
      const toDelete = articles.slice(1).map(a => a.id);
      await prisma.article.deleteMany({
        where: { id: { in: toDelete } }
      });
      console.log(`  ✅ ${dup.articleNumber}の重複 ${toDelete.length}件を削除`);
    }
  }
  
  // 2. 条番号の形式修正
  for (const wrong of issues.wrongFormat) {
    // 範囲表記（:を含む）は削除
    if (wrong.articleNumber.includes(':')) {
      await prisma.article.deleteMany({
        where: {
          lawId,
          articleNumber: wrong.articleNumber
        }
      });
      console.log(`  ✅ ${wrong.articleNumber} を削除（範囲表記）`);
    } else {
      // 既存の同名条文がある場合は先に削除
      const existing = await prisma.article.findFirst({
        where: {
          lawId,
          articleNumber: wrong.expected
        }
      });
      
      if (existing) {
        console.log(`  ⚠️  ${wrong.expected} は既に存在するため、${wrong.articleNumber} の修正をスキップ`);
        continue;
      }
      
      await prisma.article.updateMany({
        where: {
          lawId,
          articleNumber: wrong.articleNumber
        },
        data: {
          articleNumber: wrong.expected
        }
      });
      console.log(`  ✅ ${wrong.articleNumber} → ${wrong.expected} に修正`);
    }
  }
  
  // 3. sortOrderの設定
  if (issues.missingSortOrder.length > 0) {
    for (const articleNumber of issues.missingSortOrder) {
      const sortOrder = Math.floor(kanjiToNumber(articleNumber));
      await prisma.article.updateMany({
        where: {
          lawId,
          articleNumber
        },
        data: { sortOrder }
      });
    }
    console.log(`  ✅ ${issues.missingSortOrder.length}件のsortOrderを設定`);
  }
  
  // 4. タイトルの修正（XMLから取得が理想だが、ここでは括弧付きタイトルを空にする）
  for (const invalid of issues.invalidTitles) {
    // XMLファイルから正しいタイトルを取得
    const xmlPath = await findXmlFile(lawId);
    if (xmlPath) {
      const correctTitle = await getArticleTitle(xmlPath, kanjiToNumber(invalid.articleNumber));
      if (correctTitle) {
        await prisma.article.updateMany({
          where: {
            lawId,
            articleNumber: invalid.articleNumber
          },
          data: { articleTitle: correctTitle }
        });
        console.log(`  ✅ 第${invalid.articleNumber}条のタイトルを修正: ${correctTitle}`);
      }
    }
  }
  
  // 5. 欠落条文の報告（自動追加は危険なので報告のみ）
  if (issues.missingArticles.length > 0) {
    console.log(`  ⚠️  欠落条文: 第${issues.missingArticles.map(n => numberToKanji(n)).join('条、第')}条`);
    console.log(`     XMLファイルから手動でインポートしてください`);
  }
}

/**
 * XMLファイルを探す
 */
async function findXmlFile(lawId: string): Promise<string | null> {
  const patterns = [
    `laws_data/sample/${lawId}.xml`,
    `laws_data/${lawId}*/${lawId}*.xml`,
    `laws_data/*/${lawId}*.xml`
  ];
  
  for (const pattern of patterns) {
    const files = await new Promise<string[]>((resolve) => {
      const glob = require('glob');
      glob(pattern, (err: any, files: string[]) => {
        resolve(err ? [] : files);
      });
    }).catch(() => []);
    
    if (files.length > 0) {
      return files[0];
    }
  }
  
  // globが使えない場合の代替
  const samplePath = `laws_data/sample/${lawId}.xml`;
  if (fs.existsSync(samplePath)) {
    return samplePath;
  }
  
  return null;
}

/**
 * XMLから条文タイトルを取得
 */
async function getArticleTitle(xmlPath: string, articleNum: number): Promise<string | null> {
  try {
    const content = fs.readFileSync(xmlPath, 'utf-8');
    const regex = new RegExp(`<Article\\s+Num="${articleNum}"[^>]*>([\\s\\S]*?)</Article>`, 'g');
    const match = regex.exec(content);
    
    if (match) {
      const articleContent = match[1];
      const captionMatch = articleContent.match(/<ArticleCaption>(.*?)<\/ArticleCaption>/);
      if (captionMatch) {
        return captionMatch[1];
      }
    }
  } catch (error) {
    console.error(`XMLファイル読み込みエラー: ${xmlPath}`, error);
  }
  
  return null;
}

/**
 * レポートの出力
 */
function printReport(results: ValidationResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 法令データ検証レポート');
  console.log('='.repeat(80));
  
  let totalIssues = 0;
  
  for (const result of results) {
    const issueCount = 
      result.issues.duplicates.length +
      result.issues.missingArticles.length +
      result.issues.wrongFormat.length +
      result.issues.missingSortOrder.length +
      result.issues.invalidTitles.length;
    
    if (issueCount === 0 && !verbose) continue;
    
    totalIssues += issueCount;
    
    console.log(`\n📖 ${result.lawTitle} (${result.lawId})`);
    console.log(`   総条文数: ${result.stats.totalArticles}`);
    console.log(`   有効条文: ${result.stats.validArticles}`);
    console.log(`   削除条文: ${result.stats.deletedArticles}`);
    
    if (result.issues.duplicates.length > 0) {
      console.log(`   ❌ 重複条文: ${result.issues.duplicates.length}件`);
      if (verbose) {
        for (const dup of result.issues.duplicates) {
          console.log(`      - 第${dup.articleNumber}条 (${dup.count}件)`);
        }
      }
    }
    
    if (result.issues.missingArticles.length > 0) {
      console.log(`   ⚠️  欠落条文: ${result.issues.missingArticles.length}件`);
      if (verbose) {
        console.log(`      第${result.issues.missingArticles.map(n => numberToKanji(n)).join('条、第')}条`);
      }
    }
    
    if (result.issues.wrongFormat.length > 0) {
      console.log(`   ❌ 形式エラー: ${result.issues.wrongFormat.length}件`);
      if (verbose) {
        for (const wrong of result.issues.wrongFormat) {
          console.log(`      - ${wrong.articleNumber} → ${wrong.expected}`);
        }
      }
    }
    
    if (result.issues.missingSortOrder.length > 0) {
      console.log(`   ⚠️  sortOrder未設定: ${result.issues.missingSortOrder.length}件`);
    }
    
    if (result.issues.invalidTitles.length > 0) {
      console.log(`   ❌ 不正なタイトル: ${result.issues.invalidTitles.length}件`);
      if (verbose) {
        for (const invalid of result.issues.invalidTitles.slice(0, 5)) {
          console.log(`      - 第${invalid.articleNumber}条: "${invalid.title}"`);
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`総問題数: ${totalIssues}件`);
  
  if (totalIssues > 0 && !shouldFix) {
    console.log('\n💡 修正するには --fix オプションを付けて実行してください');
    console.log('   例: npx tsx scripts/validate-and-fix-laws.ts --fix');
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('🔍 法令データの検証を開始します...');
  
  try {
    let laws;
    if (targetLawId) {
      // 特定法令のみ
      const law = await prisma.law.findUnique({ where: { id: targetLawId } });
      laws = law ? [law] : [];
    } else {
      // 全法令
      laws = await prisma.law.findMany();
    }
    
    if (laws.length === 0) {
      console.log('処理対象の法令がありません');
      return;
    }
    
    console.log(`${laws.length}件の法令を検証します`);
    
    const results: ValidationResult[] = [];
    
    for (const law of laws) {
      if (verbose) {
        console.log(`\n検証中: ${law.title}`);
      }
      
      const result = await validateLaw(law.id);
      results.push(result);
      
      // 修正モードの場合
      if (shouldFix) {
        const hasIssues = 
          result.issues.duplicates.length > 0 ||
          result.issues.wrongFormat.length > 0 ||
          result.issues.missingSortOrder.length > 0 ||
          result.issues.invalidTitles.length > 0;
        
        if (hasIssues) {
          await fixLawIssues(law.id, result.issues);
        }
      }
    }
    
    // レポート出力
    printReport(results);
    
    console.log('\n✅ 検証完了');
    
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  main();
}