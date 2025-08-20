#!/usr/bin/env tsx

/**
 * v3.6.0 拡張パターンテスト
 * より多様な法令パターンでの検証
 */

import { EnhancedReferenceDetectorV36 } from '../src/domain/services/EnhancedReferenceDetectorV36';

interface ExtendedTestCase {
  text: string;
  category: string;
  subcategory: string;
  expectedCount: number;
  description: string;
}

const testCases: ExtendedTestCase[] = [
  // === 政令パターン ===
  {
    text: '建築基準法施行令第百二十条の規定により',
    category: '政令',
    subcategory: '施行令',
    expectedCount: 1,
    description: '建築基準法施行令'
  },
  {
    text: '民法施行令第三条及び商法施行令第五条',
    category: '政令',
    subcategory: '施行令',
    expectedCount: 2,
    description: '複数施行令'
  },
  {
    text: '関税定率法施行令別表第二',
    category: '政令',
    subcategory: '施行令',
    expectedCount: 1,
    description: '別表参照を含む施行令'
  },
  
  // === 省令パターン ===
  {
    text: '財務省令で定めるところにより',
    category: '省令',
    subcategory: '省令（一般）',
    expectedCount: 1,
    description: '財務省令'
  },
  {
    text: '法務省令第三号及び外務省令第五号',
    category: '省令',
    subcategory: '省令（号数付き）',
    expectedCount: 2,
    description: '複数省令（号数付き）'
  },
  {
    text: '環境省令・経済産業省令第一号',
    category: '省令',
    subcategory: '共同省令',
    expectedCount: 1,
    description: '共同省令'
  },
  {
    text: '厚生労働省関係構造改革特別区域法施行規則',
    category: '省令',
    subcategory: '施行規則',
    expectedCount: 1,
    description: '長い名称の施行規則'
  },
  
  // === 規則パターン ===
  {
    text: '国家公安委員会規則で定める基準',
    category: '規則',
    subcategory: '委員会規則',
    expectedCount: 1,
    description: '国家公安委員会規則'
  },
  {
    text: '原子力規制委員会規則第十号',
    category: '規則',
    subcategory: '委員会規則',
    expectedCount: 1,
    description: '原子力規制委員会規則'
  },
  {
    text: '日本銀行法施行規則第三条',
    category: '規則',
    subcategory: '施行規則',
    expectedCount: 1,
    description: '特殊法人の施行規則'
  },
  {
    text: '裁判所規則で定める事項',
    category: '規則',
    subcategory: '裁判所規則',
    expectedCount: 1,
    description: '裁判所規則（一般）'
  },
  
  // === 条例パターン ===
  {
    text: '北海道公安委員会が条例で定める',
    category: '条例',
    subcategory: '都道府県条例',
    expectedCount: 1,
    description: '道条例'
  },
  {
    text: '大阪府暴力団排除条例第十五条',
    category: '条例',
    subcategory: '都道府県条例',
    expectedCount: 1,
    description: '府条例（具体名）'
  },
  {
    text: 'さいたま市まちづくり条例第三条',
    category: '条例',
    subcategory: '市条例',
    expectedCount: 1,
    description: 'ひらがな市名条例'
  },
  {
    text: '千代田区景観まちづくり条例',
    category: '条例',
    subcategory: '区条例',
    expectedCount: 1,
    description: '区条例（具体名）'
  },
  
  // === 告示パターン ===
  {
    text: '国土交通大臣告示第千二百号',
    category: '告示',
    subcategory: '大臣告示',
    expectedCount: 1,
    description: '大臣告示（大きい数字）'
  },
  {
    text: '消費者庁告示により指定された',
    category: '告示',
    subcategory: '庁告示',
    expectedCount: 1,
    description: '庁告示'
  },
  {
    text: '平成二十年内閣府告示第一号',
    category: '告示',
    subcategory: '年号付き告示',
    expectedCount: 1,
    description: '平成年号告示'
  },
  {
    text: '令和元年総務省告示第百号',
    category: '告示',
    subcategory: '年号付き告示',
    expectedCount: 1,
    description: '令和元年告示'
  },
  
  // === 通達・通知パターン ===
  {
    text: '厚生労働省医政局長通知（医政発〇三二一第一号）',
    category: '通達',
    subcategory: '発番号付き',
    expectedCount: 1,
    description: '発番号付き通知'
  },
  {
    text: '国税庁長官通達により示された基準',
    category: '通達',
    subcategory: '長官通達',
    expectedCount: 1,
    description: '長官通達'
  },
  {
    text: '文部科学省高等教育局私学部長通知',
    category: '通達',
    subcategory: '部長通知',
    expectedCount: 1,
    description: '複数階層の部長通知'
  },
  {
    text: '警察庁生活安全局生活経済対策管理官通達',
    category: '通達',
    subcategory: '管理官通達',
    expectedCount: 1,
    description: '管理官通達'
  },
  
  // === 訓令パターン ===
  {
    text: '法務省訓令第三号により',
    category: '訓令',
    subcategory: '省訓令',
    expectedCount: 1,
    description: '法務省訓令'
  },
  {
    text: '海上保安庁訓令第十五号',
    category: '訓令',
    subcategory: '庁訓令',
    expectedCount: 1,
    description: '海上保安庁訓令'
  },
  
  // === 複合・複雑パターン ===
  {
    text: '民法第九十条、商法第五百条及び会社法第二条第一項',
    category: '複合',
    subcategory: '複数法律',
    expectedCount: 3,
    description: '複数法律の条文参照'
  },
  {
    text: '労働基準法（昭和二十二年法律第四十九号）第三十六条',
    category: '複合',
    subcategory: '法律番号付き',
    expectedCount: 1,
    description: '法律番号を含む参照'
  },
  {
    text: '所得税法施行令第百条及び同令第百一条',
    category: '複合',
    subcategory: '同令参照',
    expectedCount: 2,
    description: '同令を使った参照'
  },
  {
    text: '建築基準法第六条第一項第四号に規定する建築物',
    category: '複合',
    subcategory: '号まで含む',
    expectedCount: 1,
    description: '項・号まで含む詳細参照'
  },
  
  // === エッジケース ===
  {
    text: '平成から令和への改元に伴う告示の取扱い',
    category: 'エッジケース',
    subcategory: '年号のみ',
    expectedCount: 0,
    description: '年号だけでは参照にならない'
  },
  {
    text: '省令で定める、又は告示により公示する',
    category: 'エッジケース',
    subcategory: '一般的表現',
    expectedCount: 2,
    description: '一般的な省令・告示'
  },
  {
    text: '人事院規則一〇―四（職員の保健及び安全管理）',
    category: 'エッジケース',
    subcategory: '全角数字',
    expectedCount: 1,
    description: '全角数字の人事院規則'
  },
  {
    text: '租税特別措置法（昭和三十二年法律第二十六号）第七十条の七第一項',
    category: 'エッジケース',
    subcategory: '長い法律名',
    expectedCount: 1,
    description: '長い法律名と詳細参照'
  }
];

