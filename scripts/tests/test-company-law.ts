#!/usr/bin/env tsx
/**
 * 会社法専用テストケース
 * 会社法特有の複雑な参照パターンをテスト
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  text: string;
  expectedRefs: Array<{
    type: string;
    targetArticle?: string;
    targetLaw?: string;
    rangeStart?: string;
    rangeEnd?: string;
  }>;
  description: string;
}

const companyLawTestCases: TestCase[] = [
  {
    id: 'CL001',
    text: '第三百三十一条第一項（第三百三十五条第一項において準用する場合を含む。）の規定により',
    expectedRefs: [
      { type: 'internal', targetArticle: '第331条第1項' },
      { type: 'application', targetArticle: '第335条第1項' }
    ],
    description: '括弧内準用パターン'
  },
  {
    id: 'CL002',
    text: '第三百三十一条の二の規定は、設立時取締役及び設立時監査役について準用する',
    expectedRefs: [
      { type: 'internal', targetArticle: '第331条の2' }
    ],
    description: '条文枝番の準用'
  },
  {
    id: 'CL003',
    text: '第六十七条から第七十一条まで、第七十二条第一項及び第七十四条から第八十二条までの規定',
    expectedRefs: [
      { type: 'range', rangeStart: '第67条', rangeEnd: '第71条' },
      { type: 'internal', targetArticle: '第72条第1項' },
      { type: 'range', rangeStart: '第74条', rangeEnd: '第82条' }
    ],
    description: '複数範囲と個別条文の混在'
  },
  {
    id: 'CL004',
    text: 'この場合において、第一項及び第二項中「過半数」とあるのは、「三分の二以上に当たる多数」と読み替えるものとする',
    expectedRefs: [
      { type: 'relative', targetArticle: '第1項' },
      { type: 'relative', targetArticle: '第2項' }
    ],
    description: '読替え規定'
  },
  {
    id: 'CL005',
    text: '第九十条第二項において準用する同条第一項の規定により選任された',
    expectedRefs: [
      { type: 'internal', targetArticle: '第90条第2項' },
      { type: 'internal', targetArticle: '第90条第1項' }
    ],
    description: '同条参照を含む複雑な準用'
  },
  {
    id: 'CL006',
    text: '民法（明治二十九年法律第八十九号）第九十三条第一項ただし書及び第九十四条第一項の規定',
    expectedRefs: [
      { type: 'external', targetLaw: '民法', targetArticle: '第93条第1項' },
      { type: 'external', targetLaw: '民法', targetArticle: '第94条第1項' }
    ],
    description: '他法令への参照（法律番号付き）'
  },
  {
    id: 'CL007',
    text: '第百七十九条から第百七十九条の十までの規定',
    expectedRefs: [
      { type: 'range', rangeStart: '第179条', rangeEnd: '第179条の10' }
    ],
    description: '枝番を含む範囲参照'
  },
  {
    id: 'CL008',
    text: '前項の規定は、第百八条第二項第九号に掲げる事項（監査役に関するものに限る。）についての定款の定めについて準用する',
    expectedRefs: [
      { type: 'relative', targetArticle: '前項' },
      { type: 'internal', targetArticle: '第108条第2項第9号' }
    ],
    description: '号への参照と限定句'
  },
  {
    id: 'CL009',
    text: '第三項の規定は、設立時会計参与、設立時監査役及び設立時会計監査人の選任について準用する',
    expectedRefs: [
      { type: 'relative', targetArticle: '第3項' }
    ],
    description: '複数対象への準用'
  },
  {
    id: 'CL010',
    text: '前各項の規定は、次の各号に掲げる場合には、当該各号に定める事項については、適用しない',
    expectedRefs: [
      { type: 'relative', targetArticle: '前各項' }
    ],
    description: '適用除外規定'
  }
];

async function runCompanyLawTests() {
  console.log('🏢 会社法専用テスト開始\n');
  console.log('=' .repeat(80));
  
  let totalTests = 0;
  let passedTests = 0;
  const results: any[] = [];

  for (const testCase of companyLawTestCases) {
    totalTests++;
    console.log(`\n📝 テスト ${testCase.id}: ${testCase.description}`);
    console.log(`入力: "${testCase.text}"`);
    
    // CLIを使って参照検出を実行
    const result = execSync(
      `npx tsx scripts/cli.ts ref detect "${testCase.text}"`,
      { encoding: 'utf-8' }
    );
    
    // 結果をパース
    let detected: any[] = [];
    try {
      const lines = result.split('\n');
      const jsonLine = lines.find(l => l.includes('[') || l.includes('{'));
      if (jsonLine) {
        const jsonMatch = jsonLine.match(/\[.*\]|\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          detected = Array.isArray(parsed) ? parsed : [parsed];
        }
      }
    } catch (e) {
      // パースエラーの場合は空配列
      detected = [];
    }
    
    // 期待値と検出結果を比較
    let testPassed = true;
    const testResult = {
      id: testCase.id,
      description: testCase.description,
      expected: testCase.expectedRefs.length,
      detected: detected.length,
      matches: [] as any[],
      misses: [] as any[],
      extras: [] as any[]
    };

    // 期待される参照をチェック
    for (const expected of testCase.expectedRefs) {
      const found = detected.find(d => {
        if (d.type !== expected.type) return false;
        
        if (expected.targetArticle) {
          const normalizedExpected = expected.targetArticle.replace(/第|条|項|号/g, '');
          const normalizedDetected = (d.targetArticle || '').replace(/第|条|項|号/g, '');
          if (!normalizedDetected.includes(normalizedExpected)) return false;
        }
        
        if (expected.targetLaw && d.targetLaw !== expected.targetLaw) return false;
        
        if (expected.rangeStart && expected.rangeEnd) {
          const normalizedStart = expected.rangeStart.replace(/第|条/g, '');
          const normalizedEnd = expected.rangeEnd.replace(/第|条/g, '');
          const detectedStart = (d.rangeStart || '').replace(/第|条/g, '');
          const detectedEnd = (d.rangeEnd || '').replace(/第|条/g, '');
          if (detectedStart !== normalizedStart || detectedEnd !== normalizedEnd) return false;
        }
        
        return true;
      });

      if (found) {
        testResult.matches.push(expected);
        console.log(`  ✅ 検出: ${expected.type} - ${expected.targetArticle || expected.targetLaw || `${expected.rangeStart}〜${expected.rangeEnd}`}`);
      } else {
        testPassed = false;
        testResult.misses.push(expected);
        console.log(`  ❌ 未検出: ${expected.type} - ${expected.targetArticle || expected.targetLaw || `${expected.rangeStart}〜${expected.rangeEnd}`}`);
      }
    }

    // 余分な検出をチェック
    for (const d of detected) {
      const isExpected = testCase.expectedRefs.some(e => {
        if (d.type !== e.type) return false;
        // 簡略化した比較
        return true;
      });
      
      if (!isExpected) {
        testResult.extras.push({
          type: d.type,
          text: d.text,
          targetArticle: d.targetArticle
        });
        console.log(`  ⚠️ 余分: ${d.type} - "${d.text}"`);
      }
    }

    if (testPassed && testResult.extras.length === 0) {
      passedTests++;
      console.log(`  ✅ テスト成功`);
    } else {
      console.log(`  ❌ テスト失敗`);
    }

    results.push(testResult);
  }

  // 結果サマリー
  console.log('\n' + '=' .repeat(80));
  console.log('📊 テスト結果サマリー');
  console.log('=' .repeat(80));
  console.log(`総テスト数: ${totalTests}`);
  console.log(`成功: ${passedTests}`);
  console.log(`失敗: ${totalTests - passedTests}`);
  console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  // 詳細レポート生成
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
      successRate: ((passedTests / totalTests) * 100).toFixed(1)
    },
    details: results
  };

  const reportPath = path.join(__dirname, '..', 'Report', 'company_law_test_result.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 詳細レポート: ${reportPath}`);

  // 失敗パターンの分析
  if (totalTests > passedTests) {
    console.log('\n⚠️ 失敗パターン分析:');
    const failedTests = results.filter(r => r.misses.length > 0 || r.extras.length > 0);
    
    const missedTypes = new Map<string, number>();
    failedTests.forEach(t => {
      t.misses.forEach((m: any) => {
        missedTypes.set(m.type, (missedTypes.get(m.type) || 0) + 1);
      });
    });

    if (missedTypes.size > 0) {
      console.log('\n未検出パターン:');
      missedTypes.forEach((count, type) => {
        console.log(`  - ${type}: ${count}件`);
      });
    }
  }

  return passedTests === totalTests;
}

// メイン実行
if (require.main === module) {
  runCompanyLawTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('エラー:', error);
      process.exit(1);
    });
}

export { runCompanyLawTests, companyLawTestCases };