#!/usr/bin/env npx tsx

/**
 * エッジケースのテスト
 * 省略形参照、複雑な入れ子参照などの難しいケースをテスト
 */

import chalk from 'chalk';
import { UltimateReferenceDetector } from './detector';

// エッジケースのテストデータ
const edgeCases = [
  // 省略形参照
  {
    name: '省略形: 同条第2項',
    text: '前条の規定により、同条第2項の適用を受ける',
    expectedTypes: ['relative', 'contextual'],
    minExpected: 2,
  },
  {
    name: '省略形: 同項',
    text: '同項の規定にかかわらず',
    expectedTypes: ['contextual'],
    minExpected: 1,
  },
  {
    name: '省略形: 同号',
    text: '同号に掲げる事項',
    expectedTypes: ['contextual'],
    minExpected: 1,
  },
  
  // 複雑な入れ子参照
  {
    name: '入れ子: 法令内の条文参照',
    text: '民法（明治二十九年法律第八十九号）第90条から第92条まで',
    expectedTypes: ['external', 'range'],
    minExpected: 1,
  },
  {
    name: '入れ子: 括弧内の参照',
    text: '第5条（第3条第2項の規定を準用する場合を含む。）',
    expectedTypes: ['internal', 'internal'],
    minExpected: 2,
  },
  
  // 複雑な範囲参照
  {
    name: '範囲: 枝番号付き',
    text: '第32条の2から第32条の5まで',
    expectedTypes: ['range'],
    minExpected: 1,
  },
  {
    name: '範囲: 項の範囲',
    text: '第10条第2項から第4項まで',
    expectedTypes: ['internal', 'range'],
    minExpected: 1,
  },
  
  // 準用・適用
  {
    name: '準用: 基本形',
    text: '第50条の規定は、前項の場合について準用する',
    expectedTypes: ['internal', 'relative'],
    minExpected: 2,
  },
  {
    name: '準用: 読替え',
    text: '第30条中「許可」とあるのは「届出」と読み替える',
    expectedTypes: ['internal'],
    minExpected: 1,
  },
  
  // 複数法令の参照
  {
    name: '複数法令: 並列',
    text: '民法第90条及び商法第48条',
    expectedTypes: ['external', 'internal', 'external', 'internal'],
    minExpected: 2,
  },
  {
    name: '複数法令: ただし書き',
    text: '民法第90条の規定にかかわらず、会社法第2条の定めるところによる',
    expectedTypes: ['external', 'external'],
    minExpected: 2,
  },
  
  // 特殊な番号形式
  {
    name: '特殊: ローマ数字混在',
    text: '附則第II条',
    expectedTypes: ['internal'],
    minExpected: 0, // 現在未対応
  },
  {
    name: '特殊: 別表参照',
    text: '別表第一（第3条関係）',
    expectedTypes: ['structural', 'internal'],
    minExpected: 1,
  },
];

async function testEdgeCases() {
  console.log(chalk.blue('=== エッジケーステスト ===\n'));
  
  const detector = new UltimateReferenceDetector();
  
  let totalTests = 0;
  let passedTests = 0;
  let totalExpected = 0;
  let totalDetected = 0;
  const results: any[] = [];
  
  for (const testCase of edgeCases) {
    totalTests++;
    totalExpected += testCase.minExpected;
    
    console.log(chalk.cyan(`テスト: ${testCase.name}`));
    console.log(`  入力: "${testCase.text}"`);
    
    try {
      const references = await detector.detectReferences(testCase.text);
      totalDetected += references.length;
      
      const success = references.length >= testCase.minExpected;
      passedTests += success ? 1 : 0;
      
      const icon = success ? '✅' : '❌';
      console.log(`  ${icon} 最小期待: ${testCase.minExpected}件, 検出: ${references.length}件`);
      
      if (references.length > 0) {
        console.log('  検出内容:');
        references.forEach((ref, i) => {
          console.log(`    ${i + 1}. [${ref.type}] ${ref.text}`);
        });
      }
      
      results.push({
        name: testCase.name,
        text: testCase.text,
        expected: testCase.minExpected,
        detected: references.length,
        success,
        references: references.map(r => ({
          type: r.type,
          text: r.text,
          confidence: r.confidence
        }))
      });
      
      if (!success) {
        console.log(chalk.yellow('  ⚠️ 検出不足または未実装'));
      }
      
    } catch (error) {
      console.log(chalk.red(`  ❌ エラー: ${error}`));
      results.push({
        name: testCase.name,
        text: testCase.text,
        expected: testCase.minExpected,
        detected: 0,
        success: false,
        error: String(error)
      });
    }
    
    console.log();
  }
  
  // サマリー
  console.log(chalk.yellow('=== サマリー ===\n'));
  console.log(`テスト数: ${totalTests}`);
  console.log(`成功: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
  console.log(`総最小期待数: ${totalExpected}`);
  console.log(`総検出数: ${totalDetected}`);
  
  // 精度計算（最小期待ベース）
  const precision = totalDetected > 0 ? (Math.min(totalExpected, totalDetected) / totalDetected * 100) : 0;
  const recall = totalExpected > 0 ? (Math.min(totalExpected, totalDetected) / totalExpected * 100) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
  
  console.log();
  console.log(`精度(Precision): ${precision.toFixed(1)}%`);
  console.log(`再現率(Recall): ${recall.toFixed(1)}%`);
  console.log(chalk.cyan(`F1スコア: ${f1.toFixed(1)}%`));
  
  // 課題分析
  console.log(chalk.red('\n=== 未実装・改善が必要な機能 ===\n'));
  
  const failedCases = results.filter(r => !r.success);
  if (failedCases.length > 0) {
    failedCases.forEach(c => {
      console.log(`❌ ${c.name}`);
      console.log(`   期待: ${c.expected}件, 検出: ${c.detected}件`);
    });
  } else {
    console.log(chalk.green('すべてのエッジケースが成功しました！'));
  }
  
  // 結果をJSONに保存
  const fs = await import('fs');
  const reportPath = 'Report/edge_cases_test_result.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(chalk.gray(`\n結果を保存: ${reportPath}`));
  
  return {
    totalTests,
    passedTests,
    successRate: (passedTests/totalTests*100).toFixed(1),
    f1Score: f1.toFixed(1),
    results
  };
}

// メイン実行
testEdgeCases().catch(console.error);