class ExtendedPatternValidator {
  private detector: EnhancedReferenceDetectorV36;
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV36();
  }
  
  validate() {
    console.log('='.repeat(80));
    console.log('v3.6.0 拡張パターンテスト - 多様な法令パターンの検証');
    console.log('='.repeat(80));
    console.log(`検証日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    const results = {
      total: 0,
      success: 0,
      byCategory: {} as Record<string, {total: number, success: number, details: any[]}>,
      failures: [] as any[]
    };
    
    // カテゴリ初期化
    const categories = [...new Set(testCases.map(t => t.category))];
    for (const cat of categories) {
      results.byCategory[cat] = { total: 0, success: 0, details: [] };
    }
    
    // 各テストケースを実行
    for (const testCase of testCases) {
      const refs = this.detector.detectReferences(testCase.text);
      const extRefs = refs.filter(r => r.type === 'external' || r.type === 'internal');
      
      const success = extRefs.length >= testCase.expectedCount;
      
      results.total++;
      results.byCategory[testCase.category].total++;
      
      if (success) {
        results.success++;
        results.byCategory[testCase.category].success++;
      } else {
        results.failures.push({
          ...testCase,
          detected: extRefs.length,
          refs: extRefs.map(r => ({
            type: r.type,
            text: r.sourceText,
            target: r.targetLaw || r.targetArticle
          }))
        });
      }
      
      results.byCategory[testCase.category].details.push({
        description: testCase.description,
        text: testCase.text,
        expected: testCase.expectedCount,
        detected: extRefs.length,
        success,
        refs: extRefs.map(r => r.targetLaw || r.targetArticle || r.sourceText)
      });
    }
    
    // 結果表示
    console.log('## 全体結果');
    console.log();
    console.log(`成功率: ${(results.success / results.total * 100).toFixed(1)}% (${results.success}/${results.total})`);
    console.log();
    
    // カテゴリ別結果
    console.log('## カテゴリ別結果');
    console.log();
    console.log('| カテゴリ | 成功率 | 成功/総数 |');
    console.log('|----------|--------|-----------|');
    
    for (const [cat, data] of Object.entries(results.byCategory)) {
      const rate = data.total > 0 ? (data.success / data.total * 100).toFixed(0) : '0';
      console.log(`| ${cat} | ${rate}% | ${data.success}/${data.total} |`);
    }
    console.log();
    
    // 失敗ケース詳細
    if (results.failures.length > 0) {
      console.log('## 検出失敗ケース');
      console.log();
      
      for (const failure of results.failures) {
        console.log(`### ${failure.description} [${failure.category}]`);
        console.log(`- テキスト: "${failure.text}"`);
        console.log(`- 期待: ${failure.expectedCount}個, 検出: ${failure.detected}個`);
        if (failure.refs.length > 0) {
          console.log(`- 検出内容:`);
          for (const ref of failure.refs) {
            console.log(`  - ${ref.type}: ${ref.target || ref.text}`);
          }
        }
        console.log();
      }
    } else {
      console.log('## すべてのテストケースが成功！ ✅');
    }
    
    // カテゴリ別詳細（サマリー）
    console.log('## カテゴリ別サマリー');
    console.log();
    
    for (const [cat, data] of Object.entries(results.byCategory)) {
      if (data.total > 0) {
        console.log(`### ${cat}`);
        const successCases = data.details.filter(d => d.success);
        const failureCases = data.details.filter(d => !d.success);
        
        if (successCases.length > 0) {
          console.log('✅ 成功:');
          for (const s of successCases.slice(0, 3)) {
            console.log(`  - ${s.description}`);
          }
          if (successCases.length > 3) {
            console.log(`  ... 他${successCases.length - 3}件`);
          }
        }
        
        if (failureCases.length > 0) {
          console.log('❌ 失敗:');
          for (const f of failureCases) {
            console.log(`  - ${f.description} (期待${f.expected}個→検出${f.detected}個)`);
          }
        }
        console.log();
      }
    }
    
    // 検出パターンの統計
    console.log('## 検出パターン統計');
    console.log();
    
    const allRefs = testCases.flatMap(tc => {
      const refs = this.detector.detectReferences(tc.text);
      return refs.map(r => ({
        lawType: r.metadata?.lawType,
        targetLaw: r.targetLaw
      }));
    });
    
    const lawTypeCount: Record<string, number> = {};
    for (const ref of allRefs) {
      if (ref.lawType) {
        lawTypeCount[ref.lawType] = (lawTypeCount[ref.lawType] || 0) + 1;
      }
    }
    
    if (Object.keys(lawTypeCount).length > 0) {
      console.log('| 法令種別 | 検出回数 |');
      console.log('|---------|----------|');
      for (const [type, count] of Object.entries(lawTypeCount).sort((a, b) => b[1] - a[1])) {
        console.log(`| ${type} | ${count} |`);
      }
    }
    
    console.log();
    console.log(`総合評価: ${results.success / results.total >= 0.9 ? '✅ 優秀' : results.success / results.total >= 0.8 ? '⚠️ 良好' : '❌ 要改善'}`);
  }
}

// 実行
const validator = new ExtendedPatternValidator();
validator.validate();