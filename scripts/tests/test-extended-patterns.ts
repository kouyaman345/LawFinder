#!/usr/bin/env npx tsx
/**
 * 拡張参照パターンテストスイート
 * より多様で複雑な参照パターンを網羅的にテスト
 */

import { UltimateReferenceDetector } from './detector';
import * as fs from 'fs';
import * as path from 'path';

interface ExtendedTestCase {
  category: string;
  name: string;
  text: string;
  expected: number;
  description: string;
  expectedTypes?: string[];
}

const extendedTestCases: ExtendedTestCase[] = [
  // === 1. 複雑な階層構造参照 ===
  {
    category: '階層構造',
    name: '部・編・章の複合参照',
    text: '第二編第三章第四節（第100条から第150条まで）',
    expected: 2,
    description: '編・章・節の階層と条文範囲',
    expectedTypes: ['structural', 'range']
  },
  {
    category: '階層構造',
    name: '款・目の詳細参照',
    text: '第一章第二節第三款第四目',
    expected: 1,
    description: '款と目を含む深い階層',
    expectedTypes: ['structural']
  },

  // === 2. 省略形の高度なパターン ===
  {
    category: '省略形',
    name: '多段階省略',
    text: '前項の規定により、同項第三号及び第四号',
    expected: 3,
    description: '前項、同項、複数号の組み合わせ',
    expectedTypes: ['relative', 'contextual', 'multiple']
  },
  {
    category: '省略形',
    name: '前々条・次々条',
    text: '前々条の規定は、次々条に定める場合を除き',
    expected: 2,
    description: '2つ前・2つ後の条文参照',
    expectedTypes: ['relative', 'relative']
  },

  // === 3. 範囲参照の複雑パターン ===
  {
    category: '範囲参照',
    name: '飛び番号の範囲',
    text: '第10条の2から第10条の15まで',
    expected: 1,
    description: '枝番号付きの大範囲',
    expectedTypes: ['range']
  },
  {
    category: '範囲参照',
    name: '混在範囲',
    text: '第5条第2項から第8条第1項まで',
    expected: 1,
    description: '条と項をまたぐ範囲',
    expectedTypes: ['range']
  },

  // === 4. 複数法令の複雑参照 ===
  {
    category: '複数法令',
    name: '3法令以上の並列',
    text: '民法第90条、商法第48条並びに会社法第2条',
    expected: 3,
    description: '3つの異なる法令への参照',
    expectedTypes: ['external', 'external', 'external']
  },
  {
    category: '複数法令',
    name: '法令名略称混在',
    text: '民法（明治二十九年法律第八十九号。以下「法」という。）第90条及び法第91条',
    expected: 3,
    description: '正式名称と略称の混在',
    expectedTypes: ['external', 'internal', 'internal']
  },

  // === 5. 準用・読替えの複雑パターン ===
  {
    category: '準用読替え',
    name: '多重準用',
    text: '第30条の規定は第40条について準用し、この場合において第30条中「許可」とあるのは「承認」と読み替える',
    expected: 3,
    description: '準用と読替えの組み合わせ',
    expectedTypes: ['application', 'internal', 'application']
  },
  {
    category: '準用読替え',
    name: '条件付き準用',
    text: '第50条から第55条までの規定は、前項に規定する場合について準用する',
    expected: 2,
    description: '範囲準用と前項参照',
    expectedTypes: ['application', 'relative']
  },

  // === 6. 特殊な法令形式 ===
  {
    category: '特殊形式',
    name: '政令・省令参照',
    text: '施行令第3条及び施行規則第15条第2項',
    expected: 2,
    description: '政令と省令への参照',
    expectedTypes: ['external', 'external']
  },
  {
    category: '特殊形式',
    name: '告示・通達参照',
    text: '平成三十年厚生労働省告示第百号第2条',
    expected: 1,
    description: '告示への参照',
    expectedTypes: ['external']
  },

  // === 7. 附則関連 ===
  {
    category: '附則',
    name: '附則の複雑参照',
    text: '附則第2条から第5条まで（附則第3条第2項を除く。）',
    expected: 2,
    description: '附則範囲と除外',
    expectedTypes: ['range', 'internal']
  },
  {
    category: '附則',
    name: '経過措置参照',
    text: '旧法第100条の規定は、なお効力を有する',
    expected: 1,
    description: '旧法への参照',
    expectedTypes: ['external']
  },

  // === 8. 列挙・並列の複雑パターン ===
  {
    category: '列挙並列',
    name: '号の複雑列挙',
    text: '第10条第1項第1号イからホまで及び同項第2号',
    expected: 2,
    description: 'イロハ列挙と号の組み合わせ',
    expectedTypes: ['range', 'contextual']
  },
  {
    category: '列挙並列',
    name: '選択的参照',
    text: '第20条若しくは第21条又は第22条から第25条までのいずれか',
    expected: 3,
    description: '若しくは、又は、いずれかの組み合わせ',
    expectedTypes: ['internal', 'internal', 'range']
  },

  // === 9. 文脈依存の高度なパターン ===
  {
    category: '文脈依存',
    name: '「当該」の連鎖',
    text: '当該申請に係る同条第2項各号に掲げる事項',
    expected: 1,
    description: '当該と同条の組み合わせ',
    expectedTypes: ['contextual']
  },
  {
    category: '文脈依存',
    name: '「その」の連鎖',
    text: 'その届出に関し前条第3項の規定により',
    expected: 1,
    description: 'そのと前条の組み合わせ',
    expectedTypes: ['relative']
  },

  // === 10. エッジケース ===
  {
    category: 'エッジケース',
    name: '漢数字の大きな数',
    text: '第千二百三十四条',
    expected: 1,
    description: '4桁の漢数字',
    expectedTypes: ['internal']
  },
  {
    category: 'エッジケース',
    name: '別表の複雑参照',
    text: '別表第一（第3条関係）の二の項第三号',
    expected: 1,
    description: '別表内の詳細位置',
    expectedTypes: ['structural']
  }
];

