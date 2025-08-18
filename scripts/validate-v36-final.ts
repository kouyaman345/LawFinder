#!/usr/bin/env tsx

/**
 * v3.6.0 最終検証スクリプト
 * 残存課題の解決確認
 */

import { EnhancedReferenceDetectorV35 } from '../src/domain/services/EnhancedReferenceDetectorV35';
import { EnhancedReferenceDetectorV36 } from '../src/domain/services/EnhancedReferenceDetectorV36';
import * as fs from 'fs';
import * as path from 'path';

// テストケース定義（前回失敗した3つ + 追加検証）
interface TestCase {
  text: string;
  expectedTypes: string[];
  description: string;
  category: string;
}

const testCases: TestCase[] = [
  // 前回失敗したケース（優先検証）
  {
    text: '人事院規則一―三四第五条の規定に基づき',
    expectedTypes: ['external'],
    description: '人事院規則（ハイフン番号形式）',
    category: '修正対象'
  },
  {
    text: '人事院規則一ー三四により定められた基準',
    expectedTypes: ['external'],
    description: '人事院規則（長音記号）',
    category: '修正対象'
  },
  {
    text: '人事院規則八－一第三条第二項',
    expectedTypes: ['external'],
    description: '人事院規則（半角ハイフン）',
    category: '修正対象'
  },
  {
    text: '文部科学省初等中等教育局長通知により',
    expectedTypes: ['external'],
    description: '長い組織名を含む局長通知',
    category: '修正対象'
  },
  {
    text: '総務省自治行政局長通達に従い',
    expectedTypes: ['external'],
    description: '省＋局＋長の通達パターン',
    category: '修正対象'
  },
  {
    text: '厚生労働省医薬・生活衛生局長通知',
    expectedTypes: ['external'],
    description: '特殊文字を含む局名',
    category: '修正対象'
  },
  {
    text: '国土交通省住宅局建築指導課長通知第百二十号',
    expectedTypes: ['external'],
    description: '課長通知（番号付き）',
    category: '修正対象'
  },
  
  // 前回成功したケースの再確認
  {
    text: '最高裁判所規則第三号により定められた手続きに従い',
    expectedTypes: ['external'],
    description: '最高裁判所規則',
    category: '再確認'
  },
  {
    text: '会計検査院規則第七号及び同規則第八号',
    expectedTypes: ['external', 'external'],
    description: '会計検査院規則',
    category: '再確認'
  },
  {
    text: '東京都条例第百二十三号により制定された',
    expectedTypes: ['external'],
    description: '都条例（号数付き）',
    category: '再確認'
  },
  {
    text: '内閣府令第三十五号に定める基準',
    expectedTypes: ['external'],
    description: '内閣府令',
    category: '再確認'
  },
  {
    text: '厚生労働省令第百号により指定された',
    expectedTypes: ['external'],
    description: '厚生労働省令',
    category: '再確認'
  },
  {
    text: '厚生労働大臣告示第三百号により公示',
    expectedTypes: ['external'],
    description: '大臣告示',
    category: '再確認'
  },
  {
    text: '防衛省訓令第八号により規定',
    expectedTypes: ['external'],
    description: '省訓令',
    category: '再確認'
  },
  {
    text: '明治二十三年勅令第百号（旧商法）',
    expectedTypes: ['external'],
    description: '明治勅令',
    category: '再確認'
  },
  
  // 追加の複雑なケース
  {
    text: '経済産業省商務情報政策局サービス政策課長通達',
    expectedTypes: ['external'],
    description: '非常に長い組織階層',
    category: '複雑'
  },
  {
    text: '農林水産省消費・安全局長通知第三号',
    expectedTypes: ['external'],
    description: '中点を含む局名',
    category: '複雑'
  },
  {
    text: '環境省大臣官房廃棄物・リサイクル対策部長通知',
    expectedTypes: ['external'],
    description: '複数階層の組織名',
    category: '複雑'
  },
  {
    text: '公正取引委員会規則第十号第五条',
    expectedTypes: ['external'],
    description: '委員会規則（条文付き）',
    category: '複雑'
  },
  {
    text: '特別区条例第五十号',
    expectedTypes: ['external'],
    description: '特別区条例',
    category: '複雑'
  },
  {
    text: '文部科学省令第三号及び総務省令第七号',
    expectedTypes: ['external', 'external'],
    description: '複数省令の並列',
    category: '複雑'
  }
];

