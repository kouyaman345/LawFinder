#!/usr/bin/env npx tsx

/**
 * 不足しているパターンを追加
 * 構造参照、範囲参照、文脈依存参照
 */

import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

// 追加すべきパターン
const patternsToAdd = [
  {
    name: '範囲参照パターン',
    after: '// パターン4: 複数条文',
    code: `
    // パターン4.5: 範囲参照
    const pattern4_5 = /第(\\d+)条から第(\\d+)条まで/g;
    while ((match = pattern4_5.exec(text)) !== null) {
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: match[1] + '-' + match[2],
        confidence: 0.90,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
`
  },
  {
    name: '構造参照パターン（章・節）',
    after: '// パターン5:',
    code: `
    // パターン5.5: 構造参照（章・節）
    const pattern5_5 = /第(\\d+)章(?:第(\\d+)節)?/g;
    while ((match = pattern5_5.exec(text)) !== null) {
      references.push({
        type: 'structural',
        text: match[0],
        targetArticle: match[2] ? \`章\${match[1]}節\${match[2]}\` : \`章\${match[1]}\`,
        confidence: 0.85,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
`
  },
  {
    name: '文脈依存参照（同法・当該）',
    method: 'detectByContext',
    location: 'in detectByContext method',
    code: `
    // 同法の検出
    if (text.includes('同法')) {
      const matches = text.matchAll(/同法第(\\d+)条/g);
      for (const match of matches) {
        references.push({
          type: 'contextual',
          text: match[0],
          targetArticle: match[1],
          confidence: 0.70,
          resolutionMethod: 'context',
          position: match.index
        });
      }
    }
    
    // 当該規定の検出
    if (text.includes('当該')) {
      const matches = text.matchAll(/当該[^、。]{1,10}/g);
      for (const match of matches) {
        references.push({
          type: 'contextual',
          text: match[0],
          confidence: 0.60,
          resolutionMethod: 'context',
          position: match.index
        });
      }
    }
`
  }
];

function addPatterns() {
  console.log(chalk.blue('=== 不足パターンの追加 ===\n'));
  
  const detectorPath = 'scripts/detector.ts';
  let content = readFileSync(detectorPath, 'utf-8');
  const originalContent = content;
  
  for (const pattern of patternsToAdd) {
    console.log(chalk.cyan(`追加: ${pattern.name}`));
    
    if (pattern.method === 'detectByContext') {
      // detectByContextメソッド内に追加
      const methodStart = content.indexOf('private detectByContext(text: string)');
      if (methodStart > 0) {
        const methodEnd = content.indexOf('return references;', methodStart);
        if (methodEnd > 0) {
          // return文の前に追加
          content = content.slice(0, methodEnd) + pattern.code + '\n    ' + content.slice(methodEnd);
          console.log(chalk.green(`  ✅ detectByContextメソッドに追加`));
        }
      }
    } else if (pattern.after) {
      // 指定位置の後に追加
      const afterIndex = content.indexOf(pattern.after);
      if (afterIndex > 0) {
        const nextPatternIndex = content.indexOf('\n\n    // パターン', afterIndex + 10);
        if (nextPatternIndex > 0) {
          content = content.slice(0, nextPatternIndex) + pattern.code + content.slice(nextPatternIndex);
          console.log(chalk.green(`  ✅ ${pattern.after}の後に追加`));
        }
      }
    }
  }
  
  if (content !== originalContent) {
    writeFileSync(detectorPath + '.backup2', originalContent);
    writeFileSync(detectorPath, content);
    console.log(chalk.green('\n✅ detector.tsを更新しました'));
    console.log(chalk.gray('バックアップ: scripts/detector.ts.backup2'));
  } else {
    console.log(chalk.yellow('\n変更はありませんでした'));
  }
}

// テスト
function testPatterns() {
  console.log(chalk.blue('\n=== パターンテスト ===\n'));
  
  const testCases = [
    { text: '第32条から第35条まで', type: '範囲参照' },
    { text: '第2章第3節', type: '構造参照' },
    { text: '同法第10条', type: '文脈依存' },
    { text: '当該規定', type: '文脈依存' },
  ];
  
  for (const tc of testCases) {
    console.log(`${tc.type}: "${tc.text}"`);
  }
}

// メイン実行
function main() {
  addPatterns();
  testPatterns();
  
  console.log(chalk.cyan('\n次のステップ:'));
  console.log('1. npx tsx scripts/test-real-detector.ts で再テスト');
  console.log('2. F1スコアの改善を確認');
}

main();