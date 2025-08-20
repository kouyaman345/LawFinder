#!/usr/bin/env npx tsx

/**
 * 統合法令管理ツール
 * 
 * 法令データのインポート、再インポート、検証、修正を統合管理
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import chalk from 'chalk';
import ora from 'ora';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const program = new Command();

interface LawVersionInfo {
  lawId: string;
  versionDate: string;
  directoryName: string;
  xmlPath: string;
}

interface ImportOptions {
  force?: boolean;
  parallel?: boolean;
  batchSize?: number;
  lawId?: string;
  major?: boolean;
}

/**
 * XMLファイルから法令データを解析
 */
function parseLawXML(xmlContent: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: false,
    ignoreNameSpace: true,
    allowBooleanAttributes: true,
  });

  return parser.parse(xmlContent);
}

/**
 * 法令バージョン情報を取得
 */
async function getLawVersions(): Promise<LawVersionInfo[]> {
  const lawsDir = join(process.cwd(), 'laws_data');
  const directories = readdirSync(lawsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'));

  const versions: LawVersionInfo[] = [];

  for (const dir of directories) {
    const match = dir.name.match(/^(\w+)_(\d{8})_/);
    if (match) {
      const [, lawId, versionDate] = match;
      const xmlFiles = readdirSync(join(lawsDir, dir.name))
        .filter(file => file.endsWith('.xml'));
      
      if (xmlFiles.length > 0) {
        versions.push({
          lawId,
          versionDate,
          directoryName: dir.name,
          xmlPath: join(lawsDir, dir.name, xmlFiles[0])
        });
      }
    }
  }

  return versions;
}

/**
 * 単一法令のインポート
 */
async function importSingleLaw(versionInfo: LawVersionInfo, options: ImportOptions) {
  const { lawId, versionDate, xmlPath } = versionInfo;

  if (!existsSync(xmlPath)) {
    console.error(chalk.red(`XMLファイルが見つかりません: ${xmlPath}`));
    return;
  }

  try {
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const lawData = parseLawXML(xmlContent);
    const law = lawData.Law;

    if (!law) {
      console.error(chalk.red(`法令データの解析に失敗: ${lawId}`));
      return;
    }

    const lawTitle = law.LawTitle || '無題';
    const lawBody = law.LawBody;

    // 既存データの確認
    const existing = await prisma.law.findUnique({
      where: { lawId }
    });

    if (existing && !options.force) {
      console.log(chalk.yellow(`スキップ: ${lawId} - ${lawTitle} (既存)`));
      return;
    }

    // アップサート処理
    await prisma.law.upsert({
      where: { lawId },
      update: {
        title: lawTitle,
        xmlContent: xmlContent,
        promulgationDate: versionDate,
        updatedAt: new Date()
      },
      create: {
        lawId,
        title: lawTitle,
        xmlContent: xmlContent,
        promulgationDate: versionDate,
        status: 'active'
      }
    });

    // 条文データの処理
    if (lawBody && lawBody.Article) {
      const articles = Array.isArray(lawBody.Article) ? lawBody.Article : [lawBody.Article];
      
      // 既存の条文を削除
      await prisma.article.deleteMany({
        where: { lawId }
      });

      // 新規条文を登録
      for (const [index, article] of articles.entries()) {
        const articleNumber = article['@_Num'] || `第${index + 1}条`;
        
        await prisma.article.create({
          data: {
            lawId,
            articleNumber,
            articleTitle: article.ArticleTitle || '',
            content: JSON.stringify(article),
            sortOrder: index + 1
          }
        });
      }
    }

    console.log(chalk.green(`✓ インポート完了: ${lawId} - ${lawTitle}`));
  } catch (error) {
    console.error(chalk.red(`エラー (${lawId}):`, error));
  }
}

/**
 * 主要法令のリスト
 */
const MAJOR_LAWS = [
  '129AC0000000089', // 民法
  '132AC0000000048', // 商法
  '140AC0000000045', // 刑法
  '417AC0000000086', // 会社法
  '322AC0000000049', // 労働基準法
  '337AC0000000025', // 民事訴訟法
  '140AC0000000131', // 刑事訴訟法
  '421AC0000000105', // 民事執行法
  '421AC0000000108', // 民事保全法
  '424AC0000000092', // 破産法
];

/**
 * インポートコマンド
 */
program
  .command('import')
  .description('法令データをインポート')
  .option('-l, --law-id <id>', '特定の法令IDを指定')
  .option('-m, --major', '主要法令のみインポート')
  .option('-a, --all', '全法令をインポート')
  .option('-f, --force', '既存データを上書き')
  .option('-p, --parallel <number>', '並列処理数', '5')
  .action(async (options) => {
    const spinner = ora('法令データを準備中...').start();

    try {
      const versions = await getLawVersions();
      
      // 最新バージョンのみを選択
      const latestVersions = new Map<string, LawVersionInfo>();
      for (const version of versions) {
        const current = latestVersions.get(version.lawId);
        if (!current || version.versionDate > current.versionDate) {
          latestVersions.set(version.lawId, version);
        }
      }

      let targetLaws = Array.from(latestVersions.values());

      if (options.lawId) {
        targetLaws = targetLaws.filter(v => v.lawId === options.lawId);
      } else if (options.major) {
        targetLaws = targetLaws.filter(v => MAJOR_LAWS.includes(v.lawId));
      }

      spinner.succeed(`${targetLaws.length}件の法令を処理します`);

      const startTime = Date.now();
      let processed = 0;

      for (const law of targetLaws) {
        await importSingleLaw(law, options);
        processed++;
        
        if (processed % 10 === 0) {
          console.log(chalk.cyan(`進捗: ${processed}/${targetLaws.length}`));
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(chalk.green(`\n✅ インポート完了: ${processed}件 (${elapsed}秒)`));

    } catch (error) {
      spinner.fail('インポートに失敗しました');
      console.error(error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 再インポートコマンド
 */
program
  .command('reimport')
  .description('法令データを再インポート（既存データを削除して再構築）')
  .option('-l, --law-id <id>', '特定の法令IDを指定')
  .option('-m, --major', '主要法令のみ再インポート')
  .action(async (options) => {
    const spinner = ora('再インポートを準備中...').start();

    try {
      if (options.lawId) {
        // 特定法令の削除
        await prisma.article.deleteMany({ where: { lawId: options.lawId } });
        await prisma.law.delete({ where: { lawId: options.lawId } });
        spinner.text = `${options.lawId}を削除しました`;
      } else if (options.major) {
        // 主要法令の削除
        for (const lawId of MAJOR_LAWS) {
          await prisma.article.deleteMany({ where: { lawId } });
          await prisma.law.deleteMany({ where: { lawId } });
        }
        spinner.text = '主要法令を削除しました';
      } else {
        spinner.fail('--law-idまたは--majorオプションを指定してください');
        return;
      }

      // 再インポート実行
      const importOptions: ImportOptions = {
        force: true,
        lawId: options.lawId,
        major: options.major
      };

      spinner.text = '再インポート中...';
      
      const versions = await getLawVersions();
      const latestVersions = new Map<string, LawVersionInfo>();
      
      for (const version of versions) {
        const current = latestVersions.get(version.lawId);
        if (!current || version.versionDate > current.versionDate) {
          latestVersions.set(version.lawId, version);
        }
      }

      let targetLaws = Array.from(latestVersions.values());

      if (options.lawId) {
        targetLaws = targetLaws.filter(v => v.lawId === options.lawId);
      } else if (options.major) {
        targetLaws = targetLaws.filter(v => MAJOR_LAWS.includes(v.lawId));
      }

      for (const law of targetLaws) {
        await importSingleLaw(law, importOptions);
      }

      spinner.succeed('再インポートが完了しました');

    } catch (error) {
      spinner.fail('再インポートに失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 検証コマンド
 */
program
  .command('validate')
  .description('インポート済みデータの検証')
  .option('-l, --law-id <id>', '特定の法令IDを検証')
  .action(async (options) => {
    const spinner = ora('検証中...').start();

    try {
      const whereClause = options.lawId ? { lawId: options.lawId } : {};
      
      const laws = await prisma.law.findMany({
        where: whereClause,
        include: {
          articles: {
            select: {
              articleNumber: true,
              sortOrder: true
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      spinner.succeed(`${laws.length}件の法令を検証します`);

      let issues = 0;

      for (const law of laws) {
        const problems: string[] = [];

        // タイトルの確認
        if (!law.title || law.title === '無題') {
          problems.push('タイトルが設定されていません');
        }

        // XMLコンテンツの確認
        if (!law.xmlContent) {
          problems.push('XMLコンテンツが空です');
        }

        // 条文の確認
        if (law.articles.length === 0) {
          problems.push('条文が登録されていません');
        }

        // ソート順の確認
        const sortOrders = law.articles.map(a => a.sortOrder);
        const expectedOrders = Array.from({ length: law.articles.length }, (_, i) => i + 1);
        if (JSON.stringify(sortOrders) !== JSON.stringify(expectedOrders)) {
          problems.push('条文のソート順が不正です');
        }

        if (problems.length > 0) {
          console.log(chalk.yellow(`\n⚠ ${law.lawId} - ${law.title}`));
          problems.forEach(p => console.log(chalk.yellow(`  - ${p}`)));
          issues++;
        }
      }

      if (issues === 0) {
        console.log(chalk.green('\n✅ すべての法令データが正常です'));
      } else {
        console.log(chalk.yellow(`\n⚠ ${issues}件の法令に問題があります`));
      }

    } catch (error) {
      spinner.fail('検証に失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 修正コマンド
 */
program
  .command('fix')
  .description('データの問題を修正')
  .option('-t, --titles', '法令タイトルを修正')
  .option('-s, --sort', '条文のソート順を修正')
  .option('-d, --deleted', '削除条文を処理')
  .action(async (options) => {
    const spinner = ora('修正中...').start();

    try {
      if (options.titles) {
        spinner.text = '法令タイトルを修正中...';
        
        // CSVファイルからタイトル情報を読み込み
        const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
        if (existsSync(csvPath)) {
          const csvContent = readFileSync(csvPath, 'utf-8');
          const lines = csvContent.split('\n').slice(1); // ヘッダーをスキップ
          
          for (const line of lines) {
            const [lawId, , title] = line.split(',');
            if (lawId && title) {
              await prisma.law.update({
                where: { lawId: lawId.trim() },
                data: { title: title.trim() }
              }).catch(() => {}); // エラーは無視
            }
          }
        }
      }

      if (options.sort) {
        spinner.text = '条文のソート順を修正中...';
        
        const laws = await prisma.law.findMany({
          include: {
            articles: {
              orderBy: { articleNumber: 'asc' }
            }
          }
        });

        for (const law of laws) {
          for (const [index, article] of law.articles.entries()) {
            await prisma.article.update({
              where: { id: article.id },
              data: { sortOrder: index + 1 }
            });
          }
        }
      }

      if (options.deleted) {
        spinner.text = '削除条文を処理中...';
        
        // 削除条文の検出と処理
        const articles = await prisma.article.findMany({
          where: {
            OR: [
              { content: { contains: '削除' } },
              { articleTitle: { contains: '削除' } }
            ]
          }
        });

        for (const article of articles) {
          // 削除フラグを設定（実装はスキーマに依存）
          console.log(chalk.gray(`削除条文: ${article.lawId} ${article.articleNumber}`));
        }
      }

      spinner.succeed('修正が完了しました');

    } catch (error) {
      spinner.fail('修正に失敗しました');
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * 統計コマンド
 */
program
  .command('stats')
  .description('データベースの統計情報を表示')
  .action(async () => {
    try {
      const lawCount = await prisma.law.count();
      const articleCount = await prisma.article.count();
      const paragraphCount = await prisma.paragraph.count();
      const referenceCount = await prisma.reference.count();

      console.log(chalk.cyan('\n📊 データベース統計'));
      console.log('='.repeat(50));
      console.log(`法令数: ${chalk.green(lawCount.toLocaleString())}件`);
      console.log(`条文数: ${chalk.green(articleCount.toLocaleString())}件`);
      console.log(`項数: ${chalk.green(paragraphCount.toLocaleString())}件`);
      console.log(`参照数: ${chalk.green(referenceCount.toLocaleString())}件`);
      
      // 主要法令の状態
      console.log(chalk.cyan('\n📋 主要法令の状態'));
      console.log('='.repeat(50));
      
      for (const lawId of MAJOR_LAWS) {
        const law = await prisma.law.findUnique({
          where: { lawId },
          include: {
            _count: {
              select: { articles: true }
            }
          }
        });
        
        if (law) {
          console.log(`✓ ${lawId}: ${law.title} (${law._count.articles}条)`);
        } else {
          console.log(chalk.red(`✗ ${lawId}: 未インポート`));
        }
      }

    } catch (error) {
      console.error(chalk.red('統計情報の取得に失敗しました'), error);
    } finally {
      await prisma.$disconnect();
    }
  });

// プログラム実行
program
  .name('law-manager')
  .description('統合法令管理ツール')
  .version('1.0.0');

program.parse(process.argv);