#!/usr/bin/env npx tsx

/**
 * 既存データの条文番号を正規化するスクリプト
 * 
 * データベースとNeo4j内の条文番号を統一形式に変換
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import chalk from 'chalk';
import { normalizeArticleNumber, toNumericFormat } from '../src/utils/article-normalizer';

const prisma = new PrismaClient();

class ArticleNumberNormalizer {
  private driver: neo4j.Driver;
  private session: neo4j.Session;
  private stats = {
    postgresql: {
      references: { total: 0, updated: 0, failed: 0 },
      articles: { total: 0, updated: 0, failed: 0 }
    },
    neo4j: {
      articles: { total: 0, updated: 0, failed: 0 },
      references: { total: 0, updated: 0, failed: 0 }
    }
  };

  constructor() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'lawfinder123';
    
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    this.session = this.driver.session();
  }

  /**
   * PostgreSQLの参照データを正規化
   */
  async normalizePostgreSQLReferences() {
    console.log(chalk.cyan('\n📊 PostgreSQL参照データの正規化開始...'));
    
    try {
      const references = await prisma.reference.findMany();
      this.stats.postgresql.references.total = references.length;
      
      for (const ref of references) {
        try {
          // sourceArticleとtargetArticleを正規化
          const updates: any = {};
          
          if (ref.sourceArticle) {
            const normalized = toNumericFormat(ref.sourceArticle);
            if (normalized !== ref.sourceArticle) {
              updates.sourceArticle = normalized;
            }
          }
          
          if (ref.targetArticle) {
            const normalized = toNumericFormat(ref.targetArticle);
            if (normalized !== ref.targetArticle) {
              updates.targetArticle = normalized;
            }
          }
          
          // 更新が必要な場合のみ実行
          if (Object.keys(updates).length > 0) {
            await prisma.reference.update({
              where: { id: ref.id },
              data: updates
            });
            this.stats.postgresql.references.updated++;
            
            if (this.stats.postgresql.references.updated % 100 === 0) {
              console.log(chalk.gray(`  処理済み: ${this.stats.postgresql.references.updated}/${this.stats.postgresql.references.total}`));
            }
          }
        } catch (error) {
          this.stats.postgresql.references.failed++;
          console.error(chalk.red(`  エラー (${ref.id}): ${error}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('PostgreSQL参照データ取得エラー:'), error);
    }
  }

  /**
   * Neo4jの条文ノードを正規化
   */
  async normalizeNeo4jArticles() {
    console.log(chalk.cyan('\n🔗 Neo4j条文ノードの正規化開始...'));
    
    try {
      // 条文ノードを取得
      const result = await this.session.run(`
        MATCH (a:Article)
        RETURN a, id(a) as nodeId
      `);
      
      this.stats.neo4j.articles.total = result.records.length;
      
      for (const record of result.records) {
        const article = record.get('a');
        const nodeId = record.get('nodeId');
        const currentNumber = article.properties.number;
        
        if (currentNumber) {
          const normalized = toNumericFormat(currentNumber);
          
          // 更新が必要な場合
          if (normalized !== currentNumber) {
            try {
              await this.session.run(`
                MATCH (a:Article)
                WHERE id(a) = $nodeId
                SET a.number = $newNumber,
                    a.displayNumber = $displayNumber,
                    a.originalNumber = $originalNumber
                RETURN a
              `, {
                nodeId: nodeId,
                newNumber: normalized,
                displayNumber: `第${normalized}条`,
                originalNumber: currentNumber
              });
              
              this.stats.neo4j.articles.updated++;
            } catch (error) {
              this.stats.neo4j.articles.failed++;
              console.error(chalk.red(`  Neo4jノード更新エラー: ${error}`));
            }
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Neo4j条文ノード取得エラー:'), error);
    }
  }

  /**
   * Neo4jの参照エッジを正規化
   */
  async normalizeNeo4jReferences() {
    console.log(chalk.cyan('\n🔗 Neo4j参照エッジの正規化開始...'));
    
    try {
      // 参照エッジを取得
      const result = await this.session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN r, id(r) as edgeId
      `);
      
      this.stats.neo4j.references.total = result.records.length;
      
      for (const record of result.records) {
        const ref = record.get('r');
        const edgeId = record.get('edgeId');
        const props = ref.properties;
        
        // sourceArticleとtargetArticleを正規化（エッジのプロパティとして保存されている場合）
        const updates: any = {};
        
        if (props.sourceArticle) {
          const normalized = toNumericFormat(props.sourceArticle);
          if (normalized !== props.sourceArticle) {
            updates.sourceArticle = normalized;
            updates.sourceArticleDisplay = `第${normalized}条`;
          }
        }
        
        if (props.targetArticle) {
          const normalized = toNumericFormat(props.targetArticle);
          if (normalized !== props.targetArticle) {
            updates.targetArticle = normalized;
            updates.targetArticleDisplay = `第${normalized}条`;
          }
        }
        
        // 更新が必要な場合
        if (Object.keys(updates).length > 0) {
          try {
            const setClause = Object.keys(updates)
              .map(key => `r.${key} = $${key}`)
              .join(', ');
            
            await this.session.run(`
              MATCH ()-[r:REFERENCES]->()
              WHERE id(r) = $edgeId
              SET ${setClause}
              RETURN r
            `, {
              edgeId: edgeId,
              ...updates
            });
            
            this.stats.neo4j.references.updated++;
          } catch (error) {
            this.stats.neo4j.references.failed++;
            console.error(chalk.red(`  Neo4jエッジ更新エラー: ${error}`));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Neo4j参照エッジ取得エラー:'), error);
    }
  }

  /**
   * 統計情報の表示
   */
  displayStats() {
    console.log(chalk.cyan('\n📈 正規化結果サマリー\n'));
    
    console.table({
      'PostgreSQL参照': {
        '総数': this.stats.postgresql.references.total,
        '更新': this.stats.postgresql.references.updated,
        '失敗': this.stats.postgresql.references.failed
      },
      'Neo4j条文ノード': {
        '総数': this.stats.neo4j.articles.total,
        '更新': this.stats.neo4j.articles.updated,
        '失敗': this.stats.neo4j.articles.failed
      },
      'Neo4j参照エッジ': {
        '総数': this.stats.neo4j.references.total,
        '更新': this.stats.neo4j.references.updated,
        '失敗': this.stats.neo4j.references.failed
      }
    });
    
    const totalUpdated = 
      this.stats.postgresql.references.updated +
      this.stats.neo4j.articles.updated +
      this.stats.neo4j.references.updated;
    
    const totalFailed = 
      this.stats.postgresql.references.failed +
      this.stats.neo4j.articles.failed +
      this.stats.neo4j.references.failed;
    
    console.log(chalk.green(`\n✅ 合計 ${totalUpdated} 件のデータを正規化しました`));
    
    if (totalFailed > 0) {
      console.log(chalk.yellow(`⚠️ ${totalFailed} 件のエラーが発生しました`));
    }
  }

  /**
   * バックアップの作成
   */
  async createBackup() {
    console.log(chalk.cyan('\n💾 バックアップ作成中...'));
    
    try {
      // PostgreSQLのバックアップ（参照テーブルのみ）
      const references = await prisma.reference.findMany();
      const backupPath = `./backup/references_${Date.now()}.json`;
      
      const fs = require('fs');
      const path = require('path');
      
      // backupディレクトリ作成
      if (!fs.existsSync('./backup')) {
        fs.mkdirSync('./backup');
      }
      
      fs.writeFileSync(backupPath, JSON.stringify(references, null, 2));
      console.log(chalk.green(`  PostgreSQLバックアップ: ${backupPath}`));
      
      // Neo4jのバックアップ（Cypherクエリ形式）
      const neo4jBackupPath = `./backup/neo4j_export_${Date.now()}.cypher`;
      const exportQuery = await this.session.run(`
        CALL apoc.export.cypher.all(null, {
          format: 'plain',
          cypherFormat: 'create'
        })
        YIELD cypherStatements
        RETURN cypherStatements
      `);
      
      if (exportQuery.records.length > 0) {
        fs.writeFileSync(neo4jBackupPath, exportQuery.records[0].get('cypherStatements'));
        console.log(chalk.green(`  Neo4jバックアップ: ${neo4jBackupPath}`));
      }
    } catch (error) {
      console.error(chalk.yellow('⚠️ バックアップ作成中にエラーが発生しました:'), error);
      console.log(chalk.yellow('  処理を続行します...'));
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    await this.session.close();
    await this.driver.close();
    await prisma.$disconnect();
  }
}

/**
 * メイン実行
 */
async function main() {
  console.log(chalk.cyan('🔧 条文番号正規化スクリプト\n'));
  
  const normalizer = new ArticleNumberNormalizer();
  
  try {
    // 引数処理
    const args = process.argv.slice(2);
    const skipBackup = args.includes('--skip-backup');
    const postgresOnly = args.includes('--postgres-only');
    const neo4jOnly = args.includes('--neo4j-only');
    const dryRun = args.includes('--dry-run');
    
    if (dryRun) {
      console.log(chalk.yellow('🔍 ドライランモード（実際の更新は行いません）\n'));
    }
    
    // バックアップ作成
    if (!skipBackup && !dryRun) {
      await normalizer.createBackup();
    }
    
    // PostgreSQL正規化
    if (!neo4jOnly) {
      await normalizer.normalizePostgreSQLReferences();
    }
    
    // Neo4j正規化
    if (!postgresOnly) {
      await normalizer.normalizeNeo4jArticles();
      await normalizer.normalizeNeo4jReferences();
    }
    
    // 統計表示
    normalizer.displayStats();
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error);
    process.exit(1);
  } finally {
    await normalizer.cleanup();
  }
}

// 実行
if (require.main === module) {
  main();
}

export { ArticleNumberNormalizer };