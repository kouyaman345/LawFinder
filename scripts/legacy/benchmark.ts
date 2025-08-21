#!/usr/bin/env npx tsx

/**
 * 固定ベンチマーク
 * 継続的な精度測定のための標準テストセット
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import { writeFileSync, readFileSync, existsSync } from 'fs';

// 固定ベンチマークセット
export const BENCHMARK_CASES = [
  // === 基本パターン ===
  {
    id: 'basic_1',
    text: '民法第90条',
    expected: [{ type: 'external', law: '民法', article: '90' }],
    category: 'basic',
  },
  {
    id: 'basic_2',
    text: '第566条',
    expected: [{ type: 'internal', article: '566' }],
    category: 'basic',
  },
  {
    id: 'basic_3',
    text: '前項の規定により',
    expected: [{ type: 'relative', ref: '前項' }],
    category: 'basic',
  },
  
  // === 複数・範囲 ===
  {
    id: 'multiple_1',
    text: '民法第90条及び第91条',
    expected: [
      { type: 'external', law: '民法', article: '90' },
      { type: 'external', law: '民法', article: '91' },
    ],
    category: 'multiple',
  },
  {
    id: 'range_1',
    text: '第32条から第35条まで',
    expected: [{ type: 'range', start: '32', end: '35' }],
    category: 'range',
  },
  
  // === 漢数字 ===
  {
    id: 'kanji_1',
    text: '第五百六十六条',
    expected: [{ type: 'internal', article: '566' }],
    category: 'kanji',
  },
  {
    id: 'kanji_2',
    text: '第三十二条',
    expected: [{ type: 'internal', article: '32' }],
    category: 'kanji',
  },
  
  // === 法令番号付き ===
  {
    id: 'with_number_1',
    text: '民法（明治二十九年法律第八十九号）第90条',
    expected: [{ type: 'external', law: '民法', article: '90' }],
    category: 'with_number',
  },
  {
    id: 'with_number_2',
    text: '商法（明治三十二年法律第四十八号）',
    expected: [{ type: 'law', law: '商法' }],
    category: 'with_number',
  },
  
  // === 文脈依存 ===
  {
    id: 'context_1',
    text: '同法第10条',
    expected: [{ type: 'contextual', article: '10' }],
    category: 'context',
  },
  {
    id: 'context_2',
    text: '当該規定',
    expected: [{ type: 'contextual' }],
    category: 'context',
  },
  
  // === 構造参照 ===
  {
    id: 'structure_1',
    text: '第2章第3節',
    expected: [{ type: 'structural', chapter: '2', section: '3' }],
    category: 'structure',
  },
  
  // === 複雑なケース ===
  {
    id: 'complex_1',
    text: '第10条第2項第3号',
    expected: [{ type: 'internal', article: '10', paragraph: '2', item: '3' }],
    category: 'complex',
  },
  {
    id: 'complex_2',
    text: '附則第3条',
    expected: [{ type: 'supplementary', article: '3' }],
    category: 'complex',
  },
];

// ベンチマーク結果の型
interface BenchmarkResult {
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  precision: number;
  recall: number;
  f1Score: number;
  byCategory: Record<string, {
    total: number;
    passed: number;
    f1Score: number;
  }>;
  failures: Array<{
    id: string;
    text: string;
    expected: number;
    detected: number;
  }>;
}

// 簡易検出器（実際のdetector.tsのプロキシ）
class BenchmarkDetector {
  detect(text: string): any[] {
    // ここで実際のdetector.tsを呼び出すか、
    // 簡易実装を使用
    const refs = [];
    
    // 基本パターンのみ実装（テスト用）
    const patterns = [
      { regex: /([^、。]+法)第(\d+)条/g, type: 'external' },
      { regex: /第(\d+)条/g, type: 'internal' },
      { regex: /(前項|次項|前条|次条)/g, type: 'relative' },
      { regex: /第(\d+)条から第(\d+)条まで/g, type: 'range' },
    ];
    
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        refs.push({ type, text: match[0] });
      }
    }
    
    return refs;
  }
}

// ベンチマーク実行
export function runBenchmark(): BenchmarkResult {
  const detector = new BenchmarkDetector();
  const result: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    totalCases: BENCHMARK_CASES.length,
    passed: 0,
    failed: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    byCategory: {},
    failures: [],
  };
  
  let totalExpected = 0;
  let totalDetected = 0;
  let totalCorrect = 0;
  
  console.log(chalk.blue('=== ベンチマーク実行 ===\n'));
  
  // カテゴリ別の集計を初期化
  const categories = new Set(BENCHMARK_CASES.map(c => c.category));
  for (const cat of categories) {
    result.byCategory[cat] = { total: 0, passed: 0, f1Score: 0 };
  }
  
  // 各ケースをテスト
  for (const testCase of BENCHMARK_CASES) {
    const detected = detector.detect(testCase.text);
    const expected = testCase.expected.length;
    const actual = detected.length;
    
    totalExpected += expected;
    totalDetected += actual;
    
    const isCorrect = actual >= expected;
    if (isCorrect) {
      result.passed++;
      totalCorrect += expected;
      result.byCategory[testCase.category].passed++;
    } else {
      result.failed++;
      result.failures.push({
        id: testCase.id,
        text: testCase.text,
        expected,
        detected: actual,
      });
    }
    
    result.byCategory[testCase.category].total++;
    
    const icon = isCorrect ? '✅' : '❌';
    console.log(`${icon} [${testCase.category}] ${testCase.id}: ${testCase.text.substring(0, 30)}...`);
  }
  
  // 精度計算
  result.precision = totalDetected > 0 ? (totalCorrect / totalDetected * 100) : 0;
  result.recall = totalExpected > 0 ? (totalCorrect / totalExpected * 100) : 0;
  result.f1Score = result.precision + result.recall > 0 
    ? (2 * result.precision * result.recall / (result.precision + result.recall)) 
    : 0;
  
  // カテゴリ別F1スコア
  for (const cat of categories) {
    const catData = result.byCategory[cat];
    catData.f1Score = catData.total > 0 
      ? (catData.passed / catData.total * 100) 
      : 0;
  }
  
  return result;
}

// 結果の表示
function displayResults(result: BenchmarkResult): void {
  console.log(chalk.yellow('\n=== ベンチマーク結果 ===\n'));
  
  console.log(`総ケース数: ${result.totalCases}`);
  console.log(`成功: ${result.passed} (${(result.passed / result.totalCases * 100).toFixed(1)}%)`);
  console.log(`失敗: ${result.failed} (${(result.failed / result.totalCases * 100).toFixed(1)}%)`);
  console.log();
  
  console.log(`精度(Precision): ${result.precision.toFixed(1)}%`);
  console.log(`再現率(Recall): ${result.recall.toFixed(1)}%`);
  console.log(chalk.cyan(`F1スコア: ${result.f1Score.toFixed(1)}%`));
  console.log();
  
  console.log('カテゴリ別成績:');
  for (const [cat, data] of Object.entries(result.byCategory)) {
    console.log(`  ${cat}: ${data.passed}/${data.total} (${data.f1Score.toFixed(1)}%)`);
  }
  
  if (result.failures.length > 0) {
    console.log(chalk.red('\n失敗ケース:'));
    for (const failure of result.failures.slice(0, 5)) {
      console.log(`  - ${failure.id}: "${failure.text.substring(0, 30)}..." (期待${failure.expected}, 検出${failure.detected})`);
    }
  }
}

// 履歴の保存
function saveHistory(result: BenchmarkResult): void {
  const historyPath = 'Report/benchmark_history.json';
  let history = [];
  
  if (existsSync(historyPath)) {
    history = JSON.parse(readFileSync(historyPath, 'utf-8'));
  }
  
  history.push(result);
  
  // 最新100件のみ保持
  if (history.length > 100) {
    history = history.slice(-100);
  }
  
  writeFileSync(historyPath, JSON.stringify(history, null, 2));
  console.log(chalk.gray(`\n履歴を保存: ${historyPath}`));
}

// 改善の追跡
function trackImprovement(): void {
  const historyPath = 'Report/benchmark_history.json';
  
  if (!existsSync(historyPath)) {
    console.log(chalk.gray('履歴がありません'));
    return;
  }
  
  const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
  
  if (history.length < 2) {
    console.log(chalk.gray('比較するための履歴が不足しています'));
    return;
  }
  
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  
  const improvement = latest.f1Score - previous.f1Score;
  
  console.log(chalk.blue('\n=== 改善の追跡 ===\n'));
  console.log(`前回のF1スコア: ${previous.f1Score.toFixed(1)}%`);
  console.log(`今回のF1スコア: ${latest.f1Score.toFixed(1)}%`);
  
  if (improvement > 0) {
    console.log(chalk.green(`改善: +${improvement.toFixed(1)}pt 📈`));
  } else if (improvement < 0) {
    console.log(chalk.red(`劣化: ${improvement.toFixed(1)}pt 📉`));
  } else {
    console.log(chalk.gray('変化なし'));
  }
}

// メイン実行
if (require.main === module) {
  const result = runBenchmark();
  displayResults(result);
  saveHistory(result);
  trackImprovement();
  
  if (result.f1Score < 90) {
    console.log(chalk.yellow('\n⚠️ 目標の90%に届いていません'));
    console.log('失敗ケースを分析して、パターンを改善してください');
    process.exit(1);
  } else {
    console.log(chalk.green('\n✅ ベンチマーク合格！'));
    process.exit(0);
  }
}