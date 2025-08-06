#!/usr/bin/env npx tsx
/**
 * 参照検出テストスクリプト
 * 改善されたアルゴリズムの動作確認
 */

import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';

const detector = new ComprehensiveReferenceDetector();

// テストケース
const testCases = [
  {
    name: '単項への参照',
    text: '前項の規定により',
    expected: ['前項']
  },
  {
    name: '複数項への参照',
    text: '前二項の規定は、使用者又は監督者から被用者に対する求償権の行使を妨げない。',
    expected: ['前二項']
  },
  {
    name: '三項への参照',
    text: '前三項の規定を適用する。',
    expected: ['前三項']
  },
  {
    name: '条文参照',
    text: '第七百九条の規定により損害賠償の責任を負う。',
    expected: ['第七百九条']
  },
  {
    name: '外部法令参照',
    text: '商法第五百条の規定を準用する。',
    expected: ['商法第五百条']
  },
  {
    name: '範囲参照',
    text: '第一条から第五条までの規定',
    expected: ['第一条から第五条まで']
  },
  {
    name: '複数の参照',
    text: '第一条、第三条及び第五条の規定',
    expected: ['第一条、第三条及び第五条']
  }
];

console.log('🧪 参照検出テスト開始\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const results = detector.detectAllReferences(testCase.text);
  const detectedTexts = results.map(r => r.text);
  
  console.log(`📝 テスト: ${testCase.name}`);
  console.log(`   入力: "${testCase.text}"`);
  console.log(`   期待: ${testCase.expected.join(', ')}`);
  console.log(`   検出: ${detectedTexts.join(', ') || '(なし)'}`);
  
  // 期待される参照がすべて検出されているか確認
  const allFound = testCase.expected.every(exp => 
    detectedTexts.some(det => det.includes(exp) || exp.includes(det))
  );
  
  if (allFound) {
    console.log('   ✅ 成功\n');
    passed++;
  } else {
    console.log('   ❌ 失敗\n');
    failed++;
  }
}