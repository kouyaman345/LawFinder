#!/usr/bin/env npx tsx
/**
 * 参照検出テスト・検証フレームワーク
 * 
 * ゴールドスタンダードに基づいた参照検出の精度測定と検証
 */

import { ReferenceDetector } from '../src/domain/services/ReferenceDetector';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import { EnhancedReferenceDetector } from '../src/domain/services/EnhancedReferenceDetector';
import { EnhancedReferenceDetectorV31 } from '../src/domain/services/EnhancedReferenceDetectorV31';
import { EnhancedReferenceDetectorV32 } from '../src/domain/services/EnhancedReferenceDetectorV32';
import { EnhancedReferenceDetectorV33 } from '../src/domain/services/EnhancedReferenceDetectorV33';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// テストケース型定義
interface TestCase {
  id: string;
  lawId: string;
  articleNumber: string;
  text: string;
  expectedReferences: ExpectedReference[];
  difficulty: 'easy' | 'medium' | 'hard';
  patterns: string[];
  notes?: string;
}

interface ExpectedReference {
  type: string;
  targetArticle?: string;
  targetLaw?: string;
  text: string;
  optional?: boolean; // オプショナルな参照（検出されなくても許容）
}

interface TestResult {
  testCaseId: string;
  passed: boolean;
  detected: number;
  expected: number;
  matched: number;
  missed: ExpectedReference[];
  extra: any[];
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * ゴールドスタンダードテストケース
 */
const GOLD_STANDARD_TESTS: TestCase[] = [
  // 基本的な内部参照
  {
    id: 'basic-internal-1',
    lawId: '129AC0000000089',
    articleNumber: '第三条',
    text: '第一条の規定により、次の各号に掲げる事項を定める。',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条' }
    ],
    difficulty: 'easy',
    patterns: ['explicit_article'],
    notes: '明示的な条文参照'
  },
  
  // 相対参照
  {
    id: 'relative-1',
    lawId: '129AC0000000089',
    articleNumber: '第五条',
    text: '前条の規定にかかわらず、次条に定める場合においては、この限りでない。',
    expectedReferences: [
      { type: 'relative', targetArticle: '第四条', text: '前条' },
      { type: 'relative', targetArticle: '第六条', text: '次条' }
    ],
    difficulty: 'easy',
    patterns: ['relative_previous', 'relative_next']
  },
  
  // 範囲参照
  {
    id: 'range-1',
    lawId: '129AC0000000089',
    articleNumber: '第十条',
    text: '第一条から第三条までの規定は、次の場合に準用する。',
    expectedReferences: [
      { type: 'range', targetArticle: '第一条', text: '第一条から第三条まで' },
      { type: 'range', targetArticle: '第二条', text: '第一条から第三条まで' },
      { type: 'range', targetArticle: '第三条', text: '第一条から第三条まで' }
    ],
    difficulty: 'medium',
    patterns: ['range']
  },
  
  // 複数参照
  {
    id: 'multiple-1',
    lawId: '129AC0000000089',
    articleNumber: '第十五条',
    text: '第一条及び第三条の規定により、第五条並びに第七条の適用を受ける。',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条' },
      { type: 'internal', targetArticle: '第三条', text: '第三条' },
      { type: 'internal', targetArticle: '第五条', text: '第五条' },
      { type: 'internal', targetArticle: '第七条', text: '第七条' }
    ],
    difficulty: 'medium',
    patterns: ['multiple_and', 'multiple_or']
  },
  
  // 項・号参照
  {
    id: 'paragraph-item-1',
    lawId: '129AC0000000089',
    articleNumber: '第二十条',
    text: '第一条第二項の規定により、同条第三項第一号に掲げる事項を除く。',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条第二項' },
      { type: 'internal', targetArticle: '第一条', text: '同条第三項第一号' }
    ],
    difficulty: 'medium',
    patterns: ['paragraph', 'item', 'same_article']
  },
  
  // 大規模漢数字
  {
    id: 'large-number-1',
    lawId: '129AC0000000089',
    articleNumber: '第千条',
    text: '第九百九十九条の規定により、第千二百三十四条の適用を受ける。',
    expectedReferences: [
      { type: 'internal', targetArticle: '第九百九十九条', text: '第九百九十九条' },
      { type: 'internal', targetArticle: '第千二百三十四条', text: '第千二百三十四条' }
    ],
    difficulty: 'hard',
    patterns: ['large_kanji_number']
  },
  
  // 準用
  {
    id: 'application-1',
    lawId: '129AC0000000089',
    articleNumber: '第三十条',
    text: '第一条から第五条までの規定は、この場合について準用する。',
    expectedReferences: [
      { type: 'application', targetArticle: '第一条', text: '第一条から第五条まで' },
      { type: 'application', targetArticle: '第二条', text: '第一条から第五条まで' },
      { type: 'application', targetArticle: '第三条', text: '第一条から第五条まで' },
      { type: 'application', targetArticle: '第四条', text: '第一条から第五条まで' },
      { type: 'application', targetArticle: '第五条', text: '第一条から第五条まで' }
    ],
    difficulty: 'medium',
    patterns: ['application', 'range']
  },
  
  // 外部法令参照
  {
    id: 'external-1',
    lawId: '129AC0000000089',
    articleNumber: '第五十条',
    text: '商法第五百条の規定により、会社法第二条第一項に定める会社とする。',
    expectedReferences: [
      { type: 'external', targetLaw: '商法', targetArticle: '第五百条', text: '商法第五百条' },
      { type: 'external', targetLaw: '会社法', targetArticle: '第二条', text: '会社法第二条第一項' }
    ],
    difficulty: 'medium',
    patterns: ['external_law']
  },
  
  // 複雑な入れ子構造
  {
    id: 'nested-1',
    lawId: '129AC0000000089',
    articleNumber: '第百条',
    text: '第一条（第三条において準用する場合を含む。）の規定により定められた事項',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条' },
      { type: 'internal', targetArticle: '第三条', text: '第三条', optional: true }
    ],
    difficulty: 'hard',
    patterns: ['nested', 'parenthetical']
  },
  
  // 条件付き参照
  {
    id: 'conditional-1',
    lawId: '129AC0000000089',
    articleNumber: '第百五十条',
    text: '第一条の規定が適用される場合にあっては第二条、その他の場合にあっては第三条の規定による。',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条' },
      { type: 'internal', targetArticle: '第二条', text: '第二条' },
      { type: 'internal', targetArticle: '第三条', text: '第三条' }
    ],
    difficulty: 'hard',
    patterns: ['conditional']
  }
];

