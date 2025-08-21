#!/usr/bin/env npx tsx

/**
 * 全法令データをNeo4jに投入する最適化スクリプト
 * 
 * 特徴:
 * - エラーハンドリング強化
 * - プログレス表示
 * - 再開可能な処理
 * - メモリ効率的なバッチ処理
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface CheckpointData {
  lastProcessedIndex: number;
  totalLaws: number;
  processedLaws: number;
  totalReferences: number;
  errors: Array<{lawId: string; error: string}>;
  startTime: string;
}

class Neo4jImporter {
  private driver: any;
  private checkpointFile = 'Report/neo4j-import-checkpoint.json';
  private checkpoint: CheckpointData;
  private batchSize = 100; // 法令のバッチサイズ
  private referenceBatchSize = 5000; // 参照のバッチサイズ

  constructor() {
    this.driver = neo4j.driver(
      'bolt://localhost:7687',
      neo4j.auth.basic('neo4j', 'lawfinder123')
    );

    // チェックポイントの読み込み
    if (fs.existsSync(this.checkpointFile)) {
      this.checkpoint = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
      console.log(chalk.yellow(`♻️  前回の処理を再開: ${this.checkpoint.processedLaws}/${this.checkpoint.totalLaws}件処理済み`));
    } else {
      this.checkpoint = {
        lastProcessedIndex: 0,
        totalLaws: 0,
        processedLaws: 0,
        totalReferences: 0,
        errors: [],
        startTime: new Date().toISOString()
      };
    }
  }

  /**
   * チェックポイントを保存
   */
  private saveCheckpoint() {
    fs.writeFileSync(this.checkpointFile, JSON.stringify(this.checkpoint, null, 2));
  }

  /**
   * CSVから法令データを読み込み
   */
  private async loadLawsFromCSV(): Promise<Array<{id: string; title: string; type: string}>> {
    const csvPath = 'laws_data/all_law_list.csv';
    if (!fs.existsSync(csvPath)) {
      throw new Error('CSVファイルが見つかりません');
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: false,
      skip_empty_lines: true,
      from_line: 2 // ヘッダーをスキップ
    });

    const laws: Array<{id: string; title: string; type: string}> = [];
    
    for (const record of records) {
      if (record[11] && record[2]) { // IDとタイトルがある場合のみ
        const lawId = record[11].trim();
        const title = record[2].trim();
        const type = this.detectLawType(lawId);
        
        laws.push({ id: lawId, title, type });
      }
    }

    return laws;
  }

  /**
   * 法令タイプを判定
   */
  private detectLawType(lawId: string): string {
    if (lawId.includes('AC')) return '法律';
    if (lawId.includes('CO')) return '政令';
    if (lawId.includes('M')) return '省令';
    if (lawId.includes('IO')) return '勅令';
    return 'その他';
  }

  /**
   * Neo4jをクリーンアップ
   */
  private async cleanupNeo4j(session: any) {
    console.log(chalk.yellow('🧹 既存データをクリーンアップ中...'));
    
    // リレーションシップを削除
    let deletedRels = 0;
    while (true) {
      const result = await session.run(
        'MATCH ()-[r:REFERENCES]->() WITH r LIMIT 10000 DELETE r RETURN count(r) as count'
      );
      const count = result.records[0]?.get('count').toNumber() || 0;
      deletedRels += count;
      if (count < 10000) break;
    }
    
    // ノードを削除
    let deletedNodes = 0;
    while (true) {
      const result = await session.run(
        'MATCH (n:Law) WITH n LIMIT 10000 DELETE n RETURN count(n) as count'
      );
      const count = result.records[0]?.get('count').toNumber() || 0;
      deletedNodes += count;
      if (count < 10000) break;
    }
    
    console.log(chalk.green(`✅ ${deletedRels}個のリレーションシップと${deletedNodes}個のノードを削除`));
  }

  /**
   * 法令ノードを作成
   */
  private async createLawNodes(session: any, laws: Array<{id: string; title: string; type: string}>) {
    console.log(chalk.cyan('📚 法令ノードを作成中...'));
    const progressBar = ora('処理中...').start();
    
    for (let i = this.checkpoint.lastProcessedIndex; i < laws.length; i += this.batchSize) {
      const batch = laws.slice(i, Math.min(i + this.batchSize, laws.length));
      
      try {
        await session.run(
          `UNWIND $laws as law
           MERGE (l:Law {id: law.id})
           ON CREATE SET l.title = law.title, l.type = law.type, l.createdAt = datetime()
           ON MATCH SET l.title = law.title, l.type = law.type, l.updatedAt = datetime()
           RETURN count(l)`,
          { laws: batch }
        );
        
        this.checkpoint.processedLaws += batch.length;
        this.checkpoint.lastProcessedIndex = i + batch.length;
        
        progressBar.text = `処理中: ${this.checkpoint.processedLaws}/${laws.length}`;
        
        // 定期的にチェックポイント保存
        if (i % 1000 === 0) {
          this.saveCheckpoint();
        }
      } catch (error: any) {
        console.error(chalk.red(`\n❌ バッチ処理エラー: ${error.message}`));
        // エラーを記録して続行
        for (const law of batch) {
          this.checkpoint.errors.push({
            lawId: law.id,
            error: error.message
          });
        }
      }
    }
    
    progressBar.succeed(chalk.green(`✅ ${this.checkpoint.processedLaws}件の法令ノードを作成`));
  }

  /**
   * 参照データを生成して投入
   */
  private async createReferences(session: any) {
    console.log(chalk.cyan('🔗 参照リレーションシップを作成中...'));
    const progressBar = ora('参照データを生成中...').start();
    
    // PostgreSQLから参照データを取得
    const references = await prisma.reference.findMany({
      where: {
        targetLawId: { not: null }
      },
      select: {
        sourceLawId: true,
        targetLawId: true,
        referenceType: true,
        referenceText: true,
        confidence: true
      }
    });
    
    progressBar.text = `${references.length}件の参照を投入中...`;
    
    // バッチで投入
    for (let i = 0; i < references.length; i += this.referenceBatchSize) {
      const batch = references.slice(i, i + this.referenceBatchSize);
      
      try {
        const cypher = `
          UNWIND $refs as ref
          MATCH (from:Law {id: ref.sourceLawId})
          MATCH (to:Law {id: ref.targetLawId})
          MERGE (from)-[r:REFERENCES {
            type: ref.referenceType,
            text: ref.referenceText,
            confidence: ref.confidence
          }]->(to)
          RETURN count(r)
        `;
        
        const result = await session.run(cypher, { 
          refs: batch.map(r => ({
            sourceLawId: r.sourceLawId,
            targetLawId: r.targetLawId,
            referenceType: r.referenceType,
            referenceText: r.referenceText?.substring(0, 200), // テキストを制限
            confidence: r.confidence
          }))
        });
        
        const count = result.records[0]?.get('count(r)').toNumber() || 0;
        this.checkpoint.totalReferences += count;
        
        progressBar.text = `投入中: ${this.checkpoint.totalReferences}件完了`;
        
        // 定期的にチェックポイント保存
        if (i % 10000 === 0) {
          this.saveCheckpoint();
        }
      } catch (error: any) {
        console.error(chalk.red(`\n⚠️  参照投入エラー: ${error.message}`));
        // エラーをログに記録して続行
      }
    }
    
    progressBar.succeed(chalk.green(`✅ ${this.checkpoint.totalReferences}件の参照を投入`));
  }

  /**
   * インデックスを作成
   */
  private async createIndexes(session: any) {
    console.log(chalk.cyan('🔧 インデックスを作成中...'));
    
    const indexes = [
      'CREATE INDEX law_id IF NOT EXISTS FOR (l:Law) ON (l.id)',
      'CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title)',
      'CREATE INDEX law_type IF NOT EXISTS FOR (l:Law) ON (l.type)',
      'CREATE INDEX ref_type IF NOT EXISTS FOR ()-[r:REFERENCES]-() ON (r.type)'
    ];
    
    for (const index of indexes) {
      try {
        await session.run(index);
        console.log(chalk.green(`✅ ${index.split(' ')[2]} インデックス作成`));
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          console.error(chalk.yellow(`⚠️  インデックス作成スキップ: ${error.message}`));
        }
      }
    }
  }

  /**
   * 統計情報を表示
   */
  private async showStatistics(session: any) {
    console.log(chalk.cyan('\n📊 最終統計'));
    console.log('='.repeat(60));
    
    // ノード数
    const nodeCount = await session.run('MATCH (l:Law) RETURN count(l) as count');
    const nodes = nodeCount.records[0].get('count').toNumber();
    
    // リレーションシップ数
    const relCount = await session.run('MATCH ()-[r:REFERENCES]->() RETURN count(r) as count');
    const rels = relCount.records[0].get('count').toNumber();
    
    // タイプ別統計
    const typeStats = await session.run(`
      MATCH (l:Law)
      RETURN l.type as type, count(l) as count
      ORDER BY count DESC
    `);
    
    console.log(`\n総法令数: ${nodes.toLocaleString()}`);
    console.log(`総参照数: ${rels.toLocaleString()}`);
    console.log(`平均参照数: ${(rels / nodes).toFixed(2)}`);
    
    console.log('\n法令タイプ別:');
    for (const record of typeStats.records) {
      const type = record.get('type');
      const count = record.get('count').toNumber();
      console.log(`  ${type}: ${count.toLocaleString()}件`);
    }
    
    // エラー統計
    if (this.checkpoint.errors.length > 0) {
      console.log(chalk.yellow(`\n⚠️  エラー: ${this.checkpoint.errors.length}件`));
      console.log('詳細はチェックポイントファイルを確認してください');
    }
    
    // 処理時間
    const startTime = new Date(this.checkpoint.startTime);
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`\n処理時間: ${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒`);
  }

  /**
   * メイン処理
   */
  async execute(options: { clean?: boolean; resume?: boolean }) {
    const session = this.driver.session();
    
    try {
      // クリーンモードの場合
      if (options.clean) {
        await this.cleanupNeo4j(session);
        // チェックポイントもリセット
        this.checkpoint = {
          lastProcessedIndex: 0,
          totalLaws: 0,
          processedLaws: 0,
          totalReferences: 0,
          errors: [],
          startTime: new Date().toISOString()
        };
      }
      
      // 法令データを読み込み
      const laws = await this.loadLawsFromCSV();
      this.checkpoint.totalLaws = laws.length;
      console.log(chalk.cyan(`📚 ${laws.length}件の法令を処理します`));
      
      // 法令ノードを作成
      await this.createLawNodes(session, laws);
      
      // 参照リレーションシップを作成
      await this.createReferences(session);
      
      // インデックスを作成
      await this.createIndexes(session);
      
      // 統計を表示
      await this.showStatistics(session);
      
      // 成功したらチェックポイントを削除
      if (fs.existsSync(this.checkpointFile)) {
        fs.unlinkSync(this.checkpointFile);
      }
      
      console.log(chalk.green.bold('\n✨ 全法令データのNeo4j投入が完了しました！'));
      
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), error);
      this.saveCheckpoint();
      console.log(chalk.yellow('チェックポイントを保存しました。--resumeオプションで再開できます。'));
      process.exit(1);
    } finally {
      await session.close();
      await this.driver.close();
      await prisma.$disconnect();
    }
  }
}

// CLIパース
const args = process.argv.slice(2);
const options = {
  clean: args.includes('--clean'),
  resume: args.includes('--resume')
};

// 実行
const importer = new Neo4jImporter();
importer.execute(options).catch(console.error);