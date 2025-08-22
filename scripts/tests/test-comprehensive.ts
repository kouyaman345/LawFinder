#!/usr/bin/env npx tsx
/**
 * 包括的テストケース（80件目標）
 * Phase 2の品質基準達成のため
 */

import { UltimateReferenceDetector } from './detector';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  category: string;
  text: string;
  expected: Array<{
    type: string;
    text: string;
    targetLaw?: string;
  }>;
  description: string;
}

const testCases: TestCase[] = [
  // === 基本パターン（10件） ===
  {
    id: 'basic-1',
    category: '基本',
    text: '民法第90条の規定により無効とする。',
    expected: [{ type: 'external', text: '民法第90条', targetLaw: '民法' }],
    description: '基本的な外部法令参照'
  },
  {
    id: 'basic-2', 
    category: '基本',
    text: '第5条の規定に基づき処理する。',
    expected: [{ type: 'internal', text: '第5条' }],
    description: '基本的な内部参照'
  },
  {
    id: 'basic-3',
    category: '基本',
    text: '第10条第2項の規定を適用する。',
    expected: [{ type: 'internal', text: '第10条第2項' }],
    description: '項を含む内部参照'
  },
  {
    id: 'basic-4',
    category: '基本',
    text: '刑法第199条（殺人）の規定により処罰する。',
    expected: [{ type: 'external', text: '刑法第199条', targetLaw: '刑法' }],
    description: '括弧付き外部参照'
  },
  {
    id: 'basic-5',
    category: '基本',
    text: '商法第522条及び第523条の規定を準用する。',
    expected: [
      { type: 'external', text: '商法第522条', targetLaw: '商法' },
      { type: 'external', text: '第523条', targetLaw: '商法' }
    ],
    description: '複数条文の外部参照'
  },
  {
    id: 'basic-6',
    category: '基本',
    text: '第3条から第7条までの規定により行う。',
    expected: [{ type: 'internal', text: '第3条から第7条まで' }],
    description: '範囲参照'
  },
  {
    id: 'basic-7',
    category: '基本',
    text: '憲法第25条に規定する生存権を保障する。',
    expected: [{ type: 'external', text: '憲法第25条', targetLaw: '憲法' }],
    description: '憲法への参照'
  },
  {
    id: 'basic-8',
    category: '基本',
    text: '第15条第3項第2号の規定に該当する。',
    expected: [{ type: 'internal', text: '第15条第3項第2号' }],
    description: '号まで含む詳細参照'
  },
  {
    id: 'basic-9',
    category: '基本',
    text: '労働基準法第36条の協定を締結する。',
    expected: [{ type: 'external', text: '労働基準法第36条', targetLaw: '労働基準法' }],
    description: '労働法への参照'
  },
  {
    id: 'basic-10',
    category: '基本',
    text: '会社法第2条第1号に定める会社。',
    expected: [{ type: 'external', text: '会社法第2条第1号', targetLaw: '会社法' }],
    description: '定義条文への参照'
  },

  // === 相対参照（10件） ===
  {
    id: 'relative-1',
    category: '相対',
    text: '前条の規定にかかわらず実施する。',
    expected: [{ type: 'relative', text: '前条' }],
    description: '前条参照'
  },
  {
    id: 'relative-2',
    category: '相対',
    text: '次条に定める手続きにより行う。',
    expected: [{ type: 'relative', text: '次条' }],
    description: '次条参照'
  },
  {
    id: 'relative-3',
    category: '相対',
    text: '前項の規定を準用する。',
    expected: [{ type: 'relative', text: '前項' }],
    description: '前項参照'
  },
  {
    id: 'relative-4',
    category: '相対',
    text: '次項に規定する場合を除く。',
    expected: [{ type: 'relative', text: '次項' }],
    description: '次項参照'
  },
  {
    id: 'relative-5',
    category: '相対',
    text: '前二項の規定により計算する。',
    expected: [{ type: 'relative', text: '前二項' }],
    description: '前二項参照'
  },
  {
    id: 'relative-6',
    category: '相対',
    text: '前三項の規定を適用する。',
    expected: [{ type: 'relative', text: '前三項' }],
    description: '前三項参照'
  },
  {
    id: 'relative-7',
    category: '相対',
    text: '前各項の規定にかかわらず実施。',
    expected: [{ type: 'relative', text: '前各項' }],
    description: '前各項参照'
  },
  {
    id: 'relative-8',
    category: '相対',
    text: '同条第2項の規定により処理。',
    expected: [{ type: 'contextual', text: '同条第2項' }],
    description: '同条参照'
  },
  {
    id: 'relative-9',
    category: '相対',
    text: '同項の規定を準用する。',
    expected: [{ type: 'contextual', text: '同項' }],
    description: '同項参照'
  },
  {
    id: 'relative-10',
    category: '相対',
    text: '前条第3項の規定を適用。',
    expected: [{ type: 'relative', text: '前条第3項' }],
    description: '前条の特定項参照'
  },

  // === 構造参照（10件） ===
  {
    id: 'structural-1',
    category: '構造',
    text: '第2章の規定により処理する。',
    expected: [{ type: 'structural', text: '第2章' }],
    description: '章への参照'
  },
  {
    id: 'structural-2',
    category: '構造',
    text: '第3節の規定を適用する。',
    expected: [{ type: 'structural', text: '第3節' }],
    description: '節への参照'
  },
  {
    id: 'structural-3',
    category: '構造',
    text: '第1款の規定により行う。',
    expected: [{ type: 'structural', text: '第1款' }],
    description: '款への参照'
  },
  {
    id: 'structural-4',
    category: '構造',
    text: '別表第一に掲げる事項。',
    expected: [{ type: 'structural', text: '別表第一' }],
    description: '別表への参照'
  },
  {
    id: 'structural-5',
    category: '構造',
    text: '附則第3条の規定により処理。',
    expected: [{ type: 'structural', text: '附則第3条' }],
    description: '附則への参照'
  },
  {
    id: 'structural-6',
    category: '構造',
    text: '第2編第3章の規定を準用。',
    expected: [{ type: 'structural', text: '第2編第3章' }],
    description: '編と章の複合参照'
  },
  {
    id: 'structural-7',
    category: '構造',
    text: '第1部第2章第3節の規定。',
    expected: [{ type: 'structural', text: '第1部第2章第3節' }],
    description: '部・章・節の複合参照'
  },
  {
    id: 'structural-8',
    category: '構造',
    text: '別表第二（第10条関係）',
    expected: [
      { type: 'structural', text: '別表第二' },
      { type: 'internal', text: '第10条' }
    ],
    description: '別表と条文の関係'
  },
  {
    id: 'structural-9',
    category: '構造',
    text: '第2章第1節から第3節まで',
    expected: [{ type: 'structural', text: '第2章第1節から第3節まで' }],
    description: '節の範囲参照'
  },
  {
    id: 'structural-10',
    category: '構造',
    text: '総則の規定を適用する。',
    expected: [{ type: 'structural', text: '総則' }],
    description: '総則への参照'
  },

  // === 準用・読替え（10件） ===
  {
    id: 'application-1',
    category: '準用',
    text: '第10条の規定を準用する。',
    expected: [{ type: 'application', text: '第10条' }],
    description: '単純準用'
  },
  {
    id: 'application-2',
    category: '準用',
    text: '第5条から第8条までの規定を準用する。',
    expected: [{ type: 'application', text: '第5条から第8条まで' }],
    description: '範囲準用'
  },
  {
    id: 'application-3',
    category: '準用',
    text: '第10条中「許可」とあるのは「届出」と読み替える。',
    expected: [{ type: 'application', text: '第10条' }],
    description: '読替え規定'
  },
  {
    id: 'application-4',
    category: '準用',
    text: '民法第90条の規定を準用する。',
    expected: [{ type: 'application', text: '民法第90条', targetLaw: '民法' }],
    description: '外部法令の準用'
  },
  {
    id: 'application-5',
    category: '準用',
    text: '第15条の規定は、本件について準用する。',
    expected: [{ type: 'application', text: '第15条' }],
    description: '後置準用'
  },
  {
    id: 'application-6',
    category: '準用',
    text: '第20条第2項中「大臣」とあるのは「知事」と読み替えて適用。',
    expected: [{ type: 'application', text: '第20条第2項' }],
    description: '項の読替え'
  },
  {
    id: 'application-7',
    category: '準用',
    text: '前条の規定を準用する。',
    expected: [{ type: 'application', text: '前条' }],
    description: '相対参照の準用'
  },
  {
    id: 'application-8',
    category: '準用',
    text: '第10条及び第11条の規定を準用する。',
    expected: [
      { type: 'application', text: '第10条' },
      { type: 'application', text: '第11条' }
    ],
    description: '複数条文の準用'
  },
  {
    id: 'application-9',
    category: '準用',
    text: '第5条の規定を、必要な変更を加えて準用する。',
    expected: [{ type: 'application', text: '第5条' }],
    description: '変更準用'
  },
  {
    id: 'application-10',
    category: '準用',
    text: '第3章の規定を準用する。',
    expected: [{ type: 'application', text: '第3章' }],
    description: '章の準用'
  },

  // === 複雑なパターン（10件） ===
  {
    id: 'complex-1',
    category: '複雑',
    text: '民法第90条及び商法第522条の規定により処理。',
    expected: [
      { type: 'external', text: '民法第90条', targetLaw: '民法' },
      { type: 'external', text: '商法第522条', targetLaw: '商法' }
    ],
    description: '複数法令の並列参照'
  },
  {
    id: 'complex-2',
    category: '複雑',
    text: '第10条（第3項を除く。）の規定を適用。',
    expected: [{ type: 'internal', text: '第10条' }],
    description: '除外規定付き参照'
  },
  {
    id: 'complex-3',
    category: '複雑',
    text: '第5条第1項各号に掲げる事項',
    expected: [{ type: 'internal', text: '第5条第1項' }],
    description: '各号列挙参照'
  },
  {
    id: 'complex-4',
    category: '複雑',
    text: '第10条第1項第3号イからハまで',
    expected: [{ type: 'internal', text: '第10条第1項第3号' }],
    description: 'いろは列挙参照'
  },
  {
    id: 'complex-5',
    category: '複雑',
    text: '第15条第2項ただし書の規定により',
    expected: [{ type: 'internal', text: '第15条第2項' }],
    description: 'ただし書参照'
  },
  {
    id: 'complex-6',
    category: '複雑',
    text: '第20条第1項本文の規定にかかわらず',
    expected: [{ type: 'internal', text: '第20条第1項' }],
    description: '本文参照'
  },
  {
    id: 'complex-7',
    category: '複雑',
    text: '第5条第1項第2号（同項第4号において準用する場合を含む。）',
    expected: [
      { type: 'internal', text: '第5条第1項第2号' },
      { type: 'internal', text: '同項第4号' }
    ],
    description: '準用を含む複合参照'
  },
  {
    id: 'complex-8',
    category: '複雑',
    text: '第10条第1項又は第2項の規定',
    expected: [{ type: 'internal', text: '第10条第1項又は第2項' }],
    description: '選択的項参照'
  },
  {
    id: 'complex-9',
    category: '複雑',
    text: '第3条第1項若しくは第2項又は第4条',
    expected: [
      { type: 'internal', text: '第3条第1項若しくは第2項' },
      { type: 'internal', text: '第4条' }
    ],
    description: '若しくは・又は複合'
  },
  {
    id: 'complex-10',
    category: '複雑',
    text: '第5条（第10条において準用する場合を含む。）の規定',
    expected: [
      { type: 'internal', text: '第5条' },
      { type: 'internal', text: '第10条' }
    ],
    description: '準用元と準用先の複合'
  },

  // === エッジケース（10件） ===
  {
    id: 'edge-1',
    category: 'エッジ',
    text: '第百条の規定により処理する。',
    expected: [{ type: 'internal', text: '第百条' }],
    description: '漢数字（百）'
  },
  {
    id: 'edge-2',
    category: 'エッジ',
    text: '第千条の規定を適用。',
    expected: [{ type: 'internal', text: '第千条' }],
    description: '漢数字（千）'
  },
  {
    id: 'edge-3',
    category: 'エッジ',
    text: '第一条から第千条まで',
    expected: [{ type: 'internal', text: '第一条から第千条まで' }],
    description: '大範囲の漢数字'
  },
  {
    id: 'edge-4',
    category: 'エッジ',
    text: '民法（明治29年法律第89号）第90条',
    expected: [{ type: 'external', text: '民法第90条', targetLaw: '民法' }],
    description: '法令番号付き'
  },
  {
    id: 'edge-5',
    category: 'エッジ',
    text: '第10条の2の規定により',
    expected: [{ type: 'internal', text: '第10条の2' }],
    description: '枝番条文'
  },
  {
    id: 'edge-6',
    category: 'エッジ',
    text: '第5条の3の2第1項',
    expected: [{ type: 'internal', text: '第5条の3の2第1項' }],
    description: '複雑な枝番'
  },
  {
    id: 'edge-7',
    category: 'エッジ',
    text: '新法第10条の規定により',
    expected: [{ type: 'defined', text: '新法第10条' }],
    description: '新法参照'
  },
  {
    id: 'edge-8',
    category: 'エッジ',
    text: '旧法第5条の規定は、なお効力を有する。',
    expected: [{ type: 'defined', text: '旧法第5条' }],
    description: '旧法参照'
  },
  {
    id: 'edge-9',
    category: 'エッジ',
    text: '令第10条の規定により',
    expected: [{ type: 'external', text: '令第10条' }],
    description: '政令の略称参照'
  },
  {
    id: 'edge-10',
    category: 'エッジ',
    text: '規則第5条の規定を適用',
    expected: [{ type: 'external', text: '規則第5条' }],
    description: '規則の略称参照'
  },

  // === 実務パターン（10件） ===
  {
    id: 'practical-1',
    category: '実務',
    text: '地方自治法第14条第3項の規定により条例を制定。',
    expected: [{ type: 'external', text: '地方自治法第14条第3項', targetLaw: '地方自治法' }],
    description: '地方自治法参照'
  },
  {
    id: 'practical-2',
    category: '実務',
    text: '行政手続法第5条の審査基準を定める。',
    expected: [{ type: 'external', text: '行政手続法第5条', targetLaw: '行政手続法' }],
    description: '行政手続法参照'
  },
  {
    id: 'practical-3',
    category: '実務',
    text: '建築基準法第6条の確認を受ける。',
    expected: [{ type: 'external', text: '建築基準法第6条', targetLaw: '建築基準法' }],
    description: '建築基準法参照'
  },
  {
    id: 'practical-4',
    category: '実務',
    text: '都市計画法第29条の開発許可を得る。',
    expected: [{ type: 'external', text: '都市計画法第29条', targetLaw: '都市計画法' }],
    description: '都市計画法参照'
  },
  {
    id: 'practical-5',
    category: '実務',
    text: '消防法第17条の技術基準に適合。',
    expected: [{ type: 'external', text: '消防法第17条', targetLaw: '消防法' }],
    description: '消防法参照'
  },
  {
    id: 'practical-6',
    category: '実務',
    text: '道路法第24条の承認を受ける。',
    expected: [{ type: 'external', text: '道路法第24条', targetLaw: '道路法' }],
    description: '道路法参照'
  },
  {
    id: 'practical-7',
    category: '実務',
    text: '河川法第26条の許可を得る。',
    expected: [{ type: 'external', text: '河川法第26条', targetLaw: '河川法' }],
    description: '河川法参照'
  },
  {
    id: 'practical-8',
    category: '実務',
    text: '農地法第5条の転用許可を受ける。',
    expected: [{ type: 'external', text: '農地法第5条', targetLaw: '農地法' }],
    description: '農地法参照'
  },
  {
    id: 'practical-9',
    category: '実務',
    text: '森林法第10条の2の開発許可。',
    expected: [{ type: 'external', text: '森林法第10条の2', targetLaw: '森林法' }],
    description: '森林法参照'
  },
  {
    id: 'practical-10',
    category: '実務',
    text: '環境影響評価法第5条の方法書を作成。',
    expected: [{ type: 'external', text: '環境影響評価法第5条', targetLaw: '環境影響評価法' }],
    description: '環境影響評価法参照'
  }
];

