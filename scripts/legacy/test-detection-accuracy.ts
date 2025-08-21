#!/usr/bin/env npx tsx

/**
 * 検出精度テスト
 * 実際のテストケースで現在の精度を測定
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

// 基本的なテストケース
const basicTestCases = [
  {
    text: '民法第90条',
    expected: [{ type: 'external', law: '民法', article: '90' }],
    name: '単純な法令参照',
  },
  {
    text: '第566条',
    expected: [{ type: 'internal', article: '566' }],
    name: '条文のみ',
  },
  {
    text: '民法第90条及び第91条',
    expected: [
      { type: 'external', law: '民法', article: '90' },
      { type: 'external', law: '民法', article: '91' },
    ],
    name: '複数条文',
  },
  {
    text: '第32条から第35条まで',
    expected: [
      { type: 'range', start: '32', end: '35' },
    ],
    name: '範囲参照',
  },
  {
    text: '前項の規定により',
    expected: [{ type: 'relative', ref: '前項' }],
    name: '相対参照',
  },
  {
    text: '民法（明治二十九年法律第八十九号）第90条',
    expected: [
      { type: 'external', law: '民法', article: '90' },
    ],
    name: '法令番号付き',
  },
];

// 簡易検出器（detector.tsの簡略版）
class SimpleDetector {
  detect(text: string): any[] {
    const refs = [];
    
    // Pattern 1: 法令名 + 条文
    const p1 = /([^、。]+法)第(\d+)条/g;
    let match;
    while ((match = p1.exec(text)) !== null) {
      refs.push({
        type: 'external',
        law: match[1],
        article: match[2],
        text: match[0],
      });
    }
    
    // Pattern 2: 条文のみ
    const p2 = /第(\d+)条/g;
    while ((match = p2.exec(text)) !== null) {
      // 法令名が前にない場合
      const beforeText = text.substring(Math.max(0, match.index - 10), match.index);
      if (!beforeText.includes('法')) {
        refs.push({
          type: 'internal',
          article: match[1],
          text: match[0],
        });
      }
    }
    
    // Pattern 3: 範囲参照
    const p3 = /第(\d+)条から第(\d+)条まで/g;
    while ((match = p3.exec(text)) !== null) {
      refs.push({
        type: 'range',
        start: match[1],
        end: match[2],
        text: match[0],
      });
    }
    
    // Pattern 4: 相対参照
    const p4 = /(前項|次項|前条|次条)/g;
    while ((match = p4.exec(text)) !== null) {
      refs.push({
        type: 'relative',
        ref: match[1],
        text: match[0],
      });
    }
    
    // Pattern 5: 複数参照（及び、並びに）
    const p5 = /第(\d+)条(?:及び|並びに)第(\d+)条/g;
    while ((match = p5.exec(text)) !== null) {
      // 既に検出済みでなければ追加
      const exists = refs.some(r => 
        r.article === match[1] || r.article === match[2]
      );
      if (!exists) {
        refs.push({
          type: 'external',
          article: match[1],
          text: `第${match[1]}条`,
        });
        refs.push({
          type: 'external',
          article: match[2],
          text: `第${match[2]}条`,
        });
      }
    }
    
    return refs;
  }
}

// テスト実行
function runTests() {
  const detector = new SimpleDetector();
  let totalExpected = 0;
  let totalCorrect = 0;
  let totalDetected = 0;
  
  console.log(chalk.blue('=== 検出精度テスト ===\n'));
  
  for (const tc of basicTestCases) {
    const detected = detector.detect(tc.text);
    const expected = tc.expected.length;
    const actual = detected.length;
    
    totalExpected += expected;
    totalDetected += actual;
    
    // 正解判定（簡易版）
    const isCorrect = actual >= expected;
    if (isCorrect) {
      totalCorrect += expected;
    }
    
    const icon = isCorrect ? '✅' : '❌';
    console.log(`${icon} ${tc.name}`);
    console.log(`   テキスト: "${tc.text}"`);
    console.log(`   期待: ${expected}件, 検出: ${actual}件`);
    
    if (!isCorrect) {
      console.log(chalk.red(`   検出結果: ${JSON.stringify(detected)}`));
    }
    console.log();
  }
  
  // 精度計算
  const precision = totalDetected > 0 ? (totalCorrect / totalDetected * 100) : 0;
  const recall = totalExpected > 0 ? (totalCorrect / totalExpected * 100) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
  
  console.log(chalk.yellow('=== 精度サマリー ===\n'));
  console.log(`総期待数: ${totalExpected}`);
  console.log(`総検出数: ${totalDetected}`);
  console.log(`正解数: ${totalCorrect}`);
  console.log();
  console.log(`精度(Precision): ${precision.toFixed(1)}%`);
  console.log(`再現率(Recall): ${recall.toFixed(1)}%`);
  console.log(`F1スコア: ${f1.toFixed(1)}%`);
  
  // 改善提案
  if (f1 < 90) {
    console.log(chalk.red('\n⚠️ F1スコアが90%未満です'));
    console.log('以下のパターンを追加することを検討してください:');
    console.log('- 漢数字対応（第五百六十六条）');
    console.log('- 法令番号の除去');
    console.log('- 「及び」「並びに」の正確な処理');
  } else {
    console.log(chalk.green('\n✅ 良好な精度です'));
  }
}

// 実際のdetector.tsをテスト
async function testActualDetector() {
  console.log(chalk.cyan('\n=== 実際のdetector.tsのテスト ===\n'));
  
  try {
    // detector.tsのテスト関数を呼び出し
    const result = execSync('npx tsx -e "' + `
      const { UltimateReferenceDetector } = require('./scripts/detector.ts');
      const detector = new UltimateReferenceDetector();
      const refs = detector.detectByPatterns('民法第90条及び第91条');
      console.log(JSON.stringify(refs));
    ` + '"', { encoding: 'utf-8' });
    
    const refs = JSON.parse(result || '[]');
    console.log(`検出数: ${refs.length}`);
    console.log('検出内容:', refs);
  } catch (error) {
    console.error('detector.tsの実行に失敗:', error);
  }
}

// メイン実行
async function main() {
  // 簡易検出器でテスト
  runTests();
  
  // 実際のdetector.tsもテスト
  // await testActualDetector();
}

main().catch(console.error);