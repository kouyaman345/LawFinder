#!/usr/bin/env npx tsx

/**
 * すべての参照カウント制限を解除
 * 元の値に完全復元して上限なしの状態にする
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

class RemoveAllLimits {
  private driver: any;
  private stats = {
    restoredRefs: 0,
    totalRestored: 0,
    maxSelfRef: 0,
    maxExtRef: 0
  };
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * Step 1: すべての正規化を解除して元の値に復元
   */
  async removeAllNormalization(): Promise<void> {
    console.log(chalk.cyan('\n📊 すべての正規化を解除'));
    const session = this.driver.session();
    
    try {
      // 正規化済みの参照をすべて元に戻す
      console.log('\nすべての参照を元の値に復元中...');
      const restoreResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          WHERE r.normalized = true AND r.originalCount IS NOT NULL
          WITH r, r.originalCount as original, r.count as current
          SET r.count = r.originalCount,
              r.normalized = false,
              r.normalizedAt = null,
              r.newLimit = null,
              r.restoredAt = datetime(),
              r.noLimit = true
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
      
      console.log(`  ✅ ${this.stats.restoredRefs}件を完全復元`);
      console.log(`  復元カウント: ${this.stats.totalRestored.toLocaleString()}回`);
      
      // originalCountプロパティをクリーンアップ
      console.log('\n不要なプロパティをクリーンアップ中...');
      await session.executeWrite(async (tx: any) => {
        await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          WHERE r.originalCount IS NOT NULL
          REMOVE r.originalCount, r.normalized, r.normalizedAt, r.newLimit
          SET r.noLimit = true
        `);
      });
      
      console.log('  ✅ プロパティをクリーンアップ完了');
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: 上限なしの統計を表示
   */
  async showUnlimitedStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 上限なしの最終統計'));
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
          STDEV(r.count) as stdDev
      `);
      
      const rec = totalResult.records[0];
      const uniqueRefsVal = rec.get('uniqueRefs');
      const totalCountVal = rec.get('totalCount');
      const maxCountVal = rec.get('maxCount');
      const avgCountVal = rec.get('avgCount');
      const stdDevVal = rec.get('stdDev');
      
      const uniqueRefs = typeof uniqueRefsVal.toNumber === 'function' ? uniqueRefsVal.toNumber() : uniqueRefsVal;
      const totalCount = typeof totalCountVal.toNumber === 'function' ? totalCountVal.toNumber() : totalCountVal;
      const maxCount = typeof maxCountVal.toNumber === 'function' ? maxCountVal.toNumber() : maxCountVal;
      
      console.log(`\n全体統計（上限なし）:`);
      console.log(`  ユニーク参照: ${uniqueRefs.toLocaleString()}件`);
      console.log(`  総参照カウント: ${totalCount.toLocaleString()}回`);
      console.log(`  最大カウント: ${maxCount.toLocaleString()}回`);
      console.log(`  平均カウント: ${avgCountVal.toFixed(1)}回`);
      console.log(`  標準偏差: ${stdDevVal.toFixed(1)}`);
      
      // タイプ別の最大値
      const typeMaxResult = await session.run(`
        MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
        WITH 
          CASE WHEN source.lawId = target.lawId THEN '自己参照' ELSE '外部参照' END as type,
          MAX(r.count) as maxCount,
          AVG(r.count) as avgCount,
          COUNT(r) as count
        RETURN type, maxCount, avgCount, count
      `);
      
      console.log('\n📌 タイプ別統計:');
      typeMaxResult.records.forEach(rec => {
        const type = rec.get('type');
        const maxVal = rec.get('maxCount');
        const avgVal = rec.get('avgCount');
        const countVal = rec.get('count');
        
        const max = typeof maxVal.toNumber === 'function' ? maxVal.toNumber() : maxVal;
        const count = typeof countVal.toNumber === 'function' ? countVal.toNumber() : countVal;
        
        if (type === '自己参照') this.stats.maxSelfRef = max;
        if (type === '外部参照') this.stats.maxExtRef = max;
        
        console.log(`  ${type}:`);
        console.log(`    件数: ${count.toLocaleString()}件`);
        console.log(`    最大: ${max.toLocaleString()}回`);
        console.log(`    平均: ${avgVal.toFixed(1)}回`);
      });
      
      // カウント分布
      const distribution = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WITH r.count as count
        RETURN 
          COUNT(CASE WHEN count = 1 THEN 1 END) as count1,
          COUNT(CASE WHEN count >= 2 AND count <= 10 THEN 1 END) as count2_10,
          COUNT(CASE WHEN count >= 11 AND count <= 100 THEN 1 END) as count11_100,
          COUNT(CASE WHEN count >= 101 AND count <= 500 THEN 1 END) as count101_500,
          COUNT(CASE WHEN count >= 501 AND count <= 1000 THEN 1 END) as count501_1000,
          COUNT(CASE WHEN count >= 1001 AND count <= 2000 THEN 1 END) as count1001_2000,
          COUNT(CASE WHEN count > 2000 THEN 1 END) as count2000plus
      `);
      
      const distRec = distribution.records[0];
      console.log('\n📈 カウント分布（上限なし）:');
      const dist = [
        { range: '1回', count: distRec.get('count1') },
        { range: '2-10回', count: distRec.get('count2_10') },
        { range: '11-100回', count: distRec.get('count11_100') },
        { range: '101-500回', count: distRec.get('count101_500') },
        { range: '501-1000回', count: distRec.get('count501_1000') },
        { range: '1001-2000回', count: distRec.get('count1001_2000') },
        { range: '2000回超', count: distRec.get('count2000plus') }
      ];
      
      dist.forEach(d => {
        const count = typeof d.count.toNumber === 'function' ? d.count.toNumber() : d.count;
        const percent = (count / uniqueRefs * 100).toFixed(1);
        console.log(`  ${d.range.padEnd(12)}: ${count.toLocaleString().padStart(7)}件 (${percent}%)`);
      });
      
      // 最大カウントTOP5
      const topRefs = await session.run(`
        MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
        RETURN 
          source.lawId as sourceLaw,
          source.lawTitle as sourceTitle,
          target.lawId as targetLaw,
          target.lawTitle as targetTitle,
          r.count as count,
          CASE WHEN source.lawId = target.lawId THEN '自己' ELSE '外部' END as type
        ORDER BY count DESC
        LIMIT 5
      `);
      
      console.log('\n🏆 最大カウントTOP5:');
      topRefs.records.forEach((rec, i) => {
        const sourceTitle = rec.get('sourceTitle') || rec.get('sourceLaw');
        const targetTitle = rec.get('targetTitle') || rec.get('targetLaw');
        const count = rec.get('count');
        const type = rec.get('type');
        
        const countVal = typeof count.toNumber === 'function' ? count.toNumber() : count;
        
        console.log(`\n${i+1}. ${sourceTitle.substring(0,25)}`);
        console.log(`   → ${type === '自己' ? '自己参照' : targetTitle.substring(0,25)}`);
        console.log(`   ${countVal.toLocaleString()}回`);
      });
      
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
      
      if (taxLawResult.records.length > 0) {
        const taxRec = taxLawResult.records[0];
        console.log('\n🎯 地方税法（上限なし）:');
        console.log(`  発信参照: ${taxRec.get('outgoing')}件`);
        console.log(`  発信総数: ${taxRec.get('outTotal').toLocaleString()}回`);
        console.log(`  発信最大: ${taxRec.get('maxOut').toLocaleString()}回`);
        console.log(`  受信参照: ${taxRec.get('incoming')}件`);
        console.log(`  受信総数: ${taxRec.get('inTotal').toLocaleString()}回`);
        console.log(`  受信最大: ${taxRec.get('maxIn').toLocaleString()}回`);
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * サマリー表示
   */
  showSummary(): void {
    console.log(chalk.cyan('\n✨ 上限解除サマリー'));
    console.log(chalk.gray('=' .repeat(60)));
    
    console.log('処理結果:');
    console.log(`  復元した参照: ${this.stats.restoredRefs}件`);
    console.log(`  復元カウント: ${this.stats.totalRestored.toLocaleString()}回`);
    
    console.log('\n最大値（上限なし）:');
    console.log(`  自己参照の最大: ${this.stats.maxSelfRef.toLocaleString()}回`);
    console.log(`  外部参照の最大: ${this.stats.maxExtRef.toLocaleString()}回`);
    
    console.log('\n状態:');
    console.log(chalk.green('  ✅ すべての参照が元の値に復元されました'));
    console.log(chalk.green('  ✅ カウント上限は完全に解除されました'));
    
    console.log(chalk.gray('=' .repeat(60)));
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 参照カウント上限の完全解除'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    await this.removeAllNormalization();
    await this.showUnlimitedStats();
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
  const remover = new RemoveAllLimits();
  
  (async () => {
    try {
      await remover.run();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await remover.close();
    }
  })();
}

export default RemoveAllLimits;