#!/usr/bin/env npx tsx

/**
 * detector.tsのパターン修正
 * 特定されたエラーを修正
 */

import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

// 修正が必要なパターン
const fixes = [
  {
    name: '複数条文の検出（及び・並びに）',
    old: null, // 新規追加
    new: `
    // パターン2.5: 複数条文（及び・並びに）
    const pattern2_5 = /第(\\d+)条(?:及び|並びに)第(\\d+)条/g;
    while ((match = pattern2_5.exec(text)) !== null) {
      // 第1条文
      references.push({
        type: 'internal',
        text: \`第\${match[1]}条\`,
        targetArticle: match[1],
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      // 第2条文
      references.push({
        type: 'internal',
        text: \`第\${match[2]}条\`,
        targetArticle: match[2],
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index + match[0].indexOf(\`第\${match[2]}条\`)
      });
    }`,
    location: 'after pattern2'
  },
  {
    name: '法令番号の除去パターン',
    old: '/([^、。\\s（）]*法)（([^）]+)）/g',
    new: '/([^、。\\s（）]*法)(?:（[^）]+）)?/g',
    location: 'pattern1'
  },
  {
    name: '漢数字条文の追加',
    old: null,
    new: `
    // パターン2b: 単独の漢数字条文
    const pattern2b = /第([一二三四五六七八九十百千万]+)条/g;
    while ((match = pattern2b.exec(text)) !== null) {
      const articleNumber = this.kanjiToNumber(match[1]);
      if (articleNumber) {
        references.push({
          type: 'internal',
          text: match[0],
          targetArticle: String(articleNumber),
          confidence: 0.90,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }`,
    location: 'after pattern2'
  }
];

// kanjiToNumberメソッドの追加
const kanjiToNumberMethod = `
  /**
   * 漢数字を数値に変換
   */
  private kanjiToNumber(text: string): number {
    const kanjiMap: Record<string, number> = {
      '〇': 0, '零': 0,
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9,
      '十': 10, '百': 100, '千': 1000, '万': 10000
    };

    let result = 0;
    let temp = 0;
    let digit = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const value = kanjiMap[char];

      if (value === undefined) continue;

      if (value === 10000) {
        result += (temp + digit) * value;
        temp = 0;
        digit = 0;
      } else if (value === 1000) {
        temp += (digit || 1) * value;
        digit = 0;
      } else if (value === 100) {
        temp += (digit || 1) * value;
        digit = 0;
      } else if (value === 10) {
        temp += (digit || 1) * value;
        digit = 0;
      } else {
        digit = value;
      }
    }

    return result + temp + digit;
  }`;

function applyFixes() {
  console.log(chalk.blue('=== detector.tsの修正 ===\n'));
  
  const detectorPath = 'scripts/detector.ts';
  let content = readFileSync(detectorPath, 'utf-8');
  const originalContent = content;
  
  // kanjiToNumberメソッドが存在しない場合は追加
  if (!content.includes('kanjiToNumber')) {
    console.log(chalk.cyan('kanjiToNumberメソッドを追加'));
    // クラスの最後に追加
    const classEndIndex = content.lastIndexOf('}');
    content = content.slice(0, classEndIndex) + kanjiToNumberMethod + '\n' + content.slice(classEndIndex);
  }
  
  // パターン修正を適用
  for (const fix of fixes) {
    if (fix.old) {
      // 既存パターンの置換
      if (content.includes(fix.old)) {
        content = content.replace(fix.old, fix.new);
        console.log(chalk.green(`✅ ${fix.name}`));
      } else {
        console.log(chalk.yellow(`⚠️ ${fix.name}: パターンが見つかりません`));
      }
    } else if (fix.new) {
      // 新規パターンの追加
      if (!content.includes(fix.new.trim().split('\n')[1])) {
        // location に基づいて適切な位置に挿入
        if (fix.location === 'after pattern2') {
          const pattern2Index = content.indexOf('// パターン3:');
          if (pattern2Index > 0) {
            content = content.slice(0, pattern2Index) + fix.new + '\n\n    ' + content.slice(pattern2Index);
            console.log(chalk.green(`✅ ${fix.name}`));
          }
        }
      } else {
        console.log(chalk.gray(`◯ ${fix.name}: 既に存在`));
      }
    }
  }
  
  // 変更があった場合のみ保存
  if (content !== originalContent) {
    // バックアップを作成
    writeFileSync(detectorPath + '.backup', originalContent);
    // 修正版を保存
    writeFileSync(detectorPath, content);
    console.log(chalk.green('\n✅ detector.tsを更新しました'));
    console.log(chalk.gray('バックアップ: scripts/detector.ts.backup'));
  } else {
    console.log(chalk.yellow('\n変更はありませんでした'));
  }
}

// テスト実行
function testFixes() {
  console.log(chalk.blue('\n=== 修正後のテスト ===\n'));
  
  const testCases = [
    { text: '民法第90条及び第91条', expected: 2 },
    { text: '第五百六十六条', expected: 1 },
    { text: '民法（明治二十九年法律第八十九号）第90条', expected: 1 },
  ];
  
  // 簡易テスト（実際のdetector.tsは複雑なため、ここでは概念的なテスト）
  for (const tc of testCases) {
    console.log(`テスト: "${tc.text}"`);
    console.log(`期待: ${tc.expected}件の参照`);
    console.log();
  }
}

// メイン実行
function main() {
  applyFixes();
  testFixes();
  
  console.log(chalk.cyan('\n次のステップ:'));
  console.log('1. npx tsx scripts/test-detection-accuracy.ts で精度を再測定');
  console.log('2. 改善が確認されたらコミット');
  console.log('3. さらなるエラーパターンを収集して修正');
}

main();