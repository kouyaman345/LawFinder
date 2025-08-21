#!/usr/bin/env npx tsx

/**
 * 残存課題の問題分析と解決策
 * 範囲参照と文脈依存が検出されない原因を特定
 */

import chalk from 'chalk';
import { UltimateReferenceDetector } from './detector';

// 問題のあるテストケース
const problemCases = [
  {
    name: '範囲参照',
    text: '第32条から第35条まで',
    issue: '検出されない（0件）',
    expectedType: 'range or internal',
  },
  {
    name: '文脈依存（同法）',
    text: '同法第10条',
    issue: '検出されない（0件）',
    expectedType: 'contextual',
  },
  {
    name: '文脈依存（当該）',
    text: '当該規定',
    issue: '検出されない（0件）',
    expectedType: 'contextual',
  },
];

async function analyzeProblems() {
  console.log(chalk.blue('=== 残存課題の問題分析 ===\n'));
  
  const detector = new UltimateReferenceDetector();
  
  for (const testCase of problemCases) {
    console.log(chalk.yellow(`\n問題: ${testCase.name}`));
    console.log(`テキスト: "${testCase.text}"`);
    console.log(`症状: ${testCase.issue}`);
    console.log(`期待: ${testCase.expectedType}\n`);
    
    // 各メソッドを個別にテスト
    console.log('--- 各検出メソッドの結果 ---');
    
    // 1. detectByPatternのテスト
    try {
      const patternRefs = (detector as any).detectByPattern(testCase.text);
      console.log(`detectByPattern: ${patternRefs.length}件`);
      if (patternRefs.length > 0) {
        patternRefs.forEach((ref: any) => {
          console.log(`  - [${ref.type}] ${ref.text}`);
        });
      }
    } catch (e) {
      console.log(`detectByPattern: エラー`);
    }
    
    // 2. detectByContextのテスト
    try {
      const contextRefs = (detector as any).detectByContext(testCase.text);
      console.log(`detectByContext: ${contextRefs.length}件`);
      if (contextRefs.length > 0) {
        contextRefs.forEach((ref: any) => {
          console.log(`  - [${ref.type}] ${ref.text}`);
        });
      }
    } catch (e) {
      console.log(`detectByContext: エラー`);
    }
    
    // 3. メインのdetectメソッドのテスト
    try {
      const allRefs = await detector.detect(testCase.text);
      console.log(`detect（統合）: ${allRefs.length}件`);
      if (allRefs.length > 0) {
        allRefs.forEach((ref: any) => {
          console.log(`  - [${ref.type}] ${ref.text}`);
        });
      }
    } catch (e) {
      console.log(`detect: エラー`);
    }
    
    // 診断
    console.log(chalk.cyan('\n診断:'));
    diagnoseIssue(testCase);
  }
  
  // 解決策の提案
  proposeSolutions();
}

function diagnoseIssue(testCase: any) {
  if (testCase.name === '範囲参照') {
    console.log('原因: 範囲参照パターンが実装されていない可能性');
    console.log('確認事項:');
    console.log('1. /第(\\d+)条から第(\\d+)条まで/g パターンの存在');
    console.log('2. detectByPattern内での処理');
    console.log('3. パターンのマッチング条件');
  } else if (testCase.name.includes('文脈依存')) {
    console.log('原因: detectByContextが呼ばれていない、または実装が不完全');
    console.log('確認事項:');
    console.log('1. detectメソッドでdetectByContextが呼ばれているか');
    console.log('2. 文脈依存パターンの実装状態');
    console.log('3. contextStateの初期化状態');
  }
}

function proposeSolutions() {
  console.log(chalk.green('\n\n=== 解決策の提案 ===\n'));
  
  console.log(chalk.cyan('1. 範囲参照の修正'));
  console.log(`
実装すべきコード（detector.ts内）:
\`\`\`typescript
// パターン4.5: 範囲参照（detectByPattern内に追加）
const rangePattern = /第(\\d+)条から第(\\d+)条まで/g;
while ((match = rangePattern.exec(text)) !== null) {
  const startArticle = parseInt(match[1]);
  const endArticle = parseInt(match[2]);
  
  references.push({
    type: 'internal',
    text: match[0],
    targetArticle: \`\${startArticle}-\${endArticle}\`,
    confidence: 0.90,
    resolutionMethod: 'pattern',
    position: match.index
  });
}
\`\`\`
`);
  
  console.log(chalk.cyan('2. 文脈依存の修正'));
  console.log(`
実装すべきコード:
\`\`\`typescript
// detectByContext内、またはdetectByPattern内に追加
// 同法パターン
if (text.includes('同法')) {
  const sameLawPattern = /同法(?:第(\\d+)条)?/g;
  while ((match = sameLawPattern.exec(text)) !== null) {
    references.push({
      type: 'contextual',
      text: match[0],
      targetArticle: match[1] || undefined,
      confidence: 0.70,
      resolutionMethod: 'context',
      position: match.index
    });
  }
}

// 当該パターン
if (text.includes('当該')) {
  const thatPattern = /当該[^、。]{0,10}/g;
  while ((match = thatPattern.exec(text)) !== null) {
    references.push({
      type: 'contextual',
      text: match[0],
      confidence: 0.60,
      resolutionMethod: 'context',
      position: match.index
    });
  }
}
\`\`\`
`);
  
  console.log(chalk.cyan('3. テスト方法の改善'));
  console.log(`
テストではdetectByPatternではなく、メインのdetectメソッドを呼ぶべき:
\`\`\`typescript
// 修正前
const references = (detector as any).detectByPattern(testCase.text);

// 修正後
const references = await detector.detect(testCase.text);
\`\`\`
`);
  
  console.log(chalk.cyan('4. デバッグの追加'));
  console.log(`
パターンマッチのデバッグログを追加:
\`\`\`typescript
if (match) {
  console.log(\`Pattern matched: \${pattern} -> \${match[0]}\`);
}
\`\`\`
`);
}

// メイン実行
analyzeProblems().catch(console.error);