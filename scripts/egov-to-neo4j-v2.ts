#!/usr/bin/env npx tsx

/**
 * e-GovスクレイピングデータをNeo4jに投入（v2）
 * 
 * トランザクション対応版
 * バッチ処理で効率的にデータ投入
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external';
  confidence: number;
}

class EGovToNeo4jV2 {
  private cacheDir: string;
  private driver: any;
  
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'egov_cache_v2', 'references');
    this.driver = initNeo4jDriver();
  }

  /**
   * 単一法令の参照データをNeo4jに投入（バッチ処理版）
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

    console.log(chalk.blue(`📝 ${lawId}: ${references.length}件の参照を投入中...`));
    
    const session = this.driver.session();
    let imported = 0;

    try {
      // トランザクションで実行
      await session.executeWrite(async (tx: any) => {
        // 1. 法令ノードを作成
        await tx.run(`
          MERGE (l:Law {lawId: $lawId})
          ON CREATE SET 
            l.created = datetime(),
            l.source = 'egov'
          ON MATCH SET
            l.updated = datetime()
        `, { lawId });

        // 2. 条文ノードをバッチで作成
        const articleNumbers = new Set<string>();
        references.forEach(ref => {
          if (ref.sourceArticle) articleNumbers.add(ref.sourceArticle);
          if (ref.targetArticle) {
            articleNumbers.add(ref.targetArticle);
          }
        });

        for (const articleNumber of articleNumbers) {
          await tx.run(`
            MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            ON CREATE SET 
              a.created = datetime(),
              a.source = 'egov'
          `, { lawId, articleNumber });
        }

        // 3. 参照関係をバッチで作成（内部参照と外部参照を分けて処理）
        
        // 内部参照（同一法令内）
        const internalRefs = references.filter(r => 
          !r.targetLawId || r.targetLawId === r.sourceLawId
        );
        
        for (const ref of internalRefs) {
          // 内部参照として明確に設定
          ref.referenceType = 'internal';
          ref.targetLawId = ref.sourceLawId;
          
          if (ref.sourceArticle && ref.targetArticle) {
            await tx.run(`
              MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
              MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
              MERGE (s)-[r:REFERENCES {
                text: $text,
                type: 'internal',
                source: 'egov'
              }]->(t)
              ON CREATE SET
                r.confidence = $confidence,
                r.created = datetime()
            `, {
              sourceLawId: ref.sourceLawId,
              sourceArticle: ref.sourceArticle,
              targetLawId: ref.sourceLawId,
              targetArticle: ref.targetArticle,
              text: ref.referenceText,
              confidence: ref.confidence
            });
            imported++;
          }
        }

        // 外部参照（他法令への参照）
        const externalRefs = references.filter(r => 
          r.targetLawId && r.targetLawId !== r.sourceLawId
        );
        
        for (const ref of externalRefs) {
          // 対象法令ノードを作成
          if (ref.targetLawId) {
            await tx.run(`
              MERGE (l:Law {lawId: $lawId})
              ON CREATE SET 
                l.created = datetime(),
                l.source = 'egov'
            `, { lawId: ref.targetLawId });

            // 対象条文ノードを作成
            if (ref.targetArticle) {
              await tx.run(`
                MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
                ON CREATE SET 
                  a.created = datetime(),
                  l.source = 'egov'
              `, { lawId: ref.targetLawId, articleNumber: ref.targetArticle });
            }

            // 参照関係を作成
            if (ref.sourceArticle) {
              await tx.run(`
                MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
                MATCH (t:Law {lawId: $targetLawId})
                MERGE (s)-[r:REFERENCES {
                  text: $text,
                  type: 'external',
                  source: 'egov'
                }]->(t)
                ON CREATE SET
                  r.confidence = $confidence,
                  r.created = datetime()
              `, {
                sourceLawId: ref.sourceLawId,
                sourceArticle: ref.sourceArticle,
                targetLawId: ref.targetLawId,
                text: ref.referenceText,
                confidence: ref.confidence
              });
              imported++;
            }
          }
        }
      });

      console.log(chalk.green(`✅ ${lawId}: ${imported}件の参照を投入完了`));
      
    } catch (error) {
      console.error(chalk.red(`❌ ${lawId}: エラーが発生しました`));
      console.error(error);
    } finally {
      await session.close();
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

    // 既存のe-Govソースデータをクリア
    if (process.argv.includes('--clean')) {
      console.log(chalk.yellow('🗑️ 既存のe-Govデータを削除中...'));
      const session = this.driver.session();
      try {
        await session.executeWrite(async (tx: any) => {
          // 参照関係を削除
          await tx.run(`
            MATCH ()-[r]->()
            WHERE r.source = 'egov'
            DELETE r
          `);
          // 孤立ノードを削除
          await tx.run(`
            MATCH (n)
            WHERE n.source = 'egov' AND NOT (n)--()
            DELETE n
          `);
        });
        console.log(chalk.green('✅ クリーンアップ完了'));
      } finally {
        await session.close();
      }
    }

    // 法令ごとにインポート
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
    if (totalLaws > 0) {
      console.log(chalk.cyan(`  平均: ${Math.round(totalReferences / totalLaws)}件/法令`));
    }
  }

  /**
   * 統計情報を表示
   */
  async showStatistics(): Promise<void> {
    console.log(chalk.cyan('\n📊 Neo4j統計情報（e-Govソースのみ）'));
    console.log(chalk.gray('=' .repeat(50)));

    const session = this.driver.session();
    
    try {
      // ノード数
      const nodeResult = await session.run(`
        MATCH (n)
        WHERE n.source = 'egov'
        RETURN labels(n)[0] as label, count(n) as count
        ORDER BY count DESC
      `);

      console.log(chalk.blue('📌 ノード数:'));
      nodeResult.records.forEach((record: any) => {
        const count = record.get('count');
        console.log(`  ${record.get('label')}: ${count.toNumber ? count.toNumber() : count}件`);
      });

      // 参照数（内部/外部）
      const refResult = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.source = 'egov'
        RETURN r.type as type, count(r) as count
        ORDER BY type
      `);

      console.log(chalk.blue('\n🔗 参照数:'));
      let totalRefs = 0;
      refResult.records.forEach((record: any) => {
        const count = record.get('count');
        const num = count.toNumber ? count.toNumber() : count;
        totalRefs += num;
        console.log(`  ${record.get('type')}: ${num}件`);
      });
      console.log(`  合計: ${totalRefs}件`);

      // 最も参照される法令TOP5
      const topResult = await session.run(`
        MATCH (l:Law)<-[r:REFERENCES]-(s)
        WHERE r.source = 'egov' AND r.type = 'external'
        RETURN l.lawId as lawId, count(r) as refs
        ORDER BY refs DESC
        LIMIT 5
      `);

      if (topResult.records.length > 0) {
        console.log(chalk.blue('\n🏆 最も参照される法令TOP5:'));
        topResult.records.forEach((record: any, i: number) => {
          const refs = record.get('refs');
          console.log(`  ${i + 1}. ${record.get('lawId')}: ${refs.toNumber ? refs.toNumber() : refs}件`);
        });
      }

    } finally {
      await session.close();
    }

    console.log(chalk.gray('=' .repeat(50)));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const importer = new EGovToNeo4jV2();
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'import':
          const lawId = process.argv[3];
          if (lawId) {
            await importer.importLawReferences(lawId);
          } else {
            await importer.importAll();
          }
          break;

        case 'stats':
          await importer.showStatistics();
          break;

        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-to-neo4j-v2.ts import [法令ID]  # 単一/全法令インポート');
          console.log('  npx tsx scripts/egov-to-neo4j-v2.ts stats           # 統計表示');
          console.log('\nオプション:');
          console.log('  --clean  インポート前に既存データを削除');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer.close();
    }
  })();
}