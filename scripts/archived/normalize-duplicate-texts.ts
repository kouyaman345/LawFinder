#!/usr/bin/env npx tsx

/**
 * 同一テキスト参照の正規化
 * HTMLの目次による構造的重複を除去
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

class DuplicateTextNormalizer {
  private driver: any;
  private stats = {
    totalRefs: 0,
    normalizedRefs: 0,
    totalReduction: 0
  };
  
  // テキストごとの最大カウント
  private readonly MAX_COUNT_PER_TEXT = 10;
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * Step 1: 高頻度参照の検出
   */
  async detectHighFrequencyRefs(): Promise<void> {
    console.log(chalk.cyan('\n📊 高頻度参照の検出'));
    const session = this.driver.session();
    
    try {
      // カウントが100を超える参照を検出
      const highFreqResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WHERE r.count > 100
        RETURN COUNT(r) as count, 
               SUM(r.count) as totalCount,
               MAX(r.count) as maxCount
      `);
      
      const rec = highFreqResult.records[0];
      const count = rec.get('count');
      const totalCount = rec.get('totalCount');
      const maxCount = rec.get('maxCount');
      
      console.log(`\n100回超の参照:`);
      console.log(`  対象: ${typeof count.toNumber === 'function' ? count.toNumber() : count}件`);
      console.log(`  総カウント: ${typeof totalCount.toNumber === 'function' ? totalCount.toNumber() : totalCount}回`);
      console.log(`  最大: ${typeof maxCount.toNumber === 'function' ? maxCount.toNumber() : maxCount}回`);
      
      this.stats.totalRefs = typeof count.toNumber === 'function' ? count.toNumber() : count;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: 統計的外れ値の正規化
   */
  async normalizeOutliers(): Promise<void> {
    console.log(chalk.cyan('\n✂️ 統計的外れ値の正規化'));
    const session = this.driver.session();
    
    try {
      // まず統計を取得
      const statsResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN AVG(r.count) as mean, 
               STDEV(r.count) as stddev
      `);
      
      const mean = statsResult.records[0].get('mean');
      const stddev = statsResult.records[0].get('stddev');
      
      // 平均 + 3標準偏差を上限とする（統計的外れ値）
      const threshold = Math.round(mean + (stddev * 3));
      const maxThreshold = Math.min(threshold, 50); // 最大でも50回まで
      
      console.log(`\n統計分析:`);
      console.log(`  平均: ${mean.toFixed(1)}回`);
      console.log(`  標準偏差: ${stddev.toFixed(1)}`);
      console.log(`  3σ閾値: ${threshold}回`);
      console.log(`  適用する上限: ${maxThreshold}回`);
      
      // 自己参照の正規化（より厳しい制限）
      console.log(`\n自己参照を最大${maxThreshold}回に制限...`);
      const selfRefResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId = target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime(),
              r.normalizedReason = 'structural_duplicate'
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: maxThreshold });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${selfRefResult.updated}件を正規化`);
      console.log(`  削減カウント: ${selfRefResult.reduction.toLocaleString()}回`);
      
      // 外部参照の正規化（やや緩い制限）
      const extMaxThreshold = maxThreshold * 2; // 外部参照は2倍まで許容
      console.log(`\n外部参照を最大${extMaxThreshold}回に制限...`);
      const extRefResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId <> target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime(),
              r.normalizedReason = 'statistical_outlier'
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: extMaxThreshold });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${extRefResult.updated}件を正規化`);
      console.log(`  削減カウント: ${extRefResult.reduction.toLocaleString()}回`);
      
      this.stats.normalizedRefs = selfRefResult.updated + extRefResult.updated;
      this.stats.totalReduction = selfRefResult.reduction + extRefResult.reduction;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 3: 正規化後の統計
   */
  async showNormalizedStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 正規化後の統計'));
    const session = this.driver.session();
    
    try {
      // 全体統計
      const totalResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN 
          COUNT(r) as uniqueRefs,
          SUM(r.count) as totalCount,
          MAX(r.count) as maxCount,
          AVG(r.count) as avgCount,
          STDEV(r.count) as stdDev,
          COUNT(CASE WHEN r.normalized = true THEN r END) as normalizedCount
      `);
      
      const rec = totalResult.records[0];
      const uniqueRefs = rec.get('uniqueRefs');
      const totalCount = rec.get('totalCount');
      const maxCount = rec.get('maxCount');
      const avgCount = rec.get('avgCount');
      const stdDev = rec.get('stdDev');
      const normalizedCount = rec.get('normalizedCount');
      
      console.log(`\n全体統計:`);
      console.log(`  ユニーク参照: ${typeof uniqueRefs.toNumber === 'function' ? uniqueRefs.toNumber() : uniqueRefs}件`);
      console.log(`  総参照カウント: ${typeof totalCount.toNumber === 'function' ? totalCount.toNumber() : totalCount}回`);
      console.log(`  最大カウント: ${typeof maxCount.toNumber === 'function' ? maxCount.toNumber() : maxCount}回`);
      console.log(`  平均カウント: ${avgCount.toFixed(1)}回`);
      console.log(`  標準偏差: ${stdDev.toFixed(1)}`);
      console.log(`  正規化済み: ${typeof normalizedCount.toNumber === 'function' ? normalizedCount.toNumber() : normalizedCount}件`);
      
      // カウント分布
      const distribution = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WITH r.count as count
        RETURN 
          COUNT(CASE WHEN count = 1 THEN 1 END) as count1,
          COUNT(CASE WHEN count >= 2 AND count <= 10 THEN 1 END) as count2_10,
          COUNT(CASE WHEN count >= 11 AND count <= 50 THEN 1 END) as count11_50,
          COUNT(CASE WHEN count >= 51 AND count <= 100 THEN 1 END) as count51_100,
          COUNT(CASE WHEN count > 100 THEN 1 END) as count100plus
      `);
      
      const distRec = distribution.records[0];
      console.log('\nカウント分布:');
      console.log(`  1回: ${distRec.get('count1')}件`);
      console.log(`  2-10回: ${distRec.get('count2_10')}件`);
      console.log(`  11-50回: ${distRec.get('count11_50')}件`);
      console.log(`  51-100回: ${distRec.get('count51_100')}件`);
      console.log(`  100回超: ${distRec.get('count100plus')}件`);
      
      // 地方税法の確認
      const taxLawResult = await session.run(`
        MATCH (l:Law {lawId: '325AC0000000226'})
        OPTIONAL MATCH (l)-[out:REFERENCES_AGGREGATED]->()
        OPTIONAL MATCH (l)<-[in:REFERENCES_AGGREGATED]-()
        WITH 
          COUNT(DISTINCT out) as outgoing,
          SUM(out.count) as outTotal,
          MAX(out.count) as maxOut,
          COUNT(DISTINCT in) as incoming,
          SUM(in.count) as inTotal,
          MAX(in.count) as maxIn
        RETURN outgoing, outTotal, maxOut, incoming, inTotal, maxIn
      `);
      
      const taxRec = taxLawResult.records[0];
      console.log('\n🎯 地方税法（正規化後）:');
      console.log(`  発信参照: ${taxRec.get('outgoing')}件 (総${taxRec.get('outTotal')}回, 最大${taxRec.get('maxOut')}回)`);
      console.log(`  受信参照: ${taxRec.get('incoming')}件 (総${taxRec.get('inTotal')}回, 最大${taxRec.get('maxIn')}回)`);
      
    } finally {
      await session.close();
    }
  }

  /**
   * サマリー表示
   */
  showSummary(): void {
    console.log(chalk.cyan('\n✨ 重複テキスト正規化サマリー'));
    console.log(chalk.gray('=' .repeat(60)));
    
    console.log('処理結果:');
    console.log(`  検出した高頻度参照: ${this.stats.totalRefs}件`);
    console.log(`  正規化した参照: ${this.stats.normalizedRefs}件`);
    console.log(`  削減カウント: ${this.stats.totalReduction.toLocaleString()}回`);
    
    console.log('\n正規化ルール:');
    console.log('  統計的外れ値（平均+3σ）を上限に制限');
    console.log('  HTMLの構造的重複（目次・ナビゲーション）を除去');
    
    console.log(chalk.gray('=' .repeat(60)));
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 同一テキスト参照の正規化'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    await this.detectHighFrequencyRefs();
    await this.normalizeOutliers();
    await this.showNormalizedStats();
    this.showSummary();
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(chalk.gray(`\n処理時間: ${elapsed.toFixed(1)}秒`));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 実行
if (require.main === module) {
  const normalizer = new DuplicateTextNormalizer();
  
  (async () => {
    try {
      await normalizer.run();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await normalizer.close();
    }
  })();
}

export default DuplicateTextNormalizer;