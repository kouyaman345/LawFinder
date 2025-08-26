#!/usr/bin/env npx tsx

/**
 * e-GovスクレイピングデータをNeo4jに投入
 * 
 * 完全な参照グラフデータベースを構築
 * ソース識別子 "egov" を付与
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external' | 'structural';
  confidence: number;
}

class EGovToNeo4j {
  private cacheDir: string;
  private driver: any;
  private session: any;
  
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'egov_cache_v2', 'references');
    this.driver = initNeo4jDriver();
    this.session = this.driver.session();
  }

  /**
   * 法令ノードを作成（存在しない場合）
   */
  private async ensureLawNode(lawId: string): Promise<void> {
    const query = `
      MERGE (l:Law {lawId: $lawId})
      ON CREATE SET 
        l.created = datetime(),
        l.source = 'egov'
      RETURN l
    `;
    
    await this.session.run(query, { lawId });
  }

  /**
   * 条文ノードを作成（存在しない場合）
   */
  private async ensureArticleNode(lawId: string, articleNumber: string): Promise<void> {
    const query = `
      MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
      ON CREATE SET 
        a.created = datetime(),
        a.source = 'egov'
      RETURN a
    `;
    
    await this.session.run(query, { lawId, articleNumber });
  }

  /**
   * 参照関係を作成
   */
  private async createReference(ref: EGovReference): Promise<void> {
    // ソースノードの作成
    if (ref.sourceArticle) {
      await this.ensureArticleNode(ref.sourceLawId, ref.sourceArticle);
    } else {
      await this.ensureLawNode(ref.sourceLawId);
    }

    // ターゲットノードの作成
    if (ref.targetLawId) {
      if (ref.targetArticle) {
        await this.ensureArticleNode(ref.targetLawId, ref.targetArticle);
      } else {
        await this.ensureLawNode(ref.targetLawId);
      }
    }

    // 参照エッジの作成
    let query: string;
    let params: any;

    if (ref.sourceArticle && ref.targetArticle) {
      // 条文から条文への参照
      query = `
        MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
        MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
        MERGE (s)-[r:REFERENCES]->(t)
        SET r.text = $text,
            r.type = $type,
            r.source = 'egov',
            r.confidence = $confidence,
            r.created = datetime()
        RETURN r
      `;
      params = {
        sourceLawId: ref.sourceLawId,
        sourceArticle: ref.sourceArticle,
        targetLawId: ref.targetLawId || ref.sourceLawId,
        targetArticle: ref.targetArticle,
        text: ref.referenceText,
        type: ref.referenceType,
        confidence: ref.confidence
      };
    } else if (ref.sourceArticle) {
      // 条文から法令への参照
      query = `
        MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
        MATCH (t:Law {lawId: $targetLawId})
        MERGE (s)-[r:REFERENCES]->(t)
        SET r.text = $text,
            r.type = $type,
            r.source = 'egov',
            r.confidence = $confidence,
            r.created = datetime()
        RETURN r
      `;
      params = {
        sourceLawId: ref.sourceLawId,
        sourceArticle: ref.sourceArticle,
        targetLawId: ref.targetLawId || ref.sourceLawId,
        text: ref.referenceText,
        type: ref.referenceType,
        confidence: ref.confidence
      };
    } else {
      // 法令から法令への参照
      query = `
        MATCH (s:Law {lawId: $sourceLawId})
        MATCH (t:Law {lawId: $targetLawId})
        MERGE (s)-[r:REFERENCES]->(t)
        SET r.text = $text,
            r.type = $type,
            r.source = 'egov',
            r.confidence = $confidence,
            r.created = datetime()
        RETURN r
      `;
      params = {
        sourceLawId: ref.sourceLawId,
        targetLawId: ref.targetLawId || ref.sourceLawId,
        text: ref.referenceText,
        type: ref.referenceType,
        confidence: ref.confidence
      };
    }

    await this.session.run(query, params);
  }

  /**
   * 単一法令の参照データをNeo4jに投入
   */
  async importLawReferences(lawId: string): Promise<number> {
    const cachePath = path.join(this.cacheDir, `${lawId}.json`);
    
    if (!fs.existsSync(cachePath)) {
      console.log(chalk.yellow(`⚠️ キャッシュが存在しません: ${lawId}`));
      return 0;
    }

    const references: EGovReference[] = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    
    if (references.length === 0) {
      console.log(chalk.gray(`  参照なし: ${lawId}`));
      return 0;
    }

    const spinner = ora(`${lawId}: ${references.length}件の参照を投入中`).start();
    let imported = 0;

    try {
      // 法令ノードを作成
      await this.ensureLawNode(lawId);

      // バッチ処理で参照を投入
      for (const ref of references) {
        try {
          // 内部参照の場合、targetLawIdを確実に設定
          if (ref.referenceType === 'internal' || ref.targetLawId === ref.sourceLawId) {
            ref.targetLawId = ref.sourceLawId;
            ref.referenceType = 'internal';
          }

          await this.createReference(ref);
          imported++;
          
          if (imported % 100 === 0) {
            spinner.text = `${lawId}: ${imported}/${references.length}件投入済み`;
          }
        } catch (error) {
          console.error(chalk.red(`\n参照投入エラー: ${JSON.stringify(ref, null, 2)}`));
          console.error(error);
        }
      }

      spinner.succeed(`${lawId}: ${imported}件の参照を投入完了`);
    } catch (error) {
      spinner.fail(`${lawId}: エラーが発生しました`);
      console.error(error);
    }

    return imported;
  }

  /**
   * 全キャッシュデータをNeo4jに投入
   */
  async importAll(): Promise<void> {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    
    console.log(chalk.cyan(`\n📊 ${files.length}件の法令データをNeo4jに投入開始`));
    console.log(chalk.gray('=' .repeat(50)));

    let totalReferences = 0;
    let totalLaws = 0;

    // 既存のe-Govソースデータをクリア（オプション）
    if (process.argv.includes('--clean')) {
      console.log(chalk.yellow('既存のe-Govデータを削除中...'));
      await this.session.run(`
        MATCH (n)-[r]->()
        WHERE r.source = 'egov'
        DELETE r
      `);
      await this.session.run(`
        MATCH (n)
        WHERE n.source = 'egov' AND NOT (n)--()
        DELETE n
      `);
    }

    for (const file of files) {
      const lawId = file.replace('.json', '');
      const count = await this.importLawReferences(lawId);
      
      if (count > 0) {
        totalReferences += count;
        totalLaws++;
      }
    }

    console.log(chalk.gray('=' .repeat(50)));
    console.log(chalk.green(`✅ 投入完了`));
    console.log(chalk.cyan(`  法令数: ${totalLaws}件`));
    console.log(chalk.cyan(`  参照数: ${totalReferences}件`));
    console.log(chalk.cyan(`  平均: ${Math.round(totalReferences / totalLaws)}件/法令`));
  }

  /**
   * 統計情報を表示
   */
  async showStatistics(): Promise<void> {
    console.log(chalk.cyan('\n📊 Neo4j統計情報'));
    console.log(chalk.gray('=' .repeat(50)));

    // ノード数
    const nodeCount = await this.session.run(`
      MATCH (n)
      WHERE n.source = 'egov'
      RETURN 
        labels(n)[0] as label,
        count(n) as count
      ORDER BY count DESC
    `);

    console.log(chalk.blue('ノード数:'));
    nodeCount.records.forEach((record: any) => {
      console.log(`  ${record.get('label')}: ${record.get('count').toNumber()}件`);
    });

    // エッジ数
    const edgeCount = await this.session.run(`
      MATCH ()-[r]->()
      WHERE r.source = 'egov'
      RETURN 
        type(r) as type,
        r.type as refType,
        count(r) as count
      ORDER BY count DESC
    `);

    console.log(chalk.blue('\n参照数:'));
    let internalCount = 0;
    let externalCount = 0;
    
    edgeCount.records.forEach((record: any) => {
      const refType = record.get('refType');
      const count = record.get('count').toNumber();
      
      if (refType === 'internal') {
        internalCount += count;
      } else if (refType === 'external') {
        externalCount += count;
      }
    });

    console.log(`  内部参照: ${internalCount}件`);
    console.log(`  外部参照: ${externalCount}件`);
    console.log(`  合計: ${internalCount + externalCount}件`);

    // トップ参照法令
    const topReferenced = await this.session.run(`
      MATCH (l:Law)<-[r]-(s)
      WHERE r.source = 'egov'
      RETURN l.lawId as lawId, count(r) as refs
      ORDER BY refs DESC
      LIMIT 10
    `);

    console.log(chalk.blue('\n最も参照される法令TOP10:'));
    topReferenced.records.forEach((record: any, i: number) => {
      console.log(`  ${i + 1}. ${record.get('lawId')}: ${record.get('refs').toNumber()}件`);
    });

    console.log(chalk.gray('=' .repeat(50)));
  }

  async close(): Promise<void> {
    await this.session.close();
  }
}

