#!/usr/bin/env npx tsx

/**
 * Neo4j参照関係の集約
 * 重複する参照を統合し、カウントを保持
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

class ReferenceAggregator {
  private driver: any;
  private stats = {
    originalRefs: 0,
    aggregatedRefs: 0,
    reduction: 0
  };
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * Step 1: 現在の統計を取得
   */
  async getCurrentStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 現在の参照統計'));
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN COUNT(r) as total
      `);
      
      this.stats.originalRefs = result.records[0].get('total').toNumber();
      console.log(`  総参照数: ${this.stats.originalRefs}件`);
      
      // ユニークな参照関係をカウント
      const uniqueResult = await session.run(`
        MATCH (source)-[r:REFERENCES]->(target)
        RETURN COUNT(DISTINCT [source, target, r.type]) as unique
      `);
      
      const uniqueCount = uniqueResult.records[0].get('unique').toNumber();
      console.log(`  ユニークな関係（予測）: ${uniqueCount}件`);
      console.log(`  削減可能: ${this.stats.originalRefs - uniqueCount}件`);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: 参照を集約（新しいREFERENCES_AGGREGATEDリレーションシップとして）
   */
  async aggregateReferences(): Promise<void> {
    console.log(chalk.cyan('\n📌 参照の集約処理'));
    const session = this.driver.session();
    
    try {
      // まず既存の集約参照を削除
      console.log('  既存の集約参照を削除中...');
      await session.executeWrite(async (tx: any) => {
        await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          DELETE r
        `);
      });
      
      // Law → Law の参照を集約
      console.log('  Law → Law の参照を集約中...');
      const lawToLawResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source:Law)-[r:REFERENCES]->(target:Law)
          WITH source, target, r.type as type, 
               COUNT(r) as count,
               COLLECT(DISTINCT r.text)[0..10] as sampleTexts
          CREATE (source)-[newRef:REFERENCES_AGGREGATED {
            type: type,
            count: count,
            sampleTexts: sampleTexts,
            source: 'egov',
            aggregated: true,
            created: datetime()
          }]->(target)
          RETURN COUNT(*) as created
        `);
        return result.records[0].get('created').toNumber();
      });
      
      console.log(`    ${lawToLawResult}件の Law→Law 関係を作成`);
      
      // Article → Law の参照を集約
      console.log('  Article → Law の参照を集約中...');
      const articleToLawResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source:Article)-[r:REFERENCES]->(target:Law)
          WITH source, target, r.type as type,
               COUNT(r) as count,
               COLLECT(DISTINCT r.text)[0..10] as sampleTexts
          CREATE (source)-[newRef:REFERENCES_AGGREGATED {
            type: type,
            count: count,
            sampleTexts: sampleTexts,
            source: 'egov',
            aggregated: true,
            created: datetime()
          }]->(target)
          RETURN COUNT(*) as created
        `);
        return result.records[0].get('created').toNumber();
      });
      
      console.log(`    ${articleToLawResult}件の Article→Law 関係を作成`);
      
      // Article → Article の参照を集約
      console.log('  Article → Article の参照を集約中...');
      const articleToArticleResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source:Article)-[r:REFERENCES]->(target:Article)
          WITH source, target, r.type as type,
               COUNT(r) as count,
               COLLECT(DISTINCT r.text)[0..10] as sampleTexts
          CREATE (source)-[newRef:REFERENCES_AGGREGATED {
            type: type,
            count: count,
            sampleTexts: sampleTexts,
            source: 'egov',
            aggregated: true,
            created: datetime()
          }]->(target)
          RETURN COUNT(*) as created
        `);
        return result.records[0].get('created').toNumber();
      });
      
      console.log(`    ${articleToArticleResult}件の Article→Article 関係を作成`);
      
      // Law → Article の参照を集約
      console.log('  Law → Article の参照を集約中...');
      const lawToArticleResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source:Law)-[r:REFERENCES]->(target:Article)
          WITH source, target, r.type as type,
               COUNT(r) as count,
               COLLECT(DISTINCT r.text)[0..10] as sampleTexts
          CREATE (source)-[newRef:REFERENCES_AGGREGATED {
            type: type,
            count: count,
            sampleTexts: sampleTexts,
            source: 'egov',
            aggregated: true,
            created: datetime()
          }]->(target)
          RETURN COUNT(*) as created
        `);
        return result.records[0].get('created').toNumber();
      });
      
      console.log(`    ${lawToArticleResult}件の Law→Article 関係を作成`);
      
      this.stats.aggregatedRefs = lawToLawResult + articleToLawResult + 
                                  articleToArticleResult + lawToArticleResult;
      
      console.log(chalk.green(`  ✅ 合計 ${this.stats.aggregatedRefs}件の集約関係を作成`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 3: 集約後の統計を表示
   */
  async showAggregatedStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 集約後の統計'));
    const session = this.driver.session();
    
    try {
      // 集約参照の統計
      const aggResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WITH r.type as type, 
             SUM(r.count) as totalCount,
             COUNT(r) as uniqueRelations,
             AVG(r.count) as avgCount
        RETURN type, totalCount, uniqueRelations, avgCount
        ORDER BY totalCount DESC
      `);
      
      console.log('\n参照タイプ別:');
      console.log('タイプ | ユニーク関係 | 総参照数 | 平均重複');
      console.log('-'.repeat(60));
      
      let totalUnique = 0;
      let totalRefs = 0;
      
      aggResult.records.forEach(record => {
        const type = record.get('type');
        const totalCount = record.get('totalCount');
        const uniqueRelations = record.get('uniqueRelations');
        const avgCount = record.get('avgCount');
        
        totalUnique += uniqueRelations.toNumber ? uniqueRelations.toNumber() : uniqueRelations;
        totalRefs += totalCount.toNumber ? totalCount.toNumber() : totalCount;
        
        const avgValue = avgCount.toNumber ? avgCount.toNumber() : avgCount;
        console.log(`${type} | ${uniqueRelations}件 | ${totalCount}件 | ${avgValue.toFixed(1)}倍`);
      });
      
      console.log('-'.repeat(60));
      console.log(`合計 | ${totalUnique}件 | ${totalRefs}件 | ${(totalRefs/totalUnique).toFixed(1)}倍`);
      
      // TOP被参照法令（集約後）
      const topReferencedResult = await session.run(`
        MATCH (l:Law)<-[r:REFERENCES_AGGREGATED]-()
        RETURN l.lawId as lawId, l.lawTitle as title,
               COUNT(r) as uniqueRefs,
               SUM(r.count) as totalRefs
        ORDER BY uniqueRefs DESC
        LIMIT 10
      `);
      
      console.log('\n📊 被参照TOP10（集約後）:');
      console.log('法令 | ユニーク参照元 | 総参照回数');
      console.log('-'.repeat(60));
      
      topReferencedResult.records.forEach((record, i) => {
        const lawId = record.get('lawId');
        const title = record.get('title') || '不明';
        const uniqueRefs = record.get('uniqueRefs').toNumber();
        const totalRefs = record.get('totalRefs').toNumber();
        
        console.log(`${i+1}. ${title} (${lawId})`);
        console.log(`   ユニーク: ${uniqueRefs}件, 総数: ${totalRefs}件`);
      });
      
      // 地方税法の詳細
      const taxLawResult = await session.run(`
        MATCH (l:Law {lawId: '325AC0000000226'})<-[r:REFERENCES_AGGREGATED]-(source)
        WITH 
          COUNT(DISTINCT source) as uniqueSources,
          SUM(r.count) as totalRefs,
          COUNT(CASE WHEN source.lawId = '325AC0000000226' THEN r END) as selfRefs
        RETURN uniqueSources, totalRefs, selfRefs
      `);
      
      if (taxLawResult.records.length > 0) {
        const rec = taxLawResult.records[0];
        console.log('\n🎯 地方税法の詳細（集約後）:');
        console.log(`  ユニーク参照元: ${rec.get('uniqueSources').toNumber()}件`);
        console.log(`  総参照回数: ${rec.get('totalRefs').toNumber()}回`);
        console.log(`  自己参照: ${rec.get('selfRefs').toNumber()}件`);
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 4: 削減率を表示
   */
  showReductionStats(): void {
    console.log(chalk.cyan('\n✨ 集約結果サマリー'));
    console.log(chalk.gray('=' .repeat(60)));
    
    const reduction = this.stats.originalRefs - this.stats.aggregatedRefs;
    const reductionRate = (reduction / this.stats.originalRefs * 100).toFixed(1);
    
    console.log(`  集約前: ${this.stats.originalRefs.toLocaleString()}件`);
    console.log(`  集約後: ${this.stats.aggregatedRefs.toLocaleString()}件`);
    console.log(`  削減数: ${reduction.toLocaleString()}件`);
    console.log(chalk.green(`  削減率: ${reductionRate}%`));
    
    console.log(chalk.gray('=' .repeat(60)));
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 Neo4j参照関係の集約'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    await this.getCurrentStats();
    await this.aggregateReferences();
    await this.showAggregatedStats();
    this.showReductionStats();
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(chalk.gray(`\n処理時間: ${elapsed.toFixed(1)}秒`));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 実行
if (require.main === module) {
  const aggregator = new ReferenceAggregator();
  
  (async () => {
    try {
      await aggregator.run();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await aggregator.close();
    }
  })();
}

export default ReferenceAggregator;