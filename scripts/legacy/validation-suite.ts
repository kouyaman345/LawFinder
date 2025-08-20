#!/usr/bin/env npx tsx

/**
 * 統合検証スイート
 * 
 * 参照検出のテスト、e-Gov比較、大規模検証、失敗分析を統合管理
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedReferenceDetectorV41 } from '../../src/domain/services/EnhancedReferenceDetectorV41';
import { ReferenceDetector } from '../../src/domain/services/ReferenceDetector';
import { ComprehensiveReferenceDetector } from '../../src/domain/services/ComprehensiveReferenceDetector';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const program = new Command();

interface ValidationResult {
  lawId: string;
  title: string;
  totalReferences: number;
  validReferences: number;
  invalidReferences: number;
  accuracy: number;
  errors: string[];
  timestamp: Date;
}

interface ComparisonResult {
  lawId: string;
  title: string;
  ourCount: number;
  egovCount: number;
  matchRate: number;
  missingReferences: string[];
  extraReferences: string[];
}

/**
 * 検出エンジンのマッピング
 */
const DETECTORS = {
  'v41': new EnhancedReferenceDetectorV41(),
  'comprehensive': new ComprehensiveReferenceDetector(),
  'basic': new ReferenceDetector()
};

/**
 * テストケースの定義
 */
const TEST_CASES = [
  {
    text: '第1条の規定により',
    expected: { type: 'internal', articleNumber: '第1条' }
  },
  {
    text: '民法第90条',
    expected: { type: 'external', lawId: '129AC0000000089', articleNumber: '第90条' }
  },
  {
    text: '前条の規定',
    expected: { type: 'relative', relationType: 'previous' }
  },
  {
    text: '第1条から第3条まで',
    expected: { type: 'range', startArticle: '第1条', endArticle: '第3条' }
  },
  {
    text: '第1条及び第2条',
    expected: { type: 'multiple', articles: ['第1条', '第2条'] }
  }
];

/**
 * 基本テストコマンド
 */