async function runComprehensiveTest(): Promise<void> {
  console.log(chalk.bold.cyan('\n=== 包括的テスト（80件） ===\n'));
  
  const detector = new UltimateReferenceDetector(false); // LLM無効
  const results: any[] = [];
  const categoryStats: Record<string, { total: number; success: number }> = {};
  
  for (const testCase of testCases) {
    // カテゴリ統計初期化
    if (!categoryStats[testCase.category]) {
      categoryStats[testCase.category] = { total: 0, success: 0 };
    }
    categoryStats[testCase.category].total++;
    
    // 参照検出（内部参照のために仮の法令IDを設定）
    const detected = await detector.detectReferences(
      testCase.text,
      'TEST_LAW_001',
      'テスト法',
      '第1条'
    );
    
    // 期待値と比較
    const success = compareResults(detected, testCase.expected);
    
    if (success) {
      categoryStats[testCase.category].success++;
      console.log(chalk.green(`✅ [${testCase.category}] ${testCase.description}`));
    } else {
      console.log(chalk.red(`❌ [${testCase.category}] ${testCase.description}`));
      console.log(chalk.gray(`   期待: ${JSON.stringify(testCase.expected.map(e => e.text))}`));
      console.log(chalk.gray(`   検出: ${JSON.stringify(detected.map(d => d.text))}`));
    }
    
    results.push({
      ...testCase,
      detected: detected.map(d => ({ type: d.type, text: d.text, targetLaw: d.targetLaw })),
      success
    });
  }
  
  // カテゴリ別統計
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('カテゴリ別結果'));
  console.log(chalk.bold('━'.repeat(60)));
  
  for (const [category, stats] of Object.entries(categoryStats)) {
    const rate = (stats.success / stats.total * 100).toFixed(1);
    const color = stats.success === stats.total ? chalk.green : 
                   stats.success / stats.total >= 0.8 ? chalk.yellow : chalk.red;
    console.log(color(`${category}: ${stats.success}/${stats.total} (${rate}%)`));
  }
  
  // 全体統計
  const totalSuccess = results.filter(r => r.success).length;
  const totalTests = results.length;
  const successRate = (totalSuccess / totalTests * 100).toFixed(1);
  
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('全体結果'));
  console.log(chalk.bold('━'.repeat(60)));
  
  console.log(`\n成功: ${totalSuccess}/${totalTests} (${successRate}%)`);
  
  // F1スコア計算
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  
  for (const result of results) {
    const detectedTexts = result.detected.map((d: any) => d.text);
    const expectedTexts = result.expected.map((e: any) => e.text);
    
    for (const detected of detectedTexts) {
      if (expectedTexts.includes(detected)) {
        truePositives++;
      } else {
        falsePositives++;
      }
    }
    
    for (const expected of expectedTexts) {
      if (!detectedTexts.includes(expected)) {
        falseNegatives++;
      }
    }
  }
  
  const precision = truePositives / (truePositives + falsePositives);
  const recall = truePositives / (truePositives + falseNegatives);
  const f1 = 2 * precision * recall / (precision + recall);
  
  console.log(`\n精度: ${(precision * 100).toFixed(1)}%`);
  console.log(`再現率: ${(recall * 100).toFixed(1)}%`);
  console.log(`F1スコア: ${(f1 * 100).toFixed(1)}%`);
  
  // 結果保存
  const outputPath = path.join(process.cwd(), 'Report', 'comprehensive_test_80.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      success: totalSuccess,
      successRate,
      precision: (precision * 100).toFixed(1),
      recall: (recall * 100).toFixed(1),
      f1Score: (f1 * 100).toFixed(1)
    },
    categoryStats,
    results
  }, null, 2));
  
  console.log(chalk.gray(`\n結果を保存: ${outputPath}`));
}

function compareResults(detected: any[], expected: any[]): boolean {
  const detectedTexts = detected.map(d => d.text).sort();
  const expectedTexts = expected.map(e => e.text).sort();
  
  if (detectedTexts.length !== expectedTexts.length) {
    return false;
  }
  
  return detectedTexts.every((text, index) => text === expectedTexts[index]);
}

// メイン実行
if (require.main === module) {
  runComprehensiveTest().catch(console.error);
}

export { runComprehensiveTest };