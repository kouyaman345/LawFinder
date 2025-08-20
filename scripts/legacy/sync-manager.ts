#!/usr/bin/env npx tsx

/**
 * 統合同期管理ツール
 * 
 * PostgreSQL、Neo4j、その他のデータソース間の同期を統合管理
 */

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import chalk from 'chalk';
import ora from 'ora';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const program = new Command();

// Neo4j接続設定
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

interface SyncOptions {
  force?: boolean;
  batchSize?: number;
  lawId?: string;
  withTitles?: boolean;
  fixReferences?: boolean;
}

/**
 * PostgreSQLからNeo4jへの参照データ同期
 */
async function syncReferencesToNeo4j(options: SyncOptions) {
  const session = neo4jDriver.session();
  const spinner = ora('Neo4jへの同期を準備中...').start();

  try {
    // 既存データのクリア（オプション）
    if (options.force) {
      spinner.text = 'Neo4jの既存データをクリア中...';
      await session.run('MATCH (n) DETACH DELETE n');
    }

    // 法令ノードの作成
    spinner.text = '法令ノードを作成中...';
    const laws = await prisma.law.findMany({
      where: options.lawId ? { lawId: options.lawId } : undefined
    });

    for (const law of laws) {
      await session.run(
        `MERGE (l:Law {lawId: $lawId})
         SET l.title = $title,
             l.promulgationDate = $promulgationDate`,
        {
          lawId: law.lawId,
          title: law.title,
          promulgationDate: law.promulgationDate
        }
      );
    }

    // 条文ノードの作成
    spinner.text = '条文ノードを作成中...';
    const articles = await prisma.article.findMany({
      where: options.lawId ? { lawId: options.lawId } : undefined,
      include: { law: true }
    });

    for (const article of articles) {
      await session.run(
        `MATCH (l:Law {lawId: $lawId})
         MERGE (a:Article {id: $articleId})
         SET a.articleNumber = $articleNumber,
             a.articleTitle = $articleTitle,
             a.lawId = $lawId
         MERGE (l)-[:HAS_ARTICLE]->(a)`,
        {
          lawId: article.lawId,
          articleId: `${article.lawId}_${article.articleNumber}`,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle || ''
        }
      );
    }

    // 参照関係の作成
    spinner.text = '参照関係を作成中...';
    const references = await prisma.reference.findMany({
      where: options.lawId ? { sourceLawId: options.lawId } : undefined
    });

    let processed = 0;
    const batchSize = options.batchSize || 100;

    for (const ref of references) {
      const sourceId = `${ref.sourceLawId}_${ref.sourceArticleNumber}`;
      const targetId = ref.targetLawId && ref.targetArticleNumber
        ? `${ref.targetLawId}_${ref.targetArticleNumber}`
        : null;

      if (targetId) {
        await session.run(
          `MATCH (s:Article {id: $sourceId})
           MERGE (t:Article {id: $targetId})
           MERGE (s)-[r:REFERENCES {type: $type}]->(t)
           SET r.text = $text,
               r.confidence = $confidence`,
          {
            sourceId,
            targetId,
            type: ref.type,
            text: ref.text,
            confidence: ref.confidence
          }
        );
      }

      processed++;
      if (processed % batchSize === 0) {
        spinner.text = `参照関係を作成中... (${processed}/${references.length})`;
      }
    }

    spinner.succeed(`同期完了: ${laws.length}法令、${articles.length}条文、${references.length}参照`);

  } catch (error) {
    spinner.fail('同期に失敗しました');
    console.error(error);
  } finally {
    await session.close();
  }
}

/**
 * Neo4jのデータを再構築
 */
async function rebuildNeo4j(options: SyncOptions) {
  const spinner = ora('Neo4jデータベースを再構築中...').start();
  const session = neo4jDriver.session();

  try {
    // 完全クリア
    spinner.text = 'Neo4jをクリア中...';
    await session.run('MATCH (n) DETACH DELETE n');

    // 制約とインデックスの作成
    spinner.text = 'インデックスを作成中...';
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (l:Law) REQUIRE l.lawId IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Article) REQUIRE a.id IS UNIQUE');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (l:Law) ON (l.title)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (a:Article) ON (a.articleNumber)');

    // データの同期
    await syncReferencesToNeo4j({ ...options, force: false });

    spinner.succeed('Neo4jデータベースの再構築が完了しました');

  } catch (error) {
    spinner.fail('再構築に失敗しました');
    console.error(error);
  } finally {
    await session.close();
  }
}

/**
 * データ修正と同期
 */