// CLI実行
if (require.main === module) {
  const importer = new EGovToNeo4j();
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'import':
          const lawId = process.argv[3];
          if (lawId) {
            // 単一法令のインポート
            await importer.importLawReferences(lawId);
          } else {
            // 全法令のインポート
            await importer.importAll();
          }
          break;

        case 'stats':
          await importer.showStatistics();
          break;

        case 'clean':
          console.log(chalk.yellow('e-Govソースのデータを削除中...'));
          const driver = initNeo4jDriver();
          const session = driver.session();
          await session.run(`
            MATCH (n)-[r]->()
            WHERE r.source = 'egov'
            DELETE r
          `);
          await session.run(`
            MATCH (n)
            WHERE n.source = 'egov' AND NOT (n)--()
            DELETE n
          `);
          await session.close();
          console.log(chalk.green('✅ 削除完了'));
          break;

        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-to-neo4j.ts import [法令ID]  # 単一/全法令インポート');
          console.log('  npx tsx scripts/egov-to-neo4j.ts stats            # 統計表示');
          console.log('  npx tsx scripts/egov-to-neo4j.ts clean            # e-Govデータ削除');
          console.log('\nオプション:');
          console.log('  --clean  インポート前に既存データを削除');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer.close();
      await importer.driver.close();
    }
  })();
}

export default EGovToNeo4j;