program
  .command('test')
  .description('参照検出エンジンのテスト')
  .option('-e, --engine <type>', '検出エンジン (v41/comprehensive/basic)', 'v41')
  .option('-v, --verbose', '詳細出力')
  .option('-s, --save', '結果をファイルに保存')
  .action(async (options) => {
    const spinner = ora('テストを実行中...').start();
    const detector = DETECTORS[options.engine as keyof typeof DETECTORS];

    if (!detector) {
      spinner.fail(`不明なエンジン: ${options.engine}`);
      return;
    }

    try {
      const results: any[] = [];
      let passed = 0;
      let failed = 0;

      for (const testCase of TEST_CASES) {
        const detected = detector.detectReferences(testCase.text);
        const success = detected.length > 0 && 
                       detected[0].type === testCase.expected.type;

        if (success) {
          passed++;
          if (options.verbose) {
            console.log(chalk.green(`✓ ${testCase.text}`));
          }
        } else {
          failed++;
          if (options.verbose) {
            console.log(chalk.red(`✗ ${testCase.text}`));
            console.log(chalk.gray(`  期待: ${JSON.stringify(testCase.expected)}`));
            console.log(chalk.gray(`  実際: ${JSON.stringify(detected[0] || {})}`));
          }
        }

        results.push({
          text: testCase.text,
          expected: testCase.expected,
          detected: detected[0] || null,
          success
        });
      }

      spinner.succeed(`テスト完了: ${passed}/${TEST_CASES.length} 成功`);

      if (options.save) {
        const outputPath = path.join(process.cwd(), 'Report', 
          `test_results_${options.engine}_${Date.now()}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(chalk.cyan(`結果を保存: ${outputPath}`));
      }

      // サマリー表示
      console.log(chalk.cyan('\n📊 テスト結果サマリー'));
      console.log('='.repeat(50));
      console.log(`エンジン: ${chalk.yellow(options.engine)}`);
      console.log(`成功: ${chalk.green(passed)}件`);
      console.log(`失敗: ${chalk.red(failed)}件`);
      console.log(`成功率: ${chalk.yellow(((passed / TEST_CASES.length) * 100).toFixed(1) + '%')}`);

    } catch (error) {
      spinner.fail('テストに失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * e-Gov比較コマンド
 */
program
  .command('compare')
  .description('e-Govとの参照検出結果を比較')
  .option('-l, --law-id <id>', '特定の法令IDを指定')
  .option('-m, --major', '主要法令のみ比較')
  .option('-d, --detail', '詳細な差分を表示')
  .action(async (options) => {
    const spinner = ora('e-Govデータと比較中...').start();

    try {
      // 比較対象の法令を取得
      let laws;
      if (options.lawId) {
        laws = await prisma.law.findMany({
          where: { lawId: options.lawId }
        });
      } else if (options.major) {
        const majorLawIds = [
          '129AC0000000089', // 民法
          '140AC0000000045', // 刑法
          '417AC0000000086', // 会社法
        ];
        laws = await prisma.law.findMany({
          where: { lawId: { in: majorLawIds } }
        });
      } else {
        laws = await prisma.law.findMany({ take: 10 }); // デフォルトは10件
      }

      spinner.text = `${laws.length}件の法令を比較中...`;
      
      const results: ComparisonResult[] = [];
      const detector = new EnhancedReferenceDetectorV41();

      for (const law of laws) {
        // 既存の参照データを取得
        const existingRefs = await prisma.reference.count({
          where: { sourceLawId: law.lawId }
        });

        // 新規検出
        const articles = await prisma.article.findMany({
          where: { lawId: law.lawId },
          include: { paragraphs: true }
        });

        let detectedCount = 0;
        for (const article of articles) {
          for (const paragraph of article.paragraphs) {
            const refs = detector.detectReferences(paragraph.content);
            detectedCount += refs.length;
          }
        }

        // 比較結果を記録
        const matchRate = existingRefs > 0 
          ? Math.min(100, (detectedCount / existingRefs) * 100)
          : 0;

        results.push({
          lawId: law.lawId,
          title: law.title,
          ourCount: detectedCount,
          egovCount: existingRefs,
          matchRate,
          missingReferences: [], // 詳細分析が必要な場合に実装
          extraReferences: []
        });

        if (options.detail) {
          console.log(chalk.cyan(`\n${law.title} (${law.lawId})`));
          console.log(`  検出数: ${chalk.green(detectedCount)}`);
          console.log(`  既存数: ${chalk.yellow(existingRefs)}`);
          console.log(`  一致率: ${chalk.blue(matchRate.toFixed(1) + '%')}`);
        }
      }

      spinner.succeed('比較が完了しました');

      // サマリー表示
      console.log(chalk.cyan('\n📊 比較結果サマリー'));
      console.log('='.repeat(50));
      
      const avgMatchRate = results.reduce((sum, r) => sum + r.matchRate, 0) / results.length;
      console.log(`平均一致率: ${chalk.green(avgMatchRate.toFixed(1) + '%')}`);
      
      // 最良と最悪の結果
      const sorted = results.sort((a, b) => b.matchRate - a.matchRate);
      console.log(chalk.green('\n✅ 最良の結果:'));
      sorted.slice(0, 3).forEach(r => {
        console.log(`  ${r.title}: ${r.matchRate.toFixed(1)}%`);
      });
      
      console.log(chalk.red('\n⚠ 改善が必要:'));
      sorted.slice(-3).forEach(r => {
        console.log(`  ${r.title}: ${r.matchRate.toFixed(1)}%`);
      });

    } catch (error) {
      spinner.fail('比較に失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 大規模検証コマンド
 */
program
  .command('validate')
  .description('大規模な参照検出検証')
  .option('-n, --number <count>', '検証する法令数', '100')
  .option('-p, --parallel <workers>', '並列処理数', '5')
  .option('-o, --output <path>', '結果出力先')
  .action(async (options) => {
    const count = parseInt(options.number);
    const spinner = ora(`${count}件の法令を検証中...`).start();

    try {
      const laws = await prisma.law.findMany({
        take: count,
        orderBy: { createdAt: 'desc' }
      });

      const results: ValidationResult[] = [];
      const startTime = Date.now();
      const detector = new EnhancedReferenceDetectorV41();

      for (const [index, law] of laws.entries()) {
        spinner.text = `検証中... (${index + 1}/${count}) ${law.title}`;

        const articles = await prisma.article.findMany({
          where: { lawId: law.lawId },
          include: { paragraphs: true }
        });

        let totalRefs = 0;
        let validRefs = 0;
        const errors: string[] = [];

        for (const article of articles) {
          for (const paragraph of article.paragraphs) {
            try {
              const refs = detector.detectReferences(paragraph.content);
              totalRefs += refs.length;
              
              // 検証ロジック
              for (const ref of refs) {
                if (ref.confidence > 0.8) {
                  validRefs++;
                }
              }
            } catch (error: any) {
              errors.push(`${article.articleNumber}: ${error.message}`);
            }
          }
        }

        results.push({
          lawId: law.lawId,
          title: law.title,
          totalReferences: totalRefs,
          validReferences: validRefs,
          invalidReferences: totalRefs - validRefs,
          accuracy: totalRefs > 0 ? (validRefs / totalRefs) * 100 : 0,
          errors,
          timestamp: new Date()
        });

        // 進捗表示
        if ((index + 1) % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = (index + 1) / elapsed;
          const remaining = (count - index - 1) / rate;
          spinner.text = `進捗: ${index + 1}/${count} (残り約${Math.ceil(remaining)}秒)`;
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      spinner.succeed(`検証完了: ${count}件 (${elapsed}秒)`);

      // 結果の集計
      const totalRefs = results.reduce((sum, r) => sum + r.totalReferences, 0);
      const validRefs = results.reduce((sum, r) => sum + r.validReferences, 0);
      const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;

      console.log(chalk.cyan('\n📊 検証結果サマリー'));
      console.log('='.repeat(50));
      console.log(`検証法令数: ${chalk.green(count)}件`);
      console.log(`総参照数: ${chalk.green(totalRefs.toLocaleString())}件`);
      console.log(`有効参照数: ${chalk.green(validRefs.toLocaleString())}件`);
      console.log(`平均精度: ${chalk.yellow(avgAccuracy.toFixed(1) + '%')}`);
      console.log(`処理時間: ${chalk.blue(elapsed + '秒')}`);
      console.log(`処理速度: ${chalk.blue((count / parseFloat(elapsed)).toFixed(1) + '件/秒')}`);

      // ファイル出力
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
        console.log(chalk.cyan(`\n結果を保存: ${options.output}`));
      }

    } catch (error) {
      spinner.fail('検証に失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 失敗分析コマンド
 */
program
  .command('analyze')
  .description('参照検出の失敗パターンを分析')
  .option('-l, --limit <count>', '分析する失敗数', '100')
  .option('-p, --pattern', 'パターン別に集計')
  .action(async (options) => {
    const spinner = ora('失敗パターンを分析中...').start();

    try {
      // 参照が少ない法令を特定
      const problemLaws = await prisma.$queryRaw<any[]>`
        SELECT l."lawId", l.title, COUNT(r.id) as ref_count
        FROM "Law" l
        LEFT JOIN "Reference" r ON l."lawId" = r."sourceLawId"
        GROUP BY l."lawId", l.title
        HAVING COUNT(r.id) < 10
        ORDER BY COUNT(r.id) ASC
        LIMIT ${parseInt(options.limit)}
      `;

      spinner.text = `${problemLaws.length}件の問題法令を分析中...`;

      const patterns = new Map<string, number>();
      const detector = new EnhancedReferenceDetectorV41();

      for (const law of problemLaws) {
        const articles = await prisma.article.findMany({
          where: { lawId: law.lawId },
          include: { paragraphs: true }
        });

        for (const article of articles) {
          for (const paragraph of article.paragraphs) {
            // 参照パターンを検出
            const commonPatterns = [
              { regex: /第\d+条/, name: '条文参照' },
              { regex: /前条|次条/, name: '相対参照' },
              { regex: /同項|同条/, name: '自己参照' },
              { regex: /別表第\d+/, name: '別表参照' },
              { regex: /附則第\d+条/, name: '附則参照' }
            ];

            for (const pattern of commonPatterns) {
              if (pattern.regex.test(paragraph.content)) {
                const refs = detector.detectReferences(paragraph.content);
                if (refs.length === 0) {
                  // 検出失敗
                  patterns.set(pattern.name, (patterns.get(pattern.name) || 0) + 1);
                }
              }
            }
          }
        }
      }

      spinner.succeed('分析が完了しました');

      // 結果表示
      console.log(chalk.cyan('\n📊 失敗パターン分析'));
      console.log('='.repeat(50));
      
      const sortedPatterns = Array.from(patterns.entries())
        .sort((a, b) => b[1] - a[1]);

      console.log(chalk.yellow('\n検出失敗が多いパターン:'));
      for (const [pattern, count] of sortedPatterns) {
        const bar = '█'.repeat(Math.min(50, Math.floor(count / 2)));
        console.log(`${pattern.padEnd(15)} ${bar} ${count}件`);
      }

      // 推奨事項
      console.log(chalk.cyan('\n💡 改善推奨事項:'));
      if (patterns.get('相対参照')! > 10) {
        console.log('- 相対参照（前条・次条）の解決ロジックを強化');
      }
      if (patterns.get('別表参照')! > 5) {
        console.log('- 別表参照パターンの追加');
      }
      if (patterns.get('附則参照')! > 5) {
        console.log('- 附則参照の検出精度向上');
      }

    } catch (error) {
      spinner.fail('分析に失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * ベンチマークコマンド
 */
program
  .command('benchmark')
  .description('検出エンジンのパフォーマンスベンチマーク')
  .action(async () => {
    const spinner = ora('ベンチマークを実行中...').start();

    try {
      // テスト用の法令を取得
      const testLaw = await prisma.law.findFirst({
        where: { lawId: '129AC0000000089' }, // 民法
        include: {
          articles: {
            include: { paragraphs: true },
            take: 100 // 最初の100条で測定
          }
        }
      });

      if (!testLaw) {
        spinner.fail('テスト用法令が見つかりません');
        return;
      }

      const results: any = {};

      for (const [name, detector] of Object.entries(DETECTORS)) {
        spinner.text = `${name}エンジンをベンチマーク中...`;
        
        const startTime = Date.now();
        let totalRefs = 0;

        for (const article of testLaw.articles) {
          for (const paragraph of article.paragraphs) {
            const refs = detector.detectReferences(paragraph.content);
            totalRefs += refs.length;
          }
        }

        const elapsed = Date.now() - startTime;
        
        results[name] = {
          time: elapsed,
          references: totalRefs,
          speed: (testLaw.articles.length * 1000 / elapsed).toFixed(2)
        };
      }

      spinner.succeed('ベンチマークが完了しました');

      // 結果表示
      console.log(chalk.cyan('\n🚀 パフォーマンスベンチマーク'));
      console.log('='.repeat(50));
      console.log(`テスト法令: ${testLaw.title}`);
      console.log(`テスト条文数: ${testLaw.articles.length}条`);
      console.log();

      for (const [name, result] of Object.entries(results)) {
        console.log(chalk.yellow(`${name}エンジン:`));
        console.log(`  処理時間: ${result.time}ms`);
        console.log(`  検出数: ${result.references}件`);
        console.log(`  処理速度: ${result.speed}条/秒`);
        console.log();
      }

    } catch (error) {
      spinner.fail('ベンチマークに失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

// プログラム実行
program
  .name('validation-suite')
  .description('統合検証スイート')
  .version('1.0.0');

program.parse(process.argv);