#!/usr/bin/env npx tsx
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';

const improvedDetector = new ImprovedReferenceDetector();
const oldDetector = new ComprehensiveReferenceDetector();

// テストケース
const testCases = [
  {
    name: '外部法令＋条＋項の包括的参照',
    text: '仲裁法（平成十五年法律第百三十八号）第二条第一項に規定する仲裁合意をいう。'
  },
  {
    name: '条＋項の内部参照',
    text: '第十七条第一項の規定により、前項の許可を得なければならない。'
  },
  {
    name: '複雑な複数参照',
    text: '第一条から第三条まで及び第五条第二項の規定を準用する。'
  },
  {
    name: '相対参照の複合',
    text: '前三項の規定は、次条第二項及び第三項において準用する。'
  },
  {
    name: '項・号の構造参照',
    text: '第一項第三号に掲げる事項については、同項第五号の規定を適用する。'
  }
];

console.log('=== 参照検出の比較テスト ===\n');

for (const testCase of testCases) {
  console.log(`📝 ${testCase.name}`);
  console.log(`   テキスト: "${testCase.text}"`);
  
  // 旧検出器
  const oldRefs = oldDetector.detectAllReferences(testCase.text);
  console.log(`   旧検出器: ${oldRefs.length}件`);
  if (oldRefs.length > 0) {
    oldRefs.forEach(r => {
      console.log(`     - [${r.type}] "${r.text}"`);
    });
  }
  
  // 新検出器
  const newRefs = improvedDetector.detectAllReferences(testCase.text);
  console.log(`   新検出器: ${newRefs.length}件`);
  if (newRefs.length > 0) {
    newRefs.forEach(r => {
      console.log(`     - [${r.type}] "${r.text}" (位置: ${r.startPos}-${r.endPos})`);
    });
  }
  
  // 改善度
  const improvement = newRefs.length - oldRefs.length;
  if (improvement > 0) {
    console.log(`   ✅ 改善: +${improvement}件の参照を追加検出`);
  } else if (improvement < 0) {
    console.log(`   ⚠️  注意: ${Math.abs(improvement)}件の参照が減少`);
  } else {
    console.log(`   → 同数の参照を検出`);
  }
  
  // 包括性チェック
  const longestOld = oldRefs.reduce((max, r) => r.text.length > max ? r.text.length : max, 0);
  const longestNew = newRefs.reduce((max, r) => r.text.length > max ? r.text.length : max, 0);
  if (longestNew > longestOld) {
    console.log(`   ✨ より包括的な参照を検出（最長: ${longestNew}文字）`);
  }
  
  console.log();
}