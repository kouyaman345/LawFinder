#!/usr/bin/env npx tsx
/**
 * ネガティブパターンフィルタリングのテスト
 * 精度向上を測定
 */

import { UltimateReferenceDetector } from './detector';
import { NegativePatternFilter } from './negative-patterns';
import chalk from 'chalk';

interface TestCase {
  text: string;
  expectedReferences: string[];
  shouldBeFiltered?: string[];
  description: string;
}

const testCases: TestCase[] = [
  {
    text: '民法第90条を削除する。',
    expectedReferences: [],
    shouldBeFiltered: ['民法第90条'],
    description: '削除規定のフィルタリング'
  },
  {
    text: '旧民法第90条の規定は適用しない。',
    expectedReferences: [],
    shouldBeFiltered: ['旧民法第90条'],
    description: '旧法参照のフィルタリング'
  },
  {
    text: '改正前の第5条は廃止された。',
    expectedReferences: [],
    shouldBeFiltered: ['第5条'],
    description: '改正前条文のフィルタリング'
  },
  {
    text: '第10条中「許可」を「届出」に改める。',
    expectedReferences: [],
    shouldBeFiltered: ['第10条'],
    description: '改正指示のフィルタリング'
  },
  {
    text: '第5条については、別途検討する。',
    expectedReferences: [],
    shouldBeFiltered: ['第5条'],
    description: '説明文のフィルタリング'
  },
  {
    text: '（仮称）第8条を新設する予定である。',
    expectedReferences: [],
    shouldBeFiltered: ['第8条'],
    description: '仮称条文のフィルタリング'
  },
  {
    text: '民法第90条の規定により、当該契約は無効とする。',
    expectedReferences: ['民法第90条'],
    shouldBeFiltered: [],
    description: '正常な参照（フィルタリングされない）'
  },
  {
    text: '第10条及び第11条の規定を適用する。',
    expectedReferences: ['第10条', '第11条'],
    shouldBeFiltered: [],
    description: '複数の正常な参照'
  },
  {
    text: '刑法第199条（殺人）の規定により処罰する。',
    expectedReferences: ['刑法第199条'],
    shouldBeFiltered: [],
    description: '括弧付き正常な参照'
  },
  {
    text: '第5条から第8条までを削除し、第9条を第5条とする。',
    expectedReferences: [],
    shouldBeFiltered: ['第5条', '第8条', '第9条'],
    description: '削除と移動指示の複合'
  },
  {
    text: '例えば第3条の規定がある。第3条の規定により手続きを行う。',
    expectedReferences: ['第3条'],
    shouldBeFiltered: ['第3条'], // 最初の「例えば」の方
    description: '同じ条文への異なる参照'
  },
  {
    text: '第15条　削除',
    expectedReferences: [],
    shouldBeFiltered: ['第15条'],
    description: '削除済み条文'
  },
  {
    text: '草案第10条に基づく規定を検討中。',
    expectedReferences: [],
    shouldBeFiltered: ['第10条'],
    description: '草案条文のフィルタリング'
  },
  {
    text: '第5条の趣旨は、公共の福祉にある。',
    expectedReferences: [],
    shouldBeFiltered: ['第5条'],
    description: '条文解説のフィルタリング'
  },
  {
    text: '第10条と比較して、第11条はより厳格である。',
    expectedReferences: ['第11条'],
    shouldBeFiltered: ['第10条'],
    description: '比較文での部分的フィルタリング'
  }
];

async function runNegativePatternTest(): Promise<void> {
  console.log(chalk.bold.cyan('\n=== ネガティブパターンフィルタリングテスト ===\n'));
  
  // 2つの検出器を作成（フィルタあり・なし）
  const detectorWithFilter = new UltimateReferenceDetector(false, true);
  const detectorWithoutFilter = new UltimateReferenceDetector(false, false);
  
  let totalCorrect = 0;
  let totalTests = 0;
  let falsePositivesReduced = 0;
  let truePositivesPreserved = 0;
  
  for (const testCase of testCases) {
    totalTests++;
    
    // フィルタありで検出
    const refsWithFilter = await detectorWithFilter.detectReferences(testCase.text);
    
    // フィルタなしで検出
    const refsWithoutFilter = await detectorWithoutFilter.detectReferences(testCase.text);
    
    // 期待される参照と比較
    const detectedTexts = refsWithFilter.map(r => r.text);
    const correct = arraysEqual(detectedTexts, testCase.expectedReferences);
    
    if (correct) {
      totalCorrect++;
      console.log(chalk.green(`✅ ${testCase.description}`));
      
      // 削減された誤検出をカウント
      const reducedCount = refsWithoutFilter.length - refsWithFilter.length;
      if (reducedCount > 0) {
        falsePositivesReduced += reducedCount;
        console.log(chalk.gray(`   誤検出を${reducedCount}件削減`));
      }
      
      // 保持された正しい参照をカウント
      if (refsWithFilter.length > 0) {
        truePositivesPreserved += refsWithFilter.length;
      }
    } else {
      console.log(chalk.red(`❌ ${testCase.description}`));
      console.log(chalk.gray(`   期待: ${JSON.stringify(testCase.expectedReferences)}`));
      console.log(chalk.gray(`   検出: ${JSON.stringify(detectedTexts)}`));
      console.log(chalk.gray(`   フィルタなし: ${JSON.stringify(refsWithoutFilter.map(r => r.text))}`));
    }
  }
  
  // 結果サマリー
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('テスト結果サマリー'));
  console.log(chalk.bold('━'.repeat(60)));
  
  const accuracy = (totalCorrect / totalTests * 100).toFixed(1);
  console.log(`\n成功率: ${totalCorrect}/${totalTests} (${accuracy}%)`);
  console.log(`削減された誤検出: ${falsePositivesReduced}件`);
  console.log(`保持された正しい参照: ${truePositivesPreserved}件`);
  
  // 改善効果の推定
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('改善効果の推定'));
  console.log(chalk.bold('━'.repeat(60)));
  
  if (falsePositivesReduced > 0) {
    const reductionRate = (falsePositivesReduced / (falsePositivesReduced + truePositivesPreserved) * 100).toFixed(1);
    console.log(`\n誤検出削減率: ${reductionRate}%`);
    console.log(chalk.green('✅ ネガティブパターンフィルタリングにより精度が向上しました'));
  }
  
  // ネガティブパターンの統計を表示
  const filter = new NegativePatternFilter();
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('ネガティブパターン統計'));
  console.log(chalk.bold('━'.repeat(60)));
  
  const allTexts = testCases.map(t => t.text).join('\n');
  const matchDetails = filter.getMatchDetails(allTexts);
  
  console.log(`\n総パターン数: ${filter['patterns'].length}`);
  console.log(`マッチしたパターン数: ${matchDetails.length}`);
  
  for (const detail of matchDetails) {
    console.log(`  - ${detail.pattern.name}: ${detail.matches.length}回`);
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

// メイン実行
if (require.main === module) {
  runNegativePatternTest().catch(console.error);
}

export { runNegativePatternTest };