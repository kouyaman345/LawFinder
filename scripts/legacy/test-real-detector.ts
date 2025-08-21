#!/usr/bin/env npx tsx

/**
 * 実際のdetector.tsの動作確認テスト
 * 簡易実装ではなく、本物のコードをテスト
 */

import chalk from 'chalk';

// 実際のdetector.tsをインポート
import { UltimateReferenceDetector } from './detector';

// テストケース
const testCases = [
  {
    name: '基本: 民法第90条',
    text: '民法第90条',
    expectedCount: 1,
    expectedTypes: ['external'],
  },
  {
    name: '漢数字: 第五百六十六条',
    text: '第五百六十六条',
    expectedCount: 1,
    expectedTypes: ['internal'],
  },
  {
    name: '複数: 民法第90条及び第91条',
    text: '民法第90条及び第91条',
    expectedCount: 2,
    expectedTypes: ['external', 'external'],
  },
  {
    name: '範囲: 第32条から第35条まで',
    text: '第32条から第35条まで',
    expectedCount: 1,
    expectedTypes: ['range'],
  },
  {
    name: '法令番号付き: 民法（明治二十九年法律第八十九号）第90条',
    text: '民法（明治二十九年法律第八十九号）第90条',
    expectedCount: 1,
    expectedTypes: ['external'],
  },
  {
    name: '構造: 第2章第3節',
    text: '第2章第3節',
    expectedCount: 1,
    expectedTypes: ['structural'],
  },
  {
    name: '文脈: 同法第10条',
    text: '同法第10条',
    expectedCount: 1,
    expectedTypes: ['contextual'],
  },
  {
    name: '文脈: 当該規定',
    text: '当該規定',
    expectedCount: 1,
    expectedTypes: ['contextual'],
  },
];

// テスト実行
async function testRealDetector() {
  console.log(chalk.blue('=== 実際のdetector.tsの動作確認 ===\n'));
  
  try {
    const detector = new UltimateReferenceDetector();
    
    let totalTests = 0;
    let passedTests = 0;
    let totalExpected = 0;
    let totalDetected = 0;
    
    for (const testCase of testCases) {
      totalTests++;
      totalExpected += testCase.expectedCount;
      
      console.log(chalk.cyan(`テスト: ${testCase.name}`));
      console.log(`  入力: "${testCase.text}"`);
      
      // detectByPatternメソッドを直接呼び出し（メソッド名修正）
      const references = (detector as any).detectByPattern(testCase.text);
      totalDetected += references.length;
      
      const success = references.length >= testCase.expectedCount;
      passedTests += success ? 1 : 0;
      
      const icon = success ? '✅' : '❌';
      console.log(`  ${icon} 期待: ${testCase.expectedCount}件, 検出: ${references.length}件`);
      
      if (references.length > 0) {
        console.log('  検出内容:');
        references.forEach((ref, i) => {
          console.log(`    ${i + 1}. [${ref.type}] ${ref.text}`);
        });
      }
      
      if (!success) {
        console.log(chalk.red('  ⚠️ 検出不足'));
      }
      
      console.log();
    }
    
    // 精度計算
    const precision = totalDetected > 0 ? (Math.min(totalExpected, totalDetected) / totalDetected * 100) : 0;
    const recall = totalExpected > 0 ? (Math.min(totalExpected, totalDetected) / totalExpected * 100) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
    
    // サマリー
    console.log(chalk.yellow('=== サマリー ===\n'));
    console.log(`テスト数: ${totalTests}`);
    console.log(`成功: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`総期待数: ${totalExpected}`);
    console.log(`総検出数: ${totalDetected}`);
    console.log();
    console.log(`精度(Precision): ${precision.toFixed(1)}%`);
    console.log(`再現率(Recall): ${recall.toFixed(1)}%`);
    console.log(chalk.cyan(`F1スコア: ${f1.toFixed(1)}%`));
    
    // 問題の診断
    if (f1 < 90) {
      console.log(chalk.red('\n=== 問題の診断 ===\n'));
      
      // 漢数字テスト
      const kanjiTest = testCases.find(t => t.name.includes('漢数字'));
      const kanjiRefs = detector.detectByPatterns(kanjiTest!.text);
      if (kanjiRefs.length === 0) {
        console.log('❌ 漢数字パターンが動作していません');
        console.log('  → kanjiToNumberメソッドが呼ばれていない可能性');
      }
      
      // 構造参照テスト
      const structTest = testCases.find(t => t.name.includes('構造'));
      const structRefs = detector.detectByPatterns(structTest!.text);
      if (structRefs.length === 0) {
        console.log('❌ 構造参照パターンが未実装');
        console.log('  → 章・節のパターンを追加する必要があります');
      }
      
      // 文脈依存テスト
      const contextTest = testCases.find(t => t.name.includes('当該'));
      const contextRefs = detector.detectByPatterns(contextTest!.text);
      if (contextRefs.length === 0) {
        console.log('❌ 文脈依存参照が未実装');
        console.log('  → detectByContextメソッドの改善が必要');
      }
    }
    
  } catch (error) {
    console.error(chalk.red('エラー:'), error);
    console.log('\ndetector.tsのインポートに失敗しました。');
    console.log('以下を確認してください:');
    console.log('1. detector.tsが存在する');
    console.log('2. export class UltimateReferenceDetector が定義されている');
    console.log('3. 構文エラーがない');
  }
}

// メイン実行
testRealDetector().catch(console.error);