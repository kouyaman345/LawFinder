#!/usr/bin/env npx tsx
/**
 * 統合テストスイート
 * すべての参照検出テストを一元管理
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// テスト実行オプション
interface TestOptions {
  type?: 'basic' | 'edge' | 'extended' | 'real' | 'xml' | 'all';
  save?: boolean;
  verbose?: boolean;
}

/**
 * コマンドライン引数を解析
 */
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {
    type: 'all',
    save: false,
    verbose: false
  };

  for (const arg of args) {
    if (arg === '--save') {
      options.save = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--type=')) {
      options.type = arg.split('=')[1] as any;
    } else if (!arg.startsWith('--')) {
      options.type = arg as any;
    }
  }

  return options;
}

/**
 * テストの実行
 */
async function runTests(options: TestOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n=== LawFinder 統合テストスイート ===\n'));
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // 基本テスト
  if (options.type === 'basic' || options.type === 'all') {
    console.log(chalk.yellow('\n📝 基本機能テストを実行中...\n'));
    try {
      const { runBasicTests } = await import('./test-real-detector');
      const basicResults = await runBasicTests();
      results.tests.basic = basicResults;
      console.log(chalk.green('✅ 基本機能テスト完了\n'));
    } catch (error) {
      console.error(chalk.red('❌ 基本機能テストでエラー:'), error);
      results.tests.basic = { error: String(error) };
    }
  }

  // エッジケーステスト
  if (options.type === 'edge' || options.type === 'all') {
    console.log(chalk.yellow('\n🔧 エッジケーステストを実行中...\n'));
    try {
      const { runEdgeCaseTests } = await import('./test-edge-cases');
      const edgeResults = await runEdgeCaseTests();
      results.tests.edge = edgeResults;
      console.log(chalk.green('✅ エッジケーステスト完了\n'));
    } catch (error) {
      console.error(chalk.red('❌ エッジケーステストでエラー:'), error);
      results.tests.edge = { error: String(error) };
    }
  }

  // 拡張パターンテスト
  if (options.type === 'extended' || options.type === 'all') {
    console.log(chalk.yellow('\n🚀 拡張パターンテストを実行中...\n'));
    try {
      const { runExtendedTests } = await import('./test-extended-patterns');
      const extendedResults = await runExtendedTests();
      results.tests.extended = extendedResults;
      console.log(chalk.green('✅ 拡張パターンテスト完了\n'));
    } catch (error) {
      console.error(chalk.red('❌ 拡張パターンテストでエラー:'), error);
      results.tests.extended = { error: String(error) };
    }
  }

  // 実データ検証
  if (options.type === 'real' || options.type === 'all') {
    console.log(chalk.yellow('\n📊 実データ検証を実行中...\n'));
    try {
      const { runRealLawTests } = await import('./test-real-laws');
      const realResults = await runRealLawTests();
      results.tests.real = realResults;
      console.log(chalk.green('✅ 実データ検証完了\n'));
    } catch (error) {
      console.error(chalk.red('❌ 実データ検証でエラー:'), error);
      results.tests.real = { error: String(error) };
    }
  }

  // XML直接検証
  if (options.type === 'xml' || options.type === 'all') {
    console.log(chalk.yellow('\n📄 XML直接検証を実行中...\n'));
    try {
      const { runXMLValidation } = await import('./test-xml-direct');
      const xmlResults = await runXMLValidation();
      results.tests.xml = xmlResults;
      console.log(chalk.green('✅ XML直接検証完了\n'));
    } catch (error) {
      console.error(chalk.red('❌ XML直接検証でエラー:'), error);
      results.tests.xml = { error: String(error) };
    }
  }

  // サマリー表示
  console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.cyan('テストサマリー'));
  console.log(chalk.bold.cyan('='.repeat(60) + '\n'));

  let totalTests = 0;
  let successfulTests = 0;

  for (const [testType, testResult] of Object.entries(results.tests)) {
    if (testResult && typeof testResult === 'object' && !testResult.error) {
      totalTests++;
      const status = testResult.success !== false ? '✅' : '❌';
      if (testResult.success !== false) successfulTests++;
      console.log(`${status} ${testType.padEnd(15)}: 完了`);
    } else if (testResult && testResult.error) {
      totalTests++;
      console.log(`❌ ${testType.padEnd(15)}: エラー`);
    }
  }

  console.log(`\n成功率: ${successfulTests}/${totalTests} (${((successfulTests/totalTests)*100).toFixed(1)}%)`);

  // 結果を保存
  if (options.save) {
    const outputPath = path.join(process.cwd(), 'Report', 'test_suite_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(chalk.green(`\n📁 テスト結果を保存: ${outputPath}`));
  }

  // 推奨事項
  console.log(chalk.bold.cyan('\n推奨事項:'));
  if (successfulTests === totalTests) {
    console.log(chalk.green('✅ すべてのテストが成功しました。コードは安定しています。'));
  } else {
    console.log(chalk.yellow('⚠️ 一部のテストが失敗しました。詳細を確認してください。'));
  }
}

/**
 * ヘルプメッセージの表示
 */
function showHelp(): void {
  console.log(`
${chalk.bold('使用方法:')}
  npx tsx scripts/test-suite.ts [options] [type]

${chalk.bold('テストタイプ:')}
  basic      基本機能テスト
  edge       エッジケーステスト
  extended   拡張パターンテスト
  real       実データ検証
  xml        XML直接検証
  all        すべてのテスト（デフォルト）

${chalk.bold('オプション:')}
  --save     結果をJSONファイルに保存
  --verbose  詳細な出力を表示
  --help     このヘルプを表示

${chalk.bold('例:')}
  npx tsx scripts/test-suite.ts           # すべてのテストを実行
  npx tsx scripts/test-suite.ts edge      # エッジケーステストのみ
  npx tsx scripts/test-suite.ts --save    # 結果を保存
  `);
}

// メイン実行
if (require.main === module) {
  const options = parseArgs();
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    runTests(options).catch(console.error);
  }
}

export { runTests };