class FinalValidator {
  private detectorV35: EnhancedReferenceDetectorV35;
  private detectorV36: EnhancedReferenceDetectorV36;
  
  constructor() {
    this.detectorV35 = new EnhancedReferenceDetectorV35();
    this.detectorV36 = new EnhancedReferenceDetectorV36();
  }
  
  validate() {
    console.log('='.repeat(80));
    console.log('v3.6.0 最終検証レポート - 残存課題解決確認');
    console.log('='.repeat(80));
    console.log(`検証日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    const results = {
      v35: { total: 0, correct: 0, byCategory: {} as Record<string, {total: number, correct: number}> },
      v36: { total: 0, correct: 0, byCategory: {} as Record<string, {total: number, correct: number}> }
    };
    
    const detailResults: any[] = [];
    
    // カテゴリ初期化
    const categories = ['修正対象', '再確認', '複雑'];
    for (const cat of categories) {
      results.v35.byCategory[cat] = { total: 0, correct: 0 };
      results.v36.byCategory[cat] = { total: 0, correct: 0 };
    }
    
    // 各テストケースを実行
    for (const testCase of testCases) {
      const refsV35 = this.detectorV35.detectReferences(testCase.text);
      const refsV36 = this.detectorV36.detectReferences(testCase.text);
      
      // external参照のみをカウント
      const extRefsV35 = refsV35.filter(r => r.type === 'external');
      const extRefsV36 = refsV36.filter(r => r.type === 'external');
      
      const expectedCount = testCase.expectedTypes.filter(t => t === 'external').length;
      
      results.v35.total++;
      results.v36.total++;
      results.v35.byCategory[testCase.category].total++;
      results.v36.byCategory[testCase.category].total++;
      
      const v35Success = extRefsV35.length >= expectedCount;
      const v36Success = extRefsV36.length >= expectedCount;
      
      if (v35Success) {
        results.v35.correct++;
        results.v35.byCategory[testCase.category].correct++;
      }
      if (v36Success) {
        results.v36.correct++;
        results.v36.byCategory[testCase.category].correct++;
      }
      
      detailResults.push({
        category: testCase.category,
        description: testCase.description,
        text: testCase.text.substring(0, 50) + (testCase.text.length > 50 ? '...' : ''),
        expected: expectedCount,
        v35: extRefsV35.length,
        v36: extRefsV36.length,
        v35_success: v35Success,
        v36_success: v36Success,
        improved: !v35Success && v36Success,
        v36_targets: extRefsV36.map(r => r.targetLaw).filter(Boolean)
      });
    }
    
    // 結果表示
    console.log('## 全体精度比較');
    console.log();
    console.log(`| バージョン | 成功率 | 成功数/総数 |`);
    console.log(`|-----------|--------|------------|`);
    console.log(`| v3.5.0 | ${(results.v35.correct / results.v35.total * 100).toFixed(1)}% | ${results.v35.correct}/${results.v35.total} |`);
    console.log(`| v3.6.0 | ${(results.v36.correct / results.v36.total * 100).toFixed(1)}% | ${results.v36.correct}/${results.v36.total} |`);
    
    const improvement = ((results.v36.correct / results.v36.total) - (results.v35.correct / results.v35.total)) * 100;
    console.log(`| 改善率 | ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}% | ${results.v36.correct - results.v35.correct >= 0 ? '+' : ''}${results.v36.correct - results.v35.correct} |`);
    console.log();
    
    // カテゴリ別精度
    console.log('## カテゴリ別精度');
    console.log();
    console.log(`| カテゴリ | v3.5.0 | v3.6.0 | 改善 |`);
    console.log(`|---------|--------|--------|------|`);
    
    for (const cat of categories) {
      const v35Cat = results.v35.byCategory[cat];
      const v36Cat = results.v36.byCategory[cat];
      const v35Rate = v35Cat.total > 0 ? (v35Cat.correct / v35Cat.total * 100).toFixed(0) : '0';
      const v36Rate = v36Cat.total > 0 ? (v36Cat.correct / v36Cat.total * 100).toFixed(0) : '0';
      const catImprovement = v36Cat.correct - v35Cat.correct;
      const improvementStr = catImprovement >= 0 ? `+${catImprovement}` : `${catImprovement}`;
      
      console.log(`| ${cat} | ${v35Rate}% (${v35Cat.correct}/${v35Cat.total}) | ${v36Rate}% (${v36Cat.correct}/${v36Cat.total}) | ${improvementStr} |`);
    }
    console.log();
    
    // 重要：修正対象の改善確認
    console.log('## 前回失敗ケースの改善状況');
    console.log();
    
    const fixTargets = detailResults.filter(r => r.category === '修正対象');
    const fixedCount = fixTargets.filter(r => r.improved).length;
    
    console.log(`修正対象: ${fixedCount}/${fixTargets.length} 件が改善`);
    console.log();
    
    for (const target of fixTargets) {
      const status = target.v36_success ? '✅' : '❌';
      const improveMark = target.improved ? ' [改善]' : '';
      console.log(`${status} **${target.description}**${improveMark}`);
      console.log(`  - v3.5: ${target.v35}個検出, v3.6: ${target.v36}個検出 (期待: ${target.expected})`);
      if (target.v36_targets.length > 0) {
        console.log(`  - 検出内容: ${target.v36_targets.join(', ')}`);
      }
    }
    console.log();
    
    // 新規改善ケース
    console.log('## v3.6.0で新たに検出成功したケース');
    console.log();
    
    const newSuccesses = detailResults.filter(r => r.improved);
    if (newSuccesses.length === 0) {
      console.log('新規成功ケースなし');
    } else {
      for (const success of newSuccesses) {
        console.log(`- ✅ **${success.description}** [${success.category}]`);
        console.log(`  - 検出内容: ${success.v36_targets.join(', ')}`);
      }
    }
    console.log();
    
    // 失敗ケース詳細
    const failures = detailResults.filter(r => !r.v36_success);
    if (failures.length > 0) {
      console.log('## 未解決のケース');
      console.log();
      for (const failure of failures) {
        console.log(`- ❌ **${failure.description}** [${failure.category}]`);
        console.log(`  - テキスト: "${failure.text}"`);
        console.log(`  - 期待: ${failure.expected}, v3.6検出: ${failure.v36}`);
      }
    }
    
    // サマリー
    console.log();
    console.log('## サマリー');
    console.log();
    console.log(`✅ 全体成功率: ${(results.v36.correct / results.v36.total * 100).toFixed(1)}%`);
    console.log(`✅ 修正対象の改善率: ${(fixedCount / fixTargets.length * 100).toFixed(0)}%`);
    console.log(`✅ 総改善件数: ${results.v36.correct - results.v35.correct}件`);
    
    // レポート保存
    const report = {
      version: 'v3.6.0',
      date: new Date().toISOString(),
      summary: {
        totalTests: testCases.length,
        v35Success: results.v35.correct,
        v36Success: results.v36.correct,
        improvement: results.v36.correct - results.v35.correct,
        fixTargetImprovement: `${fixedCount}/${fixTargets.length}`
      },
      categoryBreakdown: results.v36.byCategory,
      details: detailResults
    };
    
    fs.writeFileSync(
      path.join(process.cwd(), 'v36-final-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log();
    console.log('レポートを v36-final-report.json に保存しました');
  }
}

// 実行
const validator = new FinalValidator();
validator.validate();