/**
 * エッジケーステスト
 */
const EDGE_CASES: TestCase[] = [
  {
    id: 'edge-ambiguous-1',
    lawId: 'test',
    articleNumber: 'test',
    text: '第一条第二項第三号イからホまで並びに第二条第一項から第三項まで及び第四項',
    expectedReferences: [
      { type: 'internal', targetArticle: '第一条', text: '第一条第二項第三号イからホまで' },
      { type: 'internal', targetArticle: '第二条', text: '第二条第一項から第三項まで' },
      { type: 'internal', targetArticle: '第二条', text: '第四項' }
    ],
    difficulty: 'hard',
    patterns: ['complex_range', 'multiple_levels']
  },
  
  {
    id: 'edge-recursive-1',
    lawId: 'test',
    articleNumber: 'test',
    text: '前項の前項の規定により',
    expectedReferences: [
      { type: 'relative', targetArticle: '前項', text: '前項' }
    ],
    difficulty: 'hard',
    patterns: ['recursive_relative'],
    notes: '再帰的な相対参照は最初のもののみ検出'
  }
];

/**
 * テスト実行クラス
 */
class ReferenceDetectionTester {
  private detector: any;
  private results: TestResult[] = [];
  
  constructor(detectorType: 'basic' | 'comprehensive' | 'enhanced' | 'v31' | 'v32' | 'v33' = 'comprehensive') {
    if (detectorType === 'basic') {
      this.detector = new ReferenceDetector();
    } else if (detectorType === 'comprehensive') {
      this.detector = new ComprehensiveReferenceDetector();
    } else if (detectorType === 'enhanced') {
      this.detector = new EnhancedReferenceDetector();
    } else if (detectorType === 'v31') {
      this.detector = new EnhancedReferenceDetectorV31();
    } else if (detectorType === 'v32') {
      this.detector = new EnhancedReferenceDetectorV32();
    } else {
      this.detector = new EnhancedReferenceDetectorV33();
    }
  }
  
  /**
   * 単一テストケースの実行
   */
  runTestCase(testCase: TestCase): TestResult {
    // 参照検出の実行
    const detected = this.detector.detectReferences 
      ? this.detector.detectReferences(testCase.text, testCase.articleNumber)
      : this.detector.detectAllReferences(testCase.text);
    
    // 期待される参照と検出された参照の比較
    const matched: ExpectedReference[] = [];
    const missed: ExpectedReference[] = [];
    const extra: any[] = [...detected];
    
    for (const expected of testCase.expectedReferences) {
      const foundIndex = extra.findIndex(d => 
        d.type === expected.type &&
        (!expected.targetArticle || d.targetArticleNumber === expected.targetArticle) &&
        (!expected.targetLaw || d.targetLaw === expected.targetLaw)
      );
      
      if (foundIndex >= 0) {
        matched.push(expected);
        extra.splice(foundIndex, 1);
      } else if (!expected.optional) {
        missed.push(expected);
      }
    }
    
    // メトリクスの計算
    const precision = detected.length > 0 ? matched.length / detected.length : 0;
    const recall = testCase.expectedReferences.filter(e => !e.optional).length > 0 
      ? matched.length / testCase.expectedReferences.filter(e => !e.optional).length 
      : 0;
    const f1Score = precision + recall > 0 
      ? 2 * (precision * recall) / (precision + recall) 
      : 0;
    
    return {
      testCaseId: testCase.id,
      passed: missed.length === 0 && extra.length === 0,
      detected: detected.length,
      expected: testCase.expectedReferences.filter(e => !e.optional).length,
      matched: matched.length,
      missed,
      extra,
      precision,
      recall,
      f1Score
    };
  }
  