async function fixAndSync(options: SyncOptions) {
  const spinner = ora('データを修正して同期中...').start();

  try {
    // タイトルの修正
    if (options.withTitles) {
      spinner.text = '法令タイトルを修正中...';
      
      // CSVから正しいタイトルを取得（実装省略）
      const updates = await prisma.$executeRaw`
        UPDATE "Law" 
        SET title = CASE 
          WHEN "lawId" = '129AC0000000089' THEN '民法'
          WHEN "lawId" = '140AC0000000045' THEN '刑法'
          WHEN "lawId" = '417AC0000000086' THEN '会社法'
          ELSE title
        END
        WHERE "lawId" IN ('129AC0000000089', '140AC0000000045', '417AC0000000086')
      `;
      
      console.log(chalk.green(`✓ ${updates}件のタイトルを修正`));
    }

    // 参照の修正
    if (options.fixReferences) {
      spinner.text = '参照データを修正中...';
      
      // targetLawIdがnullの参照を修正
      const nullRefs = await prisma.reference.findMany({
        where: { targetLawId: null },
        take: 100
      });

      for (const ref of nullRefs) {
        // パターンマッチングで法令IDを推定
        const match = ref.text.match(/^(民法|刑法|会社法|商法)/);
        if (match) {
          const lawIdMap: { [key: string]: string } = {
            '民法': '129AC0000000089',
            '刑法': '140AC0000000045',
            '会社法': '417AC0000000086',
            '商法': '132AC0000000048'
          };

          const targetLawId = lawIdMap[match[1]];
          if (targetLawId) {
            await prisma.reference.update({
              where: { id: ref.id },
              data: { targetLawId }
            });
          }
        }
      }
    }

    // Neo4jに同期
    await syncReferencesToNeo4j(options);

    spinner.succeed('修正と同期が完了しました');

  } catch (error) {
    spinner.fail('修正に失敗しました');
    console.error(error);
  }
}

/**
 * 同期状態の確認
 */
async function checkSyncStatus() {
  const spinner = ora('同期状態を確認中...').start();
  const session = neo4jDriver.session();

  try {
    // PostgreSQL側の統計
    const pgStats = {
      laws: await prisma.law.count(),
      articles: await prisma.article.count(),
      references: await prisma.reference.count()
    };

    // Neo4j側の統計
    const lawCountResult = await session.run('MATCH (l:Law) RETURN count(l) as count');
    const articleCountResult = await session.run('MATCH (a:Article) RETURN count(a) as count');
    const refCountResult = await session.run('MATCH ()-[r:REFERENCES]->() RETURN count(r) as count');

    const neo4jStats = {
      laws: lawCountResult.records[0].get('count').toNumber(),
      articles: articleCountResult.records[0].get('count').toNumber(),
      references: refCountResult.records[0].get('count').toNumber()
    };

    spinner.succeed('同期状態の確認完了');

    // 結果表示
    console.log(chalk.cyan('\n📊 データベース同期状態'));
    console.log('='.repeat(50));
    console.log('             PostgreSQL    Neo4j      差分');
    console.log('-'.repeat(50));
    console.log(`法令:        ${pgStats.laws.toString().padEnd(10)} ${neo4jStats.laws.toString().padEnd(10)} ${(pgStats.laws - neo4jStats.laws).toString().padStart(6)}`);
    console.log(`条文:        ${pgStats.articles.toString().padEnd(10)} ${neo4jStats.articles.toString().padEnd(10)} ${(pgStats.articles - neo4jStats.articles).toString().padStart(6)}`);
    console.log(`参照:        ${pgStats.references.toString().padEnd(10)} ${neo4jStats.references.toString().padEnd(10)} ${(pgStats.references - neo4jStats.references).toString().padStart(6)}`);

    // 同期率計算
    const syncRate = {
      laws: neo4jStats.laws > 0 ? (neo4jStats.laws / pgStats.laws * 100) : 0,
      articles: neo4jStats.articles > 0 ? (neo4jStats.articles / pgStats.articles * 100) : 0,
      references: neo4jStats.references > 0 ? (neo4jStats.references / pgStats.references * 100) : 0
    };

    console.log(chalk.cyan('\n📈 同期率'));
    console.log('-'.repeat(50));
    console.log(`法令:        ${chalk.green(syncRate.laws.toFixed(1) + '%')}`);
    console.log(`条文:        ${chalk.green(syncRate.articles.toFixed(1) + '%')}`);
    console.log(`参照:        ${chalk.green(syncRate.references.toFixed(1) + '%')}`);

    // 推奨事項
    if (syncRate.references < 50) {
      console.log(chalk.yellow('\n⚠ 参照の同期率が低いです。sync neo4j --force の実行を推奨します'));
    }

  } catch (error) {
    spinner.fail('状態確認に失敗しました');
    console.error(error);
  } finally {
    await session.close();
  }
}

// コマンド定義
program
  .name('sync-manager')
  .description('統合同期管理ツール')
  .version('1.0.0');

program
  .command('neo4j')
  .description('PostgreSQLからNeo4jへ同期')
  .option('-f, --force', '既存データを削除して再構築')
  .option('-l, --law-id <id>', '特定の法令のみ同期')
  .option('-b, --batch-size <size>', 'バッチサイズ', '100')
  .action(async (options) => {
    await syncReferencesToNeo4j(options);
    await prisma.$disconnect();
    await neo4jDriver.close();
  });

program
  .command('rebuild')
  .description('Neo4jデータベースを完全再構築')
  .option('-t, --with-titles', 'タイトルも修正')
  .action(async (options) => {
    await rebuildNeo4j(options);
    await prisma.$disconnect();
    await neo4jDriver.close();
  });

program
  .command('fix')
  .description('データを修正してから同期')
  .option('-t, --with-titles', 'タイトルを修正')
  .option('-r, --fix-references', '参照データを修正')
  .action(async (options) => {
    await fixAndSync(options);
    await prisma.$disconnect();
    await neo4jDriver.close();
  });

program
  .command('status')
  .description('同期状態を確認')
  .action(async () => {
    await checkSyncStatus();
    await prisma.$disconnect();
    await neo4jDriver.close();
  });

program.parse(process.argv);