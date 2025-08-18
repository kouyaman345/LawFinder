#!/usr/bin/env tsx

/**
 * v3.7.0 最終改善検証スクリプト
 * 残存課題の解決確認
 */

import { EnhancedReferenceDetectorV36 } from '../src/domain/services/EnhancedReferenceDetectorV36';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';

interface TestCase {
  text: string;
  category: string;
  expectedCount: number;
  description: string;
}

const testCases: TestCase[] = [
  // === 前回失敗したケース（優先検証） ===
  {
    text: '民法施行令第三条及び商法施行令第五条',
    category: '改善対象',
    expectedCount: 2,
    description: '複数施行令の並列'
  },
  {
    text: '省令で定める、又は告示により公示する',
    category: '改善対象',
    expectedCount: 2,
    description: '一般的表現（省令・告示）'
  },
  
  // === 追加の並列パターン ===
  {
    text: '労働基準法施行令第十条並びに労働安全衛生法施行令第三条',
    category: '並列処理',
    expectedCount: 2,
    description: '「並びに」で結ばれた施行令'
  },
  {
    text: '所得税法施行令第百条及び法人税法施行令第五十条',
    category: '並列処理',
    expectedCount: 2,
    description: '大きい数字の施行令並列'
  },
  {
    text: '財務省令第三号及び総務省令第七号',
    category: '並列処理',
    expectedCount: 2,
    description: '省令の並列（号数付き）'
  },
  
  // === 一般的表現パターン ===
  {
    text: '政令により定められた基準',
    category: '一般表現',
    expectedCount: 1,
    description: '政令により'
  },
  {
    text: '省令に基づく手続き',
    category: '一般表現',
    expectedCount: 1,
    description: '省令に基づく'
  },
  {
    text: '規則で定める事項',
    category: '一般表現',
    expectedCount: 1,
    description: '規則で定める'
  },
  {
    text: '告示により公示された内容',
    category: '一般表現',
    expectedCount: 1,
    description: '告示により'
  },
  {
    text: '条例に基づき実施する',
    category: '一般表現',
    expectedCount: 1,
    description: '条例に基づき'
  },
  {
    text: '通達により示された方針',
    category: '一般表現',
    expectedCount: 1,
    description: '通達により'
  },
  {
    text: '訓令に基づく運用',
    category: '一般表現',
    expectedCount: 1,
    description: '訓令に基づく'
  },
  
  // === 既存の成功ケース（再確認） ===
  {
    text: '建築基準法施行令第百二十条の規定により',
    category: '再確認',
    expectedCount: 1,
    description: '建築基準法施行令'
  },
  {
    text: '最高裁判所規則第三号により定められた手続きに従い',
    category: '再確認',
    expectedCount: 1,
    description: '最高裁判所規則'
  },
  {
    text: '人事院規則一―三四第五条の規定に基づき',
    category: '再確認',
    expectedCount: 1,
    description: '人事院規則（ハイフン番号）'
  },
  {
    text: '文部科学省初等中等教育局長通知により',
    category: '再確認',
    expectedCount: 1,
    description: '長い組織名の局長通知'
  },
  
  // === 複合パターン ===
  {
    text: '政令により定める基準及び省令に基づく手続き',
    category: '複合',
    expectedCount: 2,
    description: '政令と省令の一般表現'
  },
  {
    text: '民法第九十条、商法第五百条及び会社法施行令第三条',
    category: '複合',
    expectedCount: 3,
    description: '法律と施行令の混在'
  },
  {
    text: '告示により公示し、又は通達により周知する',
    category: '複合',
    expectedCount: 2,
    description: '告示と通達の一般表現'
  }
];

class FinalImprovementValidator {
  private detectorV36: EnhancedReferenceDetectorV36;
  private detectorV37: EnhancedReferenceDetectorV37;
  
  constructor() {
    this.detectorV36 = new EnhancedReferenceDetectorV36();
    this.detectorV37 = new EnhancedReferenceDetectorV37();
  }
  