/**
 * テスト実行関数
 */
async function runExtendedTests(): Promise<void> {
  console.log('=== 拡張参照パターンテスト開始 ===\n');
  
  const detector = new UltimateReferenceDetector();
  const results: any[] = [];
  
  // カテゴリ別の統計
  const categoryStats: Map<string, { total: number; success: number }> = new Map();
  
  let totalTests = 0;
  let successfulTests = 0;
  let totalExpected = 0;
  let totalDetected = 0;
  let totalCorrect = 0;

  // カテゴリ別にテスト実行
  const categories = [...new Set(extendedTestCases.map(tc => tc.category))];
  
  for (const category of categories) {
    console.log(`\n## ${category}`);
    console.log('─'.repeat(50));
    
    const categoryTests = extendedTestCases.filter(tc => tc.category === category);
    let categorySuccess = 0;
    
    for (const testCase of categoryTests) {
      const references = await detector.detectReferences(testCase.text);
      const detected = references.length;
      const success = detected >= testCase.expected;
      
      if (success) {
        categorySuccess++;
        successfulTests++;
        console.log(`✅ ${testCase.name}`);
      } else {
        console.log(`❌ ${testCase.name}`);
      }
      
      console.log(`   説明: ${testCase.description}`);
      console.log(`   期待: ${testCase.expected}件, 検出: ${detected}件`);
      
      if (!success || process.argv.includes('--verbose')) {
        console.log(`   テキスト: "${testCase.text}"`);
        if (references.length > 0) {
          console.log('   検出内容:');
          references.forEach(ref => {
            console.log(`     - [${ref.type}] ${ref.text} (信頼度: ${ref.confidence})`);
          });
        }
      }
      
      // 統計更新
      totalTests++;
      totalExpected += testCase.expected;
      totalDetected += detected;
      totalCorrect += Math.min(detected, testCase.expected);
      
      // 結果記録
      results.push({
        category: testCase.category,
        name: testCase.name,
        text: testCase.text,
        expected: testCase.expected,
        detected: detected,
        success: success,
        description: testCase.description,
        references: references.map(r => ({
          type: r.type,
          text: r.text,
          confidence: r.confidence
        }))
      });
    }
    
    categoryStats.set(category, {
      total: categoryTests.length,
      success: categorySuccess
    });
  }

  // === 統計サマリー ===
  console.log('\n' + '='.repeat(60));
  console.log('=== テスト結果サマリー ===');
  console.log('='.repeat(60));
  
  console.log('\n【全体統計】');
  console.log(`テスト数: ${totalTests}`);
  console.log(`成功: ${successfulTests}/${totalTests} (${(successfulTests/totalTests*100).toFixed(1)}%)`);
  
  // F1スコア計算
  const precision = totalDetected > 0 ? totalCorrect / totalDetected : 0;
  const recall = totalExpected > 0 ? totalCorrect / totalExpected : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  
  console.log(`\n【検出精度】`);
  console.log(`期待総数: ${totalExpected}件`);
  console.log(`検出総数: ${totalDetected}件`);
  console.log(`正解数: ${totalCorrect}件`);
  console.log(`精度 (Precision): ${(precision * 100).toFixed(1)}%`);
  console.log(`再現率 (Recall): ${(recall * 100).toFixed(1)}%`);
  console.log(`F1スコア: ${(f1 * 100).toFixed(1)}%`);
  
  console.log('\n【カテゴリ別成功率】');
  for (const [category, stats] of categoryStats.entries()) {
    const rate = (stats.success / stats.total * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(stats.success / stats.total * 20));
    const emptyBar = '░'.repeat(20 - bar.length);
    console.log(`${category.padEnd(12)} ${bar}${emptyBar} ${stats.success}/${stats.total} (${rate}%)`);
  }
  
  // 失敗したテストの詳細
  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.log('\n【失敗したテスト】');
    for (const failure of failures) {
      console.log(`\n❌ [${failure.category}] ${failure.name}`);
      console.log(`   説明: ${failure.description}`);
      console.log(`   期待: ${failure.expected}件, 検出: ${failure.detected}件`);
      console.log(`   テキスト: "${failure.text}"`);
    }
  }
  
  // 結果をJSONファイルに保存
  if (process.argv.includes('--save')) {
    const outputPath = path.join(process.cwd(), 'Report', 'extended_patterns_test_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 テスト結果を保存: ${outputPath}`);
  }
  
  // 推奨事項
  console.log('\n【推奨事項】');
  if (f1 >= 0.95) {
    console.log('✅ 優秀な検出精度です。実環境での利用に適しています。');
  } else if (f1 >= 0.90) {
    console.log('⚠️ 良好な検出精度ですが、一部のパターンで改善の余地があります。');
  } else {
    console.log('❌ 検出精度に改善が必要です。失敗したパターンを分析してください。');
  }
}

// メイン実行
if (require.main === module) {
  runExtendedTests().catch(console.error);
}

export { extendedTestCases, runExtendedTests };