#!/usr/bin/env npx tsx

/**
 * 複雑なテストケース集
 * 文脈依存・曖昧表現・複雑構造を含むテストケース
 */

export interface ComplexTestCase {
  text: string;
  expected: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  type: 'contextual' | 'ambiguous' | 'complex' | 'nested' | 'implicit';
  description?: string;
}

export const complexTestCases: ComplexTestCase[] = [
  // === 既存の基本ケース（easy） ===
  {
    text: '民法第90条',
    expected: 1,
    name: '単純な法令参照',
    difficulty: 'easy',
    type: 'contextual',
  },
  {
    text: '第五百六十六条',
    expected: 1,
    name: '漢数字条文',
    difficulty: 'easy',
    type: 'contextual',
  },
  {
    text: '第三十二条から第三十二条の五まで',
    expected: 2,
    name: '範囲参照',
    difficulty: 'easy',
    type: 'complex',
  },
  {
    text: '前項の規定により',
    expected: 1,
    name: '相対参照',
    difficulty: 'easy',
    type: 'contextual',
  },

  // === 文脈依存の参照（medium） ===
  {
    text: '同法第10条',
    expected: 1,
    name: '同法参照',
    difficulty: 'medium',
    type: 'contextual',
    description: '直前に言及された法令を参照',
  },
  {
    text: '当該規定に基づき',
    expected: 1,
    name: '当該規定',
    difficulty: 'medium',
    type: 'contextual',
    description: '前文で言及された規定を参照',
  },
  {
    text: 'この条の規定',
    expected: 1,
    name: '自己参照',
    difficulty: 'medium',
    type: 'contextual',
  },
  {
    text: '同項第三号',
    expected: 1,
    name: '同項の号参照',
    difficulty: 'medium',
    type: 'contextual',
  },

  // === 曖昧な表現（hard） ===
  {
    text: 'その他の法令',
    expected: 0,
    name: '不特定法令',
    difficulty: 'hard',
    type: 'ambiguous',
    description: '具体的な法令が特定できない',
  },
  {
    text: '関係法令の定めるところにより',
    expected: 0,
    name: '関係法令',
    difficulty: 'hard',
    type: 'ambiguous',
  },
  {
    text: '別に法律で定める',
    expected: 0,
    name: '別法律',
    difficulty: 'hard',
    type: 'ambiguous',
  },
  {
    text: '政令で定めるところにより',
    expected: 0,
    name: '政令委任',
    difficulty: 'hard',
    type: 'ambiguous',
  },

  // === 複雑な構造参照（hard） ===
  {
    text: '前章第2節の規定',
    expected: 1,
    name: '章節参照',
    difficulty: 'hard',
    type: 'complex',
    description: '階層構造の参照',
  },
  {
    text: '第2編第3章第4節',
    expected: 1,
    name: '複数階層',
    difficulty: 'hard',
    type: 'complex',
  },
  {
    text: '次章から第5章まで',
    expected: 2,
    name: '章の範囲',
    difficulty: 'hard',
    type: 'complex',
  },
  {
    text: '前3条の規定',
    expected: 3,
    name: '複数条の相対参照',
    difficulty: 'hard',
    type: 'complex',
  },

  // === 入れ子・複合参照（extreme） ===
  {
    text: '民法第90条及び第91条並びに商法第1条',
    expected: 3,
    name: '複数法令複数条文',
    difficulty: 'extreme',
    type: 'nested',
  },
  {
    text: '第10条第2項第3号イからハまで',
    expected: 1,
    name: '号の範囲参照',
    difficulty: 'extreme',
    type: 'nested',
  },
  {
    text: '第32条の2から第32条の5まで（第32条の3を除く。）',
    expected: 2,
    name: '除外付き範囲',
    difficulty: 'extreme',
    type: 'nested',
  },
  {
    text: '第10条（第2項を除く。）及び第11条から第15条まで',
    expected: 2,
    name: '除外と範囲の複合',
    difficulty: 'extreme',
    type: 'nested',
  },

  // === 暗黙的参照（extreme） ===
  {
    text: '法第10条',
    expected: 1,
    name: '法略称',
    difficulty: 'extreme',
    type: 'implicit',
    description: '文脈から法令名を推定',
  },
  {
    text: '本法施行前の規定',
    expected: 1,
    name: '時間的参照',
    difficulty: 'extreme',
    type: 'implicit',
  },
  {
    text: '旧法第5条',
    expected: 1,
    name: '旧法参照',
    difficulty: 'extreme',
    type: 'implicit',
  },
  {
    text: 'この法律の施行の日から起算して三年を経過した日以後における第10条',
    expected: 1,
    name: '条件付き参照',
    difficulty: 'extreme',
    type: 'implicit',
  },
];

