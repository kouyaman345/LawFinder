#!/usr/bin/env npx tsx

/**
 * 異常な参照カウントの正規化
 * HTMLの構造的重複を除去し、現実的な参照数に調整
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

class ReferenceNormalizer {
  private driver: any;
  private stats = {
    abnormalRefs: 0,
    normalizedRefs: 0,
    totalReduction: 0
  };
  
  // カウント上限の設定
  private readonly LIMITS = {
    SELF_REFERENCE: 200,    // 自己参照（内部参照）の上限
    EXTERNAL_REFERENCE: 100, // 外部参照の上限
    DEFAULT: 100            // デフォルト上限
  };
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * Step 1: 異常カウントの検出と分析
   */
  async detectAbnormalCounts(): Promise<void> {
    console.log(chalk.cyan('\n📊 異常カウントの検出'));
    const session = this.driver.session();
    
    try {
      // 自己参照で異常なもの
      const selfRefResult = await session.run(`
        MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
        WHERE source.lawId = target.lawId AND r.count > $limit
        RETURN COUNT(r) as count, SUM(r.count) as total, MAX(r.count) as max
      `, { limit: this.LIMITS.SELF_REFERENCE });
      
      const selfRefCount = selfRefResult.records[0].get('count').toNumber();
      const selfRefTotal = selfRefResult.records[0].get('total').toNumber();
      
      console.log(`\n自己参照（>${this.LIMITS.SELF_REFERENCE}回）:`);
      console.log(`  対象: ${selfRefCount}件`);
      console.log(`  総カウント: ${selfRefTotal}回`);
      
      // 外部参照で異常なもの
      const extRefResult = await session.run(`
        MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
        WHERE source.lawId <> target.lawId AND r.count > $limit
        RETURN COUNT(r) as count, SUM(r.count) as total, MAX(r.count) as max
      `, { limit: this.LIMITS.EXTERNAL_REFERENCE });
      
      const extRefCount = extRefResult.records[0].get('count').toNumber();
      const extRefTotal = extRefResult.records[0].get('total').toNumber();
      
      console.log(`\n外部参照（>${this.LIMITS.EXTERNAL_REFERENCE}回）:`);
      console.log(`  対象: ${extRefCount}件`);
      console.log(`  総カウント: ${extRefTotal}回`);
      
      this.stats.abnormalRefs = selfRefCount + extRefCount;
      
      // 詳細リスト
      if (this.stats.abnormalRefs > 0) {
        console.log(chalk.yellow('\n📋 正規化対象の詳細:'));
        
        const detailResult = await session.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE (source.lawId = target.lawId AND r.count > $selfLimit) OR
                (source.lawId <> target.lawId AND r.count > $extLimit)
          RETURN 
            source.lawId as sourceLaw,
            source.lawTitle as sourceTitle,
            target.lawId as targetLaw,
            target.lawTitle as targetTitle,
            r.type as type,
            r.count as count,
            CASE WHEN source.lawId = target.lawId THEN true ELSE false END as isSelfRef
          ORDER BY count DESC
          LIMIT 20
        `, { 
          selfLimit: this.LIMITS.SELF_REFERENCE,
          extLimit: this.LIMITS.EXTERNAL_REFERENCE
        });
        
        detailResult.records.forEach((rec, i) => {
          const sourceLaw = rec.get('sourceLaw');
          const targetLaw = rec.get('targetLaw');
          const sourceTitle = rec.get('sourceTitle') || '不明';
          const count = rec.get('count').toNumber();
          const isSelfRef = rec.get('isSelfRef');
          
          console.log(`\n${i+1}. ${sourceTitle.substring(0,30)} (${sourceLaw})`);
          if (isSelfRef) {
            console.log(`   → 自己参照: ${count}回 → ${this.LIMITS.SELF_REFERENCE}回に正規化`);
          } else {
            console.log(`   → ${targetLaw}: ${count}回 → ${this.LIMITS.EXTERNAL_REFERENCE}回に正規化`);
          }
        });
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: カウントの正規化
   */
  async normalizeReferenceCounts(): Promise<void> {
    console.log(chalk.cyan('\n✂️ カウントの正規化処理'));
    const session = this.driver.session();
    
    try {
      // 自己参照の正規化
      console.log(`\n自己参照を最大${this.LIMITS.SELF_REFERENCE}回に制限...`);
      const selfRefUpdateResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId = target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime()
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: this.LIMITS.SELF_REFERENCE });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${selfRefUpdateResult.updated}件を正規化`);
      console.log(`  削減カウント: ${selfRefUpdateResult.reduction.toLocaleString()}回`);
      
      // 外部参照の正規化
      console.log(`\n外部参照を最大${this.LIMITS.EXTERNAL_REFERENCE}回に制限...`);
      const extRefUpdateResult = await session.executeWrite(async (tx: any) => {
        const result = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId <> target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime()
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: this.LIMITS.EXTERNAL_REFERENCE });
        
        const updated = result.records[0].get('updated');
        const reduction = result.records[0].get('reduction');
        return {
          updated: typeof updated.toNumber === 'function' ? updated.toNumber() : updated,
          reduction: typeof reduction.toNumber === 'function' ? reduction.toNumber() : reduction
        };
      });
      
      console.log(`  ✅ ${extRefUpdateResult.updated}件を正規化`);
      console.log(`  削減カウント: ${extRefUpdateResult.reduction.toLocaleString()}回`);
      
      this.stats.normalizedRefs = selfRefUpdateResult.updated + extRefUpdateResult.updated;
      this.stats.totalReduction = selfRefUpdateResult.reduction + extRefUpdateResult.reduction;
      
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
      // 総参照数の再計算
      const totalResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN 
          COUNT(r) as uniqueRefs,
          SUM(r.count) as totalCount,
          COUNT(CASE WHEN r.normalized = true THEN r END) as normalizedCount
      `);
      
      const rec = totalResult.records[0];
      const uniqueRefsVal = rec.get('uniqueRefs');
      const totalCountVal = rec.get('totalCount');
      const normalizedCountVal = rec.get('normalizedCount');
      
      const uniqueRefs = typeof uniqueRefsVal.toNumber === 'function' ? uniqueRefsVal.toNumber() : uniqueRefsVal;
      const totalCount = typeof totalCountVal.toNumber === 'function' ? totalCountVal.toNumber() : totalCountVal;
      const normalizedCount = typeof normalizedCountVal.toNumber === 'function' ? normalizedCountVal.toNumber() : normalizedCountVal;
      
      console.log(`\n全体統計:`);
      console.log(`  ユニーク参照: ${uniqueRefs}件`);
      console.log(`  総参照カウント: ${totalCount}回`);
      console.log(`  正規化された参照: ${normalizedCount}件`);
      console.log(`  平均カウント: ${(totalCount/uniqueRefs).toFixed(1)}回`);
      
      // カウント分布の再確認
      const distribution = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WITH CASE 
          WHEN r.count = 1 THEN '1回'
          WHEN r.count <= 5 THEN '2-5回'
          WHEN r.count <= 10 THEN '6-10回'
          WHEN r.count <= 50 THEN '11-50回'
          WHEN r.count <= 100 THEN '51-100回'
          WHEN r.count <= 200 THEN '101-200回'
          ELSE '200回超'
        END as range,
        COUNT(*) as count
        RETURN range, count
        ORDER BY 
          CASE range
            WHEN '1回' THEN 1
            WHEN '2-5回' THEN 2
            WHEN '6-10回' THEN 3
            WHEN '11-50回' THEN 4
            WHEN '51-100回' THEN 5
            WHEN '101-200回' THEN 6
            ELSE 7
          END
      `);
      
      console.log('\n正規化後のカウント分布:');
      console.log('範囲 | 件数');
      console.log('-'.repeat(30));
      
      distribution.records.forEach(rec => {
        const range = rec.get('range');
        const countVal = rec.get('count');
        const count = typeof countVal.toNumber === 'function' ? countVal.toNumber() : countVal;
        console.log(`${range.padEnd(10)} | ${count}件`);
      });
      
      // 地方税法の確認
      const taxLawResult = await session.run(`
        MATCH (l:Law {lawId: '325AC0000000226'})
        OPTIONAL MATCH (l)-[out:REFERENCES_AGGREGATED]->()
        OPTIONAL MATCH (l)<-[in:REFERENCES_AGGREGATED]-()
        WITH 
          COUNT(DISTINCT out) as outgoing,
          SUM(out.count) as outTotal,
          COUNT(DISTINCT in) as incoming,
          SUM(in.count) as inTotal
        RETURN outgoing, outTotal, incoming, inTotal
      `);
      
      const taxRec = taxLawResult.records[0];
      const outgoingVal = taxRec.get('outgoing');
      const outTotalVal = taxRec.get('outTotal');
      const incomingVal = taxRec.get('incoming');
      const inTotalVal = taxRec.get('inTotal');
      
      const outgoing = typeof outgoingVal.toNumber === 'function' ? outgoingVal.toNumber() : outgoingVal;
      const outTotal = typeof outTotalVal.toNumber === 'function' ? outTotalVal.toNumber() : outTotalVal;
      const incoming = typeof incomingVal.toNumber === 'function' ? incomingVal.toNumber() : incomingVal;
      const inTotal = typeof inTotalVal.toNumber === 'function' ? inTotalVal.toNumber() : inTotalVal;
      
      console.log('\n🎯 地方税法の正規化後:');
      console.log(`  発信参照: ${outgoing}件 (総${outTotal}回)`);
      console.log(`  受信参照: ${incoming}件 (総${inTotal}回)`);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 4: サマリー表示
   */
  showSummary(): void {
    console.log(chalk.cyan('\n✨ 正規化サマリー'));
    console.log(chalk.gray('=' .repeat(60)));
    
    console.log(`  異常参照検出: ${this.stats.abnormalRefs}件`);
    console.log(`  正規化実行: ${this.stats.normalizedRefs}件`);
    console.log(`  削減カウント: ${this.stats.totalReduction.toLocaleString()}回`);
    
    console.log('\n正規化ルール:');
    console.log(`  自己参照: 最大${this.LIMITS.SELF_REFERENCE}回`);
    console.log(`  外部参照: 最大${this.LIMITS.EXTERNAL_REFERENCE}回`);
    
    console.log(chalk.gray('=' .repeat(60)));
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 参照カウントの正規化'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    await this.detectAbnormalCounts();
    
    if (this.stats.abnormalRefs > 0) {
      await this.normalizeReferenceCounts();
      await this.showNormalizedStats();
    } else {
      console.log(chalk.green('\n✅ 異常なカウントは検出されませんでした'));
    }
    
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
  const normalizer = new ReferenceNormalizer();
  
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

export default ReferenceNormalizer;