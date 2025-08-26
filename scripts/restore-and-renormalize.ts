#!/usr/bin/env npx tsx

/**
 * 参照カウントの復元と新しい上限での再正規化
 * 上限値: 自己参照500回、外部参照200回
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

class ReferenceRenormalizer {
  private driver: any;
  private stats = {
    restoredRefs: 0,
    renormalizedRefs: 0,
    totalRestored: 0,
    totalReduced: 0
  };
  
  // 新しいカウント上限の設定
  private readonly NEW_LIMITS = {
    SELF_REFERENCE: 500,    // 自己参照の新上限（200→500）
    EXTERNAL_REFERENCE: 200  // 外部参照の新上限（100→200）
  };
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * Step 1: 正規化済み参照を元の値に復元
   */
  async restoreOriginalCounts(): Promise<void> {
    console.log(chalk.cyan('\n📊 元のカウント値への復元'));
    const session = this.driver.session();
    
    try {
      // 正規化済みの参照を復元
      console.log('\n正規化済み参照を元の値に復元中...');
      const restoreResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          WHERE r.normalized = true AND r.originalCount IS NOT NULL
          WITH r, r.originalCount as original, r.count as current
          SET r.count = r.originalCount,
              r.normalized = false,
              r.restoredAt = datetime()
          RETURN COUNT(r) as restored, SUM(original - current) as totalRestored
        `);
        
        const restored = result.records[0].get('restored');
        const totalRestored = result.records[0].get('totalRestored');
        
        return {
          restored: typeof restored.toNumber === 'function' ? restored.toNumber() : restored,
          totalRestored: typeof totalRestored.toNumber === 'function' ? totalRestored.toNumber() : totalRestored
        };
      });
      
      this.stats.restoredRefs = restoreResult.restored;
      this.stats.totalRestored = restoreResult.totalRestored;
      
      console.log(`  ✅ ${this.stats.restoredRefs}件を復元`);
      console.log(`  復元カウント: ${this.stats.totalRestored.toLocaleString()}回`);
      
      // 復元後の最大値確認
      const maxResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN MAX(r.count) as maxCount
      `);
      
      const maxCount = maxResult.records[0].get('maxCount');
      console.log(`  現在の最大カウント: ${maxCount}回`);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: 新しい上限値で再正規化
   */
  async renormalizeWithNewLimits(): Promise<void> {
    console.log(chalk.cyan('\n✂️ 新しい上限値での再正規化'));
    console.log(`  自己参照上限: ${this.NEW_LIMITS.SELF_REFERENCE}回`);
    console.log(`  外部参照上限: ${this.NEW_LIMITS.EXTERNAL_REFERENCE}回`);
    
    const session = this.driver.session();
    
    try {
      // 自己参照の再正規化
      console.log(`\n自己参照を最大${this.NEW_LIMITS.SELF_REFERENCE}回に制限...`);
      const selfRefResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId = target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime(),
              r.newLimit = true
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: this.NEW_LIMITS.SELF_REFERENCE });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${selfRefResult.updated}件を正規化`);
      console.log(`  削減カウント: ${selfRefResult.reduction.toLocaleString()}回`);
      
      // 外部参照の再正規化
      console.log(`\n外部参照を最大${this.NEW_LIMITS.EXTERNAL_REFERENCE}回に制限...`);
      const extRefResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId <> target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime(),
              r.newLimit = true
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: this.NEW_LIMITS.EXTERNAL_REFERENCE });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${extRefResult.updated}件を正規化`);
      console.log(`  削減カウント: ${extRefResult.reduction.toLocaleString()}回`);
      
      this.stats.renormalizedRefs = selfRefResult.updated + extRefResult.updated;
      this.stats.totalReduced = selfRefResult.reduction + extRefResult.reduction;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 3: 新しい統計を表示
   */
  async showNewStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 再正規化後の統計'));
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
          COUNT(CASE WHEN r.normalized = true THEN r END) as normalizedCount
      `);
      
      const rec = totalResult.records[0];
      const uniqueRefsVal = rec.get('uniqueRefs');
      const totalCountVal = rec.get('totalCount');
      const maxCountVal = rec.get('maxCount');
      const avgCountVal = rec.get('avgCount');
      const normalizedCountVal = rec.get('normalizedCount');
      
      const uniqueRefs = typeof uniqueRefsVal.toNumber === 'function' ? uniqueRefsVal.toNumber() : uniqueRefsVal;
      const totalCount = typeof totalCountVal.toNumber === 'function' ? totalCountVal.toNumber() : totalCountVal;
      const maxCount = typeof maxCountVal.toNumber === 'function' ? maxCountVal.toNumber() : maxCountVal;
      const avgCount = avgCountVal;
      const normalizedCount = typeof normalizedCountVal.toNumber === 'function' ? normalizedCountVal.toNumber() : normalizedCountVal;
      
      console.log(`\n全体統計:`);
      console.log(`  ユニーク参照: ${uniqueRefs}件`);
      console.log(`  総参照カウント: ${totalCount}回`);
      console.log(`  最大カウント: ${maxCount}回`);
      console.log(`  平均カウント: ${avgCount.toFixed(1)}回`);
      console.log(`  正規化済み参照: ${normalizedCount}件`);
      
      // 上限に達している参照の数
      const atLimitResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN 
          COUNT(CASE WHEN r.count = $selfLimit THEN 1 END) as at500,
          COUNT(CASE WHEN r.count = $extLimit THEN 1 END) as at200,
          COUNT(CASE WHEN r.count >= 400 AND r.count < $selfLimit THEN 1 END) as range400_499,
          COUNT(CASE WHEN r.count >= 150 AND r.count < $extLimit THEN 1 END) as range150_199
      `, { 
        selfLimit: this.NEW_LIMITS.SELF_REFERENCE,
        extLimit: this.NEW_LIMITS.EXTERNAL_REFERENCE 
      });
      
      const limitRec = atLimitResult.records[0];
      console.log('\n📈 新上限付近の分布:');
      console.log(`  500回（自己参照上限）: ${limitRec.get('at500')}件`);
      console.log(`  200回（外部参照上限）: ${limitRec.get('at200')}件`);
      console.log(`  400-499回: ${limitRec.get('range400_499')}件`);
      console.log(`  150-199回: ${limitRec.get('range150_199')}件`);
      
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
      const outgoingVal = taxRec.get('outgoing');
      const outTotalVal = taxRec.get('outTotal');
      const maxOutVal = taxRec.get('maxOut');
      const incomingVal = taxRec.get('incoming');
      const inTotalVal = taxRec.get('inTotal');
      const maxInVal = taxRec.get('maxIn');
      
      const outgoing = typeof outgoingVal.toNumber === 'function' ? outgoingVal.toNumber() : outgoingVal;
      const outTotal = typeof outTotalVal.toNumber === 'function' ? outTotalVal.toNumber() : outTotalVal;
      const maxOut = typeof maxOutVal.toNumber === 'function' ? maxOutVal.toNumber() : maxOutVal;
      const incoming = typeof incomingVal.toNumber === 'function' ? incomingVal.toNumber() : incomingVal;
      const inTotal = typeof inTotalVal.toNumber === 'function' ? inTotalVal.toNumber() : inTotalVal;
      const maxIn = typeof maxInVal.toNumber === 'function' ? maxInVal.toNumber() : maxInVal;
      
      console.log('\n🎯 地方税法の再正規化後:');
      console.log(`  発信参照: ${outgoing}件 (総${outTotal}回, 最大${maxOut}回)`);
      console.log(`  受信参照: ${incoming}件 (総${inTotal}回, 最大${maxIn}回)`);
      
    } finally {
      await session.close();
    }
  }

  /**
   * サマリー表示
   */
  showSummary(): void {
    console.log(chalk.cyan('\n✨ 再正規化サマリー'));
    console.log(chalk.gray('=' .repeat(60)));
    
    console.log('復元処理:');
    console.log(`  復元した参照: ${this.stats.restoredRefs}件`);
    console.log(`  復元カウント: ${this.stats.totalRestored.toLocaleString()}回`);
    
    console.log('\n再正規化:');
    console.log(`  正規化した参照: ${this.stats.renormalizedRefs}件`);
    console.log(`  削減カウント: ${this.stats.totalReduced.toLocaleString()}回`);
    
    console.log('\n新しい上限値:');
    console.log(`  自己参照: 最大${this.NEW_LIMITS.SELF_REFERENCE}回（旧: 200回）`);
    console.log(`  外部参照: 最大${this.NEW_LIMITS.EXTERNAL_REFERENCE}回（旧: 100回）`);
    
    console.log(chalk.gray('=' .repeat(60)));
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 参照カウントの再正規化（新上限値）'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    await this.restoreOriginalCounts();
    await this.renormalizeWithNewLimits();
    await this.showNewStats();
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
  const renormalizer = new ReferenceRenormalizer();
  
  (async () => {
    try {
      await renormalizer.run();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await renormalizer.close();
    }
  })();
}

export default ReferenceRenormalizer;