// テスト実行関数
export async function runComplexTests(detector: any) {
  const results = {
    easy: { total: 0, detected: 0, correct: 0 },
    medium: { total: 0, detected: 0, correct: 0 },
    hard: { total: 0, detected: 0, correct: 0 },
    extreme: { total: 0, detected: 0, correct: 0 },
  };

  console.log('=== 複雑なテストケースの実行 ===\n');

  for (const testCase of complexTestCases) {
    const refs = await detector.detect(testCase.text);
    const detected = refs.length;
    const isCorrect = detected >= testCase.expected;
    
    results[testCase.difficulty].total += testCase.expected;
    results[testCase.difficulty].detected += detected;
    if (isCorrect) results[testCase.difficulty].correct += testCase.expected;

    const icon = isCorrect ? '✅' : '❌';
    console.log(
      `[${testCase.difficulty.toUpperCase()}] ${testCase.name}: ` +
      `期待=${testCase.expected}, 検出=${detected} ${icon}`
    );
    
    if (testCase.description) {
      console.log(`  └─ ${testCase.description}`);
    }
  }

  console.log('\n=== 難易度別の精度 ===\n');
  
  for (const [difficulty, stats] of Object.entries(results)) {
    if (stats.total === 0) continue;
    
    const precision = stats.detected > 0 ? (stats.correct / stats.detected * 100) : 0;
    const recall = stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
    
    console.log(`${difficulty.toUpperCase()}:`);
    console.log(`  精度: ${precision.toFixed(1)}%`);
    console.log(`  再現率: ${recall.toFixed(1)}%`);
    console.log(`  F1スコア: ${f1.toFixed(1)}%`);
  }

  // 総合スコア
  const totalStats = Object.values(results).reduce(
    (acc, stats) => ({
      total: acc.total + stats.total,
      detected: acc.detected + stats.detected,
      correct: acc.correct + stats.correct,
    }),
    { total: 0, detected: 0, correct: 0 }
  );

  const totalPrecision = totalStats.detected > 0 ? (totalStats.correct / totalStats.detected * 100) : 0;
  const totalRecall = totalStats.total > 0 ? (totalStats.correct / totalStats.total * 100) : 0;
  const totalF1 = totalPrecision + totalRecall > 0 ? (2 * totalPrecision * totalRecall / (totalPrecision + totalRecall)) : 0;

  console.log('\n=== 総合スコア ===');
  console.log(`精度: ${totalPrecision.toFixed(1)}%`);
  console.log(`再現率: ${totalRecall.toFixed(1)}%`);
  console.log(`F1スコア: ${totalF1.toFixed(1)}%`);

  return {
    results,
    totalF1,
    difficultCases: complexTestCases.filter((tc, i) => {
      const refs = []; // Would need actual detection results
      return refs.length < tc.expected;
    }),
  };
}

// スタンドアロン実行
if (require.main === module) {
  // 簡易検出器でテスト
  const simpleDetector = {
    detect: async (text: string) => {
      const refs = [];
      
      // 基本パターン
      if (text.match(/[法条項号]/)) {
        refs.push({ text });
      }
      
      return refs;
    },
  };

  runComplexTests(simpleDetector).catch(console.error);
}