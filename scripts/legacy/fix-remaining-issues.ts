#!/usr/bin/env npx tsx

/**
 * 残存課題の修正
 * 1. 範囲参照パターンの追加
 * 2. テスト方法の改善
 */

import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

function fixDetector() {
  console.log(chalk.blue('=== 残存課題の修正 ===\n'));
  
  const detectorPath = 'scripts/detector.ts';
  let content = readFileSync(detectorPath, 'utf-8');
  const originalContent = content;
  
  // 1. 範囲参照パターンを探して、なければ追加
  const rangePatternCode = `
    // パターン4.5: 範囲参照
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
    }`;
  
  // detectByPattern内に範囲参照パターンが存在するか確認
  if (!content.includes('rangePattern')) {
    console.log(chalk.cyan('範囲参照パターンを追加'));
    
    // パターン4の後に追加
    const pattern4Index = content.indexOf('// パターン4: 複数条文');
    if (pattern4Index > 0) {
      // 次のパターンを探す
      const nextPatternIndex = content.indexOf('// パターン5:', pattern4Index);
      if (nextPatternIndex > 0) {
        content = content.slice(0, nextPatternIndex) + rangePatternCode + '\n\n    ' + content.slice(nextPatternIndex);
        console.log(chalk.green('✅ 範囲参照パターンを追加しました'));
      }
    }
  } else {
    console.log(chalk.gray('範囲参照パターンは既に存在します'));
  }
  
  // 2. test-real-detector.tsを修正（legacyから復元して修正）
  const testPath = 'scripts/test-real-detector.ts';
  const legacyTestPath = 'scripts/legacy/test-real-detector.ts';
  
  try {
    let testContent = readFileSync(legacyTestPath, 'utf-8');
    
    // detectByPatternをdetectに変更
    testContent = testContent.replace(
      'const references = (detector as any).detectByPattern(testCase.text);',
      'const references = await detector.detect(testCase.text);'
    );
    
    // 診断部分も修正
    testContent = testContent.replace(
      'const kanjiRefs = detector.detectByPatterns(kanjiTest!.text);',
      'const kanjiRefs = await detector.detect(kanjiTest!.text);'
    );
    testContent = testContent.replace(
      'const structRefs = detector.detectByPatterns(structTest!.text);',
      'const structRefs = await detector.detect(structTest!.text);'
    );
    testContent = testContent.replace(
      'const contextRefs = detector.detectByPatterns(contextTest!.text);',
      'const contextRefs = await detector.detect(contextTest!.text);'
    );
    
    writeFileSync(testPath, testContent);
    console.log(chalk.green('✅ test-real-detector.tsを修正しました'));
  } catch (e) {
    console.log(chalk.yellow('⚠️ test-real-detector.tsの修正をスキップ'));
  }
  
  // 変更を保存
  if (content !== originalContent) {
    writeFileSync(detectorPath + '.backup3', originalContent);
    writeFileSync(detectorPath, content);
    console.log(chalk.green('\n✅ detector.tsを更新しました'));
    console.log(chalk.gray('バックアップ: scripts/detector.ts.backup3'));
  }
}

function showNextSteps() {
  console.log(chalk.cyan('\n=== 次のステップ ===\n'));
  console.log('1. テストを実行して改善を確認:');
  console.log('   npx tsx scripts/test-real-detector.ts');
  console.log('\n2. 成功したら目標の90%を達成！');
  console.log('\n3. detectByContextが正しく呼ばれることを確認');
}

// メイン実行
fixDetector();
showNextSteps();