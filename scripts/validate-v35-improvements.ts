#!/usr/bin/env tsx

/**
 * v3.5.0 改善検証スクリプト
 * 規則・条例・告示・通達等の検出精度を測定
 */

import { EnhancedReferenceDetectorV34 } from '../src/domain/services/EnhancedReferenceDetectorV34';
import { EnhancedReferenceDetectorV35 } from '../src/domain/services/EnhancedReferenceDetectorV35';
import * as fs from 'fs';
import * as path from 'path';

// テストケース定義
interface TestCase {
  text: string;
  expectedTypes: string[];
  description: string;
}

const testCases: TestCase[] = [
  // 規則パターン
  {
    text: '最高裁判所規則第三号により定められた手続きに従い',
    expectedTypes: ['external'],
    description: '最高裁判所規則'
  },
  {
    text: '人事院規則一―三四第五条の規定に基づき',
    expectedTypes: ['external'],
    description: '人事院規則（番号付き）'
  },
  {
    text: '会計検査院規則第七号及び同規則第八号',
    expectedTypes: ['external', 'external'],
    description: '会計検査院規則'
  },
  {
    text: '国家公安委員会規則第十二号第三条',
    expectedTypes: ['external'],
    description: '委員会規則'
  },
  
  // 条例パターン
  {
    text: '東京都条例第百二十三号により制定された',
    expectedTypes: ['external'],
    description: '都条例（号数付き）'
  },
  {
    text: '横浜市条例第五条の規定に基づき',
    expectedTypes: ['external'],
    description: '市条例（条文付き）'
  },
  {
    text: '京都府環境保全条例第十二条第三項',
    expectedTypes: ['external'],
    description: '府条例（具体名付き）'
  },
  
  // 府令・内閣府令
  {
    text: '内閣府令第三十五号に定める基準',
    expectedTypes: ['external'],
    description: '内閣府令'
  },
  {
    text: '総理府令第十号（現内閣府令）',
    expectedTypes: ['external'],
    description: '府令'
  },
  
  // 省令パターン（改善版）
  {
    text: '厚生労働省令第百号により指定された',
    expectedTypes: ['external'],
    description: '厚生労働省令'
  },
  {
    text: '経済産業省令第二十三号第七条',
    expectedTypes: ['external'],
    description: '経済産業省令（条文付き）'
  },
  {
    text: '国土交通省令第五号の基準',
    expectedTypes: ['external'],
    description: '国土交通省令'
  },
  
  // 告示パターン（新規）
  {
    text: '厚生労働大臣告示第三百号により公示',
    expectedTypes: ['external'],
    description: '大臣告示'
  },
  {
    text: '文部科学省告示第百二十号',
    expectedTypes: ['external'],
    description: '省告示'
  },
  {
    text: '令和五年法務省告示第七号',
    expectedTypes: ['external'],
    description: '年号付き告示'
  },
  {
    text: '金融庁告示第十五号に基づく',
    expectedTypes: ['external'],
    description: '庁告示'
  },
  
  // 通達・通知パターン（新規）
  {
    text: '厚生労働省発基第〇三二一号通達',
    expectedTypes: ['external'],
    description: '省発通達'
  },
  {
    text: '文部科学省初等中等教育局長通知により',
    expectedTypes: ['external'],
    description: '局長通知'
  },
  {
    text: '総務省自治行政局長通達に従い',
    expectedTypes: ['external'],
    description: '局長通達'
  },
  
  // 訓令パターン（新規）
  {
    text: '防衛省訓令第八号により規定',
    expectedTypes: ['external'],
    description: '省訓令'
  },
  {
    text: '警察庁訓令第十二号',
    expectedTypes: ['external'],
    description: '庁訓令'
  },
  
  // 勅令パターン（歴史的）
  {
    text: '明治二十三年勅令第百号（旧商法）',
    expectedTypes: ['external'],
    description: '明治勅令'
  },
  {
    text: '大正十年勅令第三百号',
    expectedTypes: ['external'],
    description: '大正勅令'
  },
  {
    text: '昭和二十年勅令第五百四十二号',
    expectedTypes: ['external'],
    description: '昭和勅令'
  },
  
  // 複合パターン
  {
    text: '労働基準法施行令第五条及び同法施行規則第三条',
    expectedTypes: ['external', 'external'],
    description: '政令と省令の複合'
  },
  {
    text: '民法第九十条、商法第十条並びに会社法第二条',
    expectedTypes: ['external', 'external', 'external'],
    description: '複数法律の参照'
  }
];

class ImprovedReferenceValidator {
  private detectorV34: EnhancedReferenceDetectorV34;
  private detectorV35: EnhancedReferenceDetectorV35;
  
  constructor() {
    this.detectorV34 = new EnhancedReferenceDetectorV34();
    this.detectorV35 = new EnhancedReferenceDetectorV35();
  }
  