  validate() {
    console.log('='.repeat(80));
    console.log('v3.7.0 最終改善検証レポート');
    console.log('='.repeat(80));
    console.log(`検証日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    const results = {
      v36: { total: 0, correct: 0, byCategory: {} as Record<string, {total: number, correct: number}> },
      v37: { total: 0, correct: 0, byCategory: {} as Record<string, {total: number, correct: number}> }
    };
    
    const detailResults: any[] = [];
    
    // カテゴリ初期化
    const categories = [...new Set(testCases.map(t => t.category))];
    for (const cat of categories) {
      results.v36.byCategory[cat] = { total: 0, correct: 0 };
      results.v37.byCategory[cat] = { total: 0, correct: 0 };
    }
    
    // 各テストケースを実行
    for (const testCase of testCases) {
      const refsV36 = this.detectorV36.detectReferences(testCase.text);
      const refsV37 = this.detectorV37.detectReferences(testCase.text);
      
      // external/internal参照をカウント
      const countV36 = refsV36.filter(r => r.type === 'external' || r.type === 'internal').length;
      const countV37 = refsV37.filter(r => r.type === 'external' || r.type === 'internal').length;
      
      const v36Success = countV36 >= testCase.expectedCount;
      const v37Success = countV37 >= testCase.expectedCount;
      
      results.v36.total++;
      results.v37.total++;
      results.v36.byCategory[testCase.category].total++;
      results.v37.byCategory[testCase.category].total++;
      
      if (v36Success) {
        results.v36.correct++;
        results.v36.byCategory[testCase.category].correct++;
      }
      if (v37Success) {
        results.v37.correct++;
        results.v37.byCategory[testCase.category].correct++;
      }
      
      detailResults.push({
        category: testCase.category,
        description: testCase.description,
        text: testCase.text,
        expected: testCase.expectedCount,
        v36: countV36,
        v37: countV37,
        v36_success: v36Success,
        v37_success: v37Success,
        improved: !v36Success && v37Success,
        v37_refs: refsV37.filter(r => r.type === 'external' || r.type === 'internal')
          .map(r => r.targetLaw || r.targetArticle || r.sourceText)
      });
    }
    
    // 結果表示
    console.log('## 全体精度比較');
    console.log();
    console.log('| バージョン | 成功率 | 成功数/総数 |');
    console.log('|-----------|--------|------------|');
    console.log(`| v3.6.0 | ${(results.v36.correct / results.v36.total * 100).toFixed(1)}% | ${results.v36.correct}/${results.v36.total} |`);
    console.log(`| v3.7.0 | ${(results.v37.correct / results.v37.total * 100).toFixed(1)}% | ${results.v37.correct}/${results.v37.total} |`);
    
    const improvement = ((results.v37.correct / results.v37.total) - (results.v36.correct / results.v36.total)) * 100;
    console.log(`| 改善率 | ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}% | ${results.v37.correct - results.v36.correct >= 0 ? '+' : ''}${results.v37.correct - results.v36.correct} |`);
    console.log();
    
    // カテゴリ別精度
    console.log('## カテゴリ別精度');
    console.log();
    console.log('| カテゴリ | v3.6.0 | v3.7.0 | 改善 |');
    console.log('|---------|--------|--------|------|');
    
    for (const cat of categories) {
      const v36Cat = results.v36.byCategory[cat];
      const v37Cat = results.v37.byCategory[cat];
      const v36Rate = v36Cat.total > 0 ? (v36Cat.correct / v36Cat.total * 100).toFixed(0) : '0';
      const v37Rate = v37Cat.total > 0 ? (v37Cat.correct / v37Cat.total * 100).toFixed(0) : '0';
      const catImprovement = v37Cat.correct - v36Cat.correct;
      const improvementStr = catImprovement >= 0 ? `+${catImprovement}` : `${catImprovement}`;
      
      console.log(`| ${cat} | ${v36Rate}% (${v36Cat.correct}/${v36Cat.total}) | ${v37Rate}% (${v37Cat.correct}/${v37Cat.total}) | ${improvementStr} |`);
    }
    console.log();
    
    // 改善対象の詳細
    console.log('## 改善対象ケースの結果');
    console.log();
    
    const fixTargets = detailResults.filter(r => r.category === '改善対象');
    for (const target of fixTargets) {
      const status = target.v37_success ? '✅' : '❌';
      const improveMark = target.improved ? ' [改善]' : '';
      console.log(`${status} **${target.description}**${improveMark}`);
      console.log(`  - テキスト: "${target.text}"`);
      console.log(`  - v3.6: ${target.v36}個, v3.7: ${target.v37}個 (期待: ${target.expected}個)`);
      if (target.v37_refs.length > 0) {
        console.log(`  - v3.7検出: ${target.v37_refs.join(', ')}`);
      }
      console.log();
    }
    
    // 新規成功ケース
    const newSuccesses = detailResults.filter(r => r.improved);
    if (newSuccesses.length > 0) {
      console.log('## v3.7.0で新たに成功したケース');
      console.log();
      for (const success of newSuccesses) {
        console.log(`✅ **${success.description}** [${success.category}]`);
        console.log(`  - 検出: ${success.v37_refs.join(', ')}`);
      }
      console.log();
    }
    
    // 未解決ケース
    const failures = detailResults.filter(r => !r.v37_success);
    if (failures.length > 0) {
      console.log('## 未解決のケース');
      console.log();
      for (const failure of failures) {
        console.log(`❌ **${failure.description}** [${failure.category}]`);
        console.log(`  - 期待: ${failure.expected}個, v3.7検出: ${failure.v37}個`);
      }
      console.log();
    }
    
    // サマリー
    console.log('## サマリー');
    console.log();
    
    const v37Rate = (results.v37.correct / results.v37.total * 100).toFixed(1);
    const fixedCount = fixTargets.filter(t => t.v37_success).length;
    const fixRate = (fixedCount / fixTargets.length * 100).toFixed(0);
    
    console.log(`✅ 全体成功率: ${v37Rate}%`);
    console.log(`✅ 改善対象の解決率: ${fixRate}% (${fixedCount}/${fixTargets.length})`);
    console.log(`✅ 総改善件数: ${results.v37.correct - results.v36.correct}件`);
    
    if (parseFloat(v37Rate) === 100) {
      console.log();
      console.log('🎉 **完全検出達成！** すべてのテストケースで成功しました！');
    }
  }
}

// 実行
const validator = new FinalImprovementValidator();
validator.validate();