  /**
   * 全テストケースの実行
   */
  runAllTests(testCases: TestCase[] = GOLD_STANDARD_TESTS): void {
    console.log(chalk.cyan('\n=== 参照検出テスト開始 ===\n'));
    
    for (const testCase of testCases) {
      const result = this.runTestCase(testCase);
      this.results.push(result);
      
      // 結果の表示
      const statusIcon = result.passed ? '✅' : '❌';
      const statusColor = result.passed ? chalk.green : chalk.red;
      
      console.log(`${statusIcon} ${chalk.bold(testCase.id)} (${testCase.difficulty})`);
      console.log(`   検出: ${result.detected}/${result.expected} | 精度: ${(result.precision * 100).toFixed(1)}% | 再現率: ${(result.recall * 100).toFixed(1)}%`);
      
      if (result.missed.length > 0) {
        console.log(chalk.yellow(`   見逃し: ${result.missed.map(m => m.text).join(', ')}`));
      }
      if (result.extra.length > 0) {
        console.log(chalk.yellow(`   誤検出: ${result.extra.map(e => e.sourceText).join(', ')}`));
      }
      if (testCase.notes) {
        console.log(chalk.gray(`   メモ: ${testCase.notes}`));
      }
      console.log();
    }
    
    this.printSummary();
  }
  
  /**
   * テスト結果のサマリー表示
   */
  printSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const totalPrecision = this.results.reduce((sum, r) => sum + r.precision, 0) / totalTests;
    const totalRecall = this.results.reduce((sum, r) => sum + r.recall, 0) / totalTests;
    const totalF1 = this.results.reduce((sum, r) => sum + r.f1Score, 0) / totalTests;
    
    // 難易度別の集計
    const byDifficulty = {
      easy: this.results.filter(r => GOLD_STANDARD_TESTS.find(t => t.id === r.testCaseId)?.difficulty === 'easy'),
      medium: this.results.filter(r => GOLD_STANDARD_TESTS.find(t => t.id === r.testCaseId)?.difficulty === 'medium'),
      hard: this.results.filter(r => GOLD_STANDARD_TESTS.find(t => t.id === r.testCaseId)?.difficulty === 'hard')
    };
    
    console.log(chalk.cyan('\n=== テスト結果サマリー ===\n'));
    console.log(`合格率: ${chalk.bold((passedTests / totalTests * 100).toFixed(1) + '%')} (${passedTests}/${totalTests})`);
    console.log(`平均精度: ${chalk.bold((totalPrecision * 100).toFixed(1) + '%')}`);
    console.log(`平均再現率: ${chalk.bold((totalRecall * 100).toFixed(1) + '%')}`);
    console.log(`平均F1スコア: ${chalk.bold((totalF1 * 100).toFixed(1) + '%')}`);
    
    console.log('\n難易度別結果:');
    for (const [difficulty, results] of Object.entries(byDifficulty)) {
      const passed = results.filter(r => r.passed).length;
      const total = results.length;
      if (total > 0) {
        console.log(`  ${difficulty}: ${(passed / total * 100).toFixed(1)}% (${passed}/${total})`);
      }
    }
    
    // 失敗したテストの詳細
    const failedTests = this.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log(chalk.yellow('\n失敗したテスト:'));
      for (const failed of failedTests) {
        const testCase = GOLD_STANDARD_TESTS.find(t => t.id === failed.testCaseId);
        console.log(`  - ${failed.testCaseId} (${testCase?.difficulty})`);
      }
    }
  }
  
  /**
   * 結果をJSONファイルに保存
   */
  saveResults(filename: string): void {
    const output = {
      timestamp: new Date().toISOString(),
      detector: this.detector.constructor.name,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        avgPrecision: this.results.reduce((sum, r) => sum + r.precision, 0) / this.results.length,
        avgRecall: this.results.reduce((sum, r) => sum + r.recall, 0) / this.results.length,
        avgF1Score: this.results.reduce((sum, r) => sum + r.f1Score, 0) / this.results.length
      },
      results: this.results
    };
    
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(chalk.green(`\n結果を ${filename} に保存しました`));
  }
}

// CLI実行
if (require.main === module) {
  const args = process.argv.slice(2);
  const detectorType = args.includes('--basic') ? 'basic' : 
                       args.includes('--enhanced') ? 'enhanced' :
                       args.includes('--v31') ? 'v31' :
                       args.includes('--v32') ? 'v32' :
                       args.includes('--v33') ? 'v33' : 'comprehensive';
  const includeEdgeCases = args.includes('--edge');
  const saveToFile = args.includes('--save');
  
  const tester = new ReferenceDetectionTester(detectorType as any);
  
  // テストケースの選択
  const testCases = includeEdgeCases 
    ? [...GOLD_STANDARD_TESTS, ...EDGE_CASES]
    : GOLD_STANDARD_TESTS;
  
  // テスト実行
  tester.runAllTests(testCases);
  
  // 結果の保存
  if (saveToFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;
    tester.saveResults(filename);
  }
}

export { ReferenceDetectionTester, TestCase, TestResult, GOLD_STANDARD_TESTS, EDGE_CASES };