  validate() {
    console.log('='.repeat(80));
    console.log('v3.5.0 改善検証レポート');
    console.log('='.repeat(80));
    console.log(`検証日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    const results = {
      v34: { total: 0, correct: 0, byType: {} as Record<string, number> },
      v35: { total: 0, correct: 0, byType: {} as Record<string, number> }
    };
    
    const detailResults: any[] = [];
    
    // 各テストケースを実行
    for (const testCase of testCases) {
      const refsV34 = this.detectorV34.detectReferences(testCase.text);
      const refsV35 = this.detectorV35.detectReferences(testCase.text);
      
      // external参照のみをカウント
      const extRefsV34 = refsV34.filter(r => r.type === 'external');
      const extRefsV35 = refsV35.filter(r => r.type === 'external');
      
      const expectedCount = testCase.expectedTypes.filter(t => t === 'external').length;
      
      results.v34.total++;
      results.v35.total++;
      
      if (extRefsV34.length >= expectedCount) results.v34.correct++;
      if (extRefsV35.length >= expectedCount) results.v35.correct++;
      
      // カテゴリ別集計
      const category = this.getCategory(testCase.description);
      if (!results.v34.byType[category]) results.v34.byType[category] = 0;
      if (!results.v35.byType[category]) results.v35.byType[category] = 0;
      
      if (extRefsV34.length >= expectedCount) results.v34.byType[category]++;
      if (extRefsV35.length >= expectedCount) results.v35.byType[category]++;
      
      detailResults.push({
        description: testCase.description,
        text: testCase.text.substring(0, 50) + '...',
        expected: expectedCount,
        v34: extRefsV34.length,
        v35: extRefsV35.length,
        v34_success: extRefsV34.length >= expectedCount,
        v35_success: extRefsV35.length >= expectedCount,
        v35_targets: extRefsV35.map(r => r.targetLaw).filter(Boolean)
      });
    }
    
    // 結果表示
    console.log('## 全体精度比較');
    console.log();
    console.log(`| バージョン | 成功率 | 成功数/総数 |`);
    console.log(`|-----------|--------|------------|`);
    console.log(`| v3.4.0 | ${(results.v34.correct / results.v34.total * 100).toFixed(1)}% | ${results.v34.correct}/${results.v34.total} |`);
    console.log(`| v3.5.0 | ${(results.v35.correct / results.v35.total * 100).toFixed(1)}% | ${results.v35.correct}/${results.v35.total} |`);
    console.log();
    
    // カテゴリ別精度
    console.log('## カテゴリ別精度（v3.5.0）');
    console.log();
    console.log(`| カテゴリ | v3.4.0 | v3.5.0 | 改善 |`);
    console.log(`|---------|--------|--------|------|`);
    
    const categories = ['規則', '条例', '府令', '省令', '告示', '通達', '訓令', '勅令'];
    for (const cat of categories) {
      const v34Count = results.v34.byType[cat] || 0;
      const v35Count = results.v35.byType[cat] || 0;
      const catTotal = detailResults.filter(r => this.getCategory(r.description) === cat).length;
      
      if (catTotal > 0) {
        const v34Rate = (v34Count / catTotal * 100).toFixed(0);
        const v35Rate = (v35Count / catTotal * 100).toFixed(0);
        const improvement = v35Count - v34Count;
        const improvementStr = improvement > 0 ? `+${improvement}` : `${improvement}`;
        
        console.log(`| ${cat} | ${v34Rate}% (${v34Count}/${catTotal}) | ${v35Rate}% (${v35Count}/${catTotal}) | ${improvementStr} |`);
      }
    }
    console.log();
    
    // 詳細結果（失敗ケースのみ）
    console.log('## v3.5.0 で検出失敗したケース');
    console.log();
    
    const failures = detailResults.filter(r => !r.v35_success);
    if (failures.length === 0) {
      console.log('✅ すべてのテストケースで検出成功！');
    } else {
      for (const failure of failures) {
        console.log(`- **${failure.description}**`);
        console.log(`  - テキスト: "${failure.text}"`);
        console.log(`  - 期待: ${failure.expected}, v3.5検出: ${failure.v35}`);
        if (failure.v35_targets.length > 0) {
          console.log(`  - 検出内容: ${failure.v35_targets.join(', ')}`);
        }
      }
    }
    console.log();
    
    // 新規検出成功ケース
    console.log('## v3.5.0 で新たに検出成功したケース');
    console.log();
    
    const newSuccesses = detailResults.filter(r => !r.v34_success && r.v35_success);
    if (newSuccesses.length === 0) {
      console.log('新規成功ケースなし');
    } else {
      for (const success of newSuccesses) {
        console.log(`- ✅ **${success.description}**`);
        console.log(`  - 検出内容: ${success.v35_targets.join(', ')}`);
      }
    }
    
    // レポート保存
    const report = {
      version: 'v3.5.0',
      date: new Date().toISOString(),
      summary: {
        totalTests: testCases.length,
        v34Success: results.v34.correct,
        v35Success: results.v35.correct,
        improvement: results.v35.correct - results.v34.correct
      },
      categoryBreakdown: results.v35.byType,
      details: detailResults
    };
    
    fs.writeFileSync(
      path.join(process.cwd(), 'v35-improvement-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log();
    console.log('レポートを v35-improvement-report.json に保存しました');
  }
  
  private getCategory(description: string): string {
    if (description.includes('規則')) return '規則';
    if (description.includes('条例')) return '条例';
    if (description.includes('府令') || description.includes('内閣府令')) return '府令';
    if (description.includes('省令')) return '省令';
    if (description.includes('告示')) return '告示';
    if (description.includes('通達') || description.includes('通知')) return '通達';
    if (description.includes('訓令')) return '訓令';
    if (description.includes('勅令')) return '勅令';
    return 'その他';
  }
}

// 実行
const validator = new ImprovedReferenceValidator();
validator.validate();