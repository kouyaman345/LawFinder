#!/usr/bin/env npx tsx

/**
 * Neo4j参照管理統合ツール
 * 
 * すべての参照関連操作を統合した包括的な管理ツール
 * - HTMLからの参照インポート
 * - 参照の集約と正規化
 * - データ品質管理
 * - 統計とレポート
 */

import { Command } from 'commander';
import { initNeo4jDriver } from '../src/lib/neo4j';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import pLimit from 'p-limit';

const program = new Command();

/**
 * 基底クラス：共通機能を提供
 */
abstract class BaseProcessor {
  protected driver: any;
  protected stats: Record<string, number> = {};
  protected startTime: number = 0;
  
  constructor() {
    this.driver = initNeo4jDriver();
  }
  
  protected async close(): Promise<void> {
    await this.driver.close();
  }
  
  protected showElapsedTime(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    console.log(chalk.gray(`\n処理時間: ${elapsed.toFixed(1)}秒`));
  }
  
  protected formatNumber(num: any): string {
    const value = typeof num?.toNumber === 'function' ? num.toNumber() : num;
    return value?.toLocaleString() || '0';
  }
}

/**
 * HTMLから参照をインポート
 */
class ReferenceImporter extends BaseProcessor {
  private htmlDir: string;
  private concurrency: number = 5;
  private batchSize: number = 50;
  
  constructor(htmlDir: string = 'egov_html_cache') {
    super();
    this.htmlDir = path.join(process.cwd(), htmlDir);
  }
  
  private parseHTML(lawId: string, htmlPath: string): any[] {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const references: any[] = [];
    const seenRefs = new Map<string, number>();
    
    const links = document.querySelectorAll('a[href]');
    links.forEach((link: Element) => {
      const href = link.getAttribute('href') || '';
      const linkText = link.textContent?.trim() || '';
      
      if (!href || href.startsWith('/css/') || href.startsWith('/assets/') || 
          href.startsWith('http') || href === '/') {
        return;
      }
      
      let targetLawId: string | null = null;
      let isInternal = false;
      
      // アンカーリンク（内部参照）
      if (href.startsWith('#')) {
        isInternal = true;
        targetLawId = lawId;
      }
      // 法令リンク
      else if (href.startsWith('/law/')) {
        const lawMatch = href.match(/^\/law\/([A-Z0-9]+)/i);
        if (lawMatch) {
          targetLawId = lawMatch[1];
          isInternal = (targetLawId === lawId);
        }
      }
      
      if (!targetLawId) return;
      
      const refKey = `${targetLawId}:${linkText}`;
      const count = seenRefs.get(refKey) || 0;
      
      if (count < 3) {
        seenRefs.set(refKey, count + 1);
        references.push({
          sourceLawId: lawId,
          targetLawId: targetLawId,
          referenceText: linkText.substring(0, 200),
          referenceType: isInternal ? 'internal' : 'external',
          confidence: 1.0
        });
      }
    });
    
    dom.window.close();
    return references;
  }
  
  async importFromHTML(options: { limit?: number; skipExisting?: boolean } = {}): Promise<void> {
    console.log(chalk.cyan('📥 HTMLから参照をインポート'));
    this.startTime = Date.now();
    
    const htmlFiles = fs.readdirSync(this.htmlDir)
      .filter(f => f.endsWith('.html'))
      .slice(0, options.limit);
    
    console.log(`  対象: ${htmlFiles.length}ファイル`);
    
    const limit = pLimit(this.concurrency);
    const chunks = [];
    
    for (let i = 0; i < htmlFiles.length; i += this.batchSize) {
      chunks.push(htmlFiles.slice(i, i + this.batchSize));
    }
    
    for (const [index, chunk] of chunks.entries()) {
      console.log(`  バッチ ${index + 1}/${chunks.length} 処理中...`);
      
      await Promise.all(chunk.map(file => limit(async () => {
        const lawId = file.replace('.html', '');
        const htmlPath = path.join(this.htmlDir, file);
        
        if (options.skipExisting) {
          const session = this.driver.session();
          const exists = await session.run(
            'MATCH (l:Law {lawId: $lawId})-[r:REFERENCES]->() RETURN COUNT(r) > 0 as exists',
            { lawId }
          );
          await session.close();
          
          if (exists.records[0]?.get('exists')) {
            this.stats.skipped = (this.stats.skipped || 0) + 1;
            return;
          }
        }
        
        const references = this.parseHTML(lawId, htmlPath);
        
        // バッチインサート
        const session = this.driver.session();
        await session.executeWrite(async (tx: any) => {
          // 法令ノード作成
          await tx.run(
            'MERGE (l:Law {lawId: $lawId}) ON CREATE SET l.source = "egov", l.created = datetime()',
            { lawId }
          );
          
          // 参照作成
          for (const ref of references) {
            await tx.run(`
              MERGE (target:Law {lawId: $targetLawId})
              ON CREATE SET target.source = 'egov', target.created = datetime()
              WITH target
              MATCH (source:Law {lawId: $sourceLawId})
              CREATE (source)-[r:REFERENCES {
                text: $text,
                type: $type,
                confidence: 1.0,
                source: 'egov',
                created: datetime()
              }]->(target)
            `, {
              sourceLawId: ref.sourceLawId,
              targetLawId: ref.targetLawId,
              text: ref.referenceText,
              type: ref.referenceType
            });
          }
        });
        await session.close();
        
        this.stats.processed = (this.stats.processed || 0) + 1;
        this.stats.references = (this.stats.references || 0) + references.length;
      })));
    }
    
    console.log(chalk.green(`\n✅ インポート完了`));
    console.log(`  処理: ${this.stats.processed}法令`);
    console.log(`  参照: ${this.stats.references}件`);
    if (this.stats.skipped) {
      console.log(`  スキップ: ${this.stats.skipped}件`);
    }
    
    this.showElapsedTime();
  }
}

/**
 * 参照の集約処理
 */
class ReferenceAggregator extends BaseProcessor {
  async aggregate(): Promise<void> {
    console.log(chalk.cyan('📊 参照の集約処理'));
    this.startTime = Date.now();
    
    const session = this.driver.session();
    
    try {
      // 現在の統計
      const currentStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN COUNT(r) as total
      `);
      
      const totalRefs = currentStats.records[0].get('total');
      console.log(`  元の参照数: ${this.formatNumber(totalRefs)}件`);
      
      // 既存の集約を削除
      await session.executeWrite(async (tx: any) => {
        await tx.run('MATCH ()-[r:REFERENCES_AGGREGATED]->() DELETE r');
      });
      
      // 参照を集約
      console.log('  集約処理中...');
      const result = await session.executeWrite(async (tx: any) => {
        const res = await tx.run(`
          MATCH (source)-[r:REFERENCES]->(target)
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
        return res.records[0].get('created');
      });
      
      const aggregatedCount = this.formatNumber(result);
      console.log(chalk.green(`\n✅ 集約完了`));
      console.log(`  集約後: ${aggregatedCount}件`);
      console.log(`  削減率: ${((1 - parseInt(aggregatedCount.replace(/,/g, '')) / 
                                     parseInt(this.formatNumber(totalRefs).replace(/,/g, ''))) * 100).toFixed(1)}%`);
      
    } finally {
      await session.close();
    }
    
    this.showElapsedTime();
  }
}

/**
 * 参照の正規化処理
 */
class ReferenceNormalizer extends BaseProcessor {
  async normalize(options: { maxSelfRef?: number; maxExtRef?: number } = {}): Promise<void> {
    const maxSelfRef = options.maxSelfRef || 50;
    const maxExtRef = options.maxExtRef || 100;
    
    console.log(chalk.cyan('✂️ 参照の正規化'));
    console.log(`  自己参照上限: ${maxSelfRef}回`);
    console.log(`  外部参照上限: ${maxExtRef}回`);
    this.startTime = Date.now();
    
    const session = this.driver.session();
    
    try {
      // 統計的外れ値の検出
      const statsResult = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN AVG(r.count) as mean, STDEV(r.count) as stddev
      `);
      
      const mean = statsResult.records[0].get('mean');
      const stddev = statsResult.records[0].get('stddev');
      
      console.log(`  平均: ${mean.toFixed(1)}回, 標準偏差: ${stddev.toFixed(1)}`);
      
      // 自己参照の正規化
      const selfResult = await session.executeWrite(async (tx: any) => {
        const res = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId = target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime()
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: maxSelfRef });
        
        return {
          updated: this.formatNumber(res.records[0].get('updated')),
          reduction: this.formatNumber(res.records[0].get('reduction'))
        };
      });
      
      // 外部参照の正規化
      const extResult = await session.executeWrite(async (tx: any) => {
        const res = await tx.run(`
          MATCH (source)-[r:REFERENCES_AGGREGATED]->(target)
          WHERE source.lawId <> target.lawId AND r.count > $limit
          WITH r, r.count as oldCount
          SET r.count = $limit,
              r.normalized = true,
              r.originalCount = oldCount,
              r.normalizedAt = datetime()
          RETURN COUNT(r) as updated, SUM(oldCount - $limit) as reduction
        `, { limit: maxExtRef });
        
        return {
          updated: this.formatNumber(res.records[0].get('updated')),
          reduction: this.formatNumber(res.records[0].get('reduction'))
        };
      });
      
      console.log(chalk.green('\n✅ 正規化完了'));
      console.log(`  自己参照: ${selfResult.updated}件正規化, ${selfResult.reduction}回削減`);
      console.log(`  外部参照: ${extResult.updated}件正規化, ${extResult.reduction}回削減`);
      
    } finally {
      await session.close();
    }
    
    this.showElapsedTime();
  }
  
  async removeAllLimits(): Promise<void> {
    console.log(chalk.cyan('📊 すべての正規化を解除'));
    this.startTime = Date.now();
    
    const session = this.driver.session();
    
    try {
      const result = await session.executeWrite(async (tx: any) => {
        const res = await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          WHERE r.normalized = true AND r.originalCount IS NOT NULL
          WITH r, r.originalCount as original, r.count as current
          SET r.count = r.originalCount,
              r.normalized = false,
              r.normalizedAt = null,
              r.restoredAt = datetime()
          RETURN COUNT(r) as restored, SUM(original - current) as totalRestored
        `);
        
        return {
          restored: this.formatNumber(res.records[0].get('restored')),
          totalRestored: this.formatNumber(res.records[0].get('totalRestored'))
        };
      });
      
      // プロパティクリーンアップ
      await session.executeWrite(async (tx: any) => {
        await tx.run(`
          MATCH ()-[r:REFERENCES_AGGREGATED]->()
          WHERE r.originalCount IS NOT NULL
          REMOVE r.originalCount, r.normalized, r.normalizedAt
        `);
      });
      
      console.log(chalk.green('\n✅ 正規化解除完了'));
      console.log(`  復元: ${result.restored}件`);
      console.log(`  復元カウント: ${result.totalRestored}回`);
      
    } finally {
      await session.close();
    }
    
    this.showElapsedTime();
  }
}

/**
 * 統計とレポート
 */
class ReferenceReporter extends BaseProcessor {
  async showStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 参照統計レポート'));
    console.log('=' .repeat(70));
    
    const session = this.driver.session();
    
    try {
      // 全体統計
      const totalStats = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        RETURN 
          COUNT(r) as uniqueRefs,
          SUM(r.count) as totalCount,
          MAX(r.count) as maxCount,
          MIN(r.count) as minCount,
          AVG(r.count) as avgCount,
          STDEV(r.count) as stdDev
      `);
      
      const stats = totalStats.records[0];
      if (stats) {
        console.log(chalk.yellow('全体統計:'));
        console.log(`  ユニーク参照: ${this.formatNumber(stats.get('uniqueRefs'))}件`);
        console.log(`  総参照数: ${this.formatNumber(stats.get('totalCount'))}回`);
        console.log(`  最大: ${this.formatNumber(stats.get('maxCount'))}回`);
        console.log(`  最小: ${this.formatNumber(stats.get('minCount'))}回`);
        console.log(`  平均: ${stats.get('avgCount').toFixed(1)}回`);
        console.log(`  標準偏差: ${stats.get('stdDev').toFixed(1)}`);
      }
      
      // タイプ別統計
      const typeStats = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WITH r.type as type,
             COUNT(r) as count,
             SUM(r.count) as total,
             AVG(r.count) as avg
        RETURN type, count, total, avg
        ORDER BY total DESC
      `);
      
      if (typeStats.records.length > 0) {
        console.log(chalk.yellow('\n参照タイプ別:'));
        console.log('タイプ | 件数 | 総数 | 平均');
        console.log('-'.repeat(50));
        typeStats.records.forEach(rec => {
          const type = rec.get('type');
          const count = this.formatNumber(rec.get('count'));
          const total = this.formatNumber(rec.get('total'));
          const avg = rec.get('avg').toFixed(1);
          console.log(`${type.padEnd(10)} | ${count.padStart(8)} | ${total.padStart(10)} | ${avg}`);
        });
      }
      
      // TOP被参照法令
      const topReferenced = await session.run(`
        MATCH (l:Law)<-[r:REFERENCES_AGGREGATED]-()
        RETURN l.lawId as lawId, l.lawTitle as title,
               COUNT(r) as uniqueRefs,
               SUM(r.count) as totalRefs
        ORDER BY uniqueRefs DESC
        LIMIT 10
      `);
      
      if (topReferenced.records.length > 0) {
        console.log(chalk.yellow('\n被参照TOP10:'));
        topReferenced.records.forEach((rec, i) => {
          const lawId = rec.get('lawId');
          const title = rec.get('title') || '不明';
          const unique = this.formatNumber(rec.get('uniqueRefs'));
          const total = this.formatNumber(rec.get('totalRefs'));
          
          console.log(`${i+1}. ${title.substring(0,30)} (${lawId})`);
          console.log(`   ユニーク: ${unique}件, 総数: ${total}回`);
        });
      }
      
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
      
      const dist = distribution.records[0];
      if (dist) {
        console.log(chalk.yellow('\nカウント分布:'));
        console.log(`  1回: ${this.formatNumber(dist.get('count1'))}件`);
        console.log(`  2-10回: ${this.formatNumber(dist.get('count2_10'))}件`);
        console.log(`  11-50回: ${this.formatNumber(dist.get('count11_50'))}件`);
        console.log(`  51-100回: ${this.formatNumber(dist.get('count51_100'))}件`);
        console.log(`  100回超: ${this.formatNumber(dist.get('count100plus'))}件`);
      }
      
    } finally {
      await session.close();
    }
    
    console.log('=' .repeat(70));
  }
  
  async checkDataQuality(): Promise<void> {
    console.log(chalk.cyan('\n🔍 データ品質チェック'));
    
    const session = this.driver.session();
    
    try {
      // 重複チェック
      const duplicates = await session.run(`
        MATCH (source)-[r1:REFERENCES_AGGREGATED]->(target)
        MATCH (source)-[r2:REFERENCES_AGGREGATED]->(target)
        WHERE id(r1) < id(r2) AND r1.type = r2.type
        RETURN COUNT(*) as duplicates
      `);
      
      // 空テキスト
      const emptyTexts = await session.run(`
        MATCH ()-[r:REFERENCES_AGGREGATED]->()
        WHERE SIZE(COALESCE(r.sampleTexts, [])) = 0
        RETURN COUNT(r) as empty
      `);
      
      // 自己参照
      const selfRefs = await session.run(`
        MATCH (l:Law)-[r:REFERENCES_AGGREGATED]->(l)
        RETURN COUNT(r) as selfRefs, SUM(r.count) as totalSelfRefs
      `);
      
      console.log(`  重複参照: ${this.formatNumber(duplicates.records[0].get('duplicates'))}件`);
      console.log(`  空テキスト: ${this.formatNumber(emptyTexts.records[0].get('empty'))}件`);
      console.log(`  自己参照: ${this.formatNumber(selfRefs.records[0].get('selfRefs'))}件 ` +
                  `(${this.formatNumber(selfRefs.records[0].get('totalSelfRefs'))}回)`);
      
      // 法令名の欠損
      const missingTitles = await session.run(`
        MATCH (l:Law)
        WHERE l.lawTitle IS NULL OR l.lawTitle = ''
        RETURN COUNT(l) as missing
      `);
      
      console.log(`  法令名欠損: ${this.formatNumber(missingTitles.records[0].get('missing'))}件`);
      
    } finally {
      await session.close();
    }
  }
}

// コマンドライン設定
program
  .name('neo4j-reference-manager')
  .description('Neo4j参照管理統合ツール')
  .version('2.0.0');

program
  .command('import')
  .description('HTMLから参照をインポート')
  .option('-l, --limit <number>', '処理する法令数の上限', parseInt)
  .option('-s, --skip-existing', '既存の法令をスキップ')
  .action(async (options) => {
    const importer = new ReferenceImporter();
    try {
      await importer.importFromHTML(options);
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer['close']();
    }
  });

program
  .command('aggregate')
  .description('参照を集約')
  .action(async () => {
    const aggregator = new ReferenceAggregator();
    try {
      await aggregator.aggregate();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await aggregator['close']();
    }
  });

program
  .command('normalize')
  .description('参照を正規化')
  .option('--max-self <number>', '自己参照の上限', parseInt, 50)
  .option('--max-ext <number>', '外部参照の上限', parseInt, 100)
  .action(async (options) => {
    const normalizer = new ReferenceNormalizer();
    try {
      await normalizer.normalize({
        maxSelfRef: options.maxSelf,
        maxExtRef: options.maxExt
      });
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await normalizer['close']();
    }
  });

program
  .command('remove-limits')
  .description('すべての正規化を解除')
  .action(async () => {
    const normalizer = new ReferenceNormalizer();
    try {
      await normalizer.removeAllLimits();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await normalizer['close']();
    }
  });

program
  .command('stats')
  .description('統計を表示')
  .action(async () => {
    const reporter = new ReferenceReporter();
    try {
      await reporter.showStats();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await reporter['close']();
    }
  });

program
  .command('quality')
  .description('データ品質をチェック')
  .action(async () => {
    const reporter = new ReferenceReporter();
    try {
      await reporter.checkDataQuality();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await reporter['close']();
    }
  });

program
  .command('full-process')
  .description('完全処理（インポート→集約→正規化→統計）')
  .option('-l, --limit <number>', '処理する法令数', parseInt)
  .action(async (options) => {
    console.log(chalk.cyan('=' .repeat(70)));
    console.log(chalk.cyan('🚀 完全処理を開始'));
    console.log(chalk.cyan('=' .repeat(70)));
    
    const importer = new ReferenceImporter();
    const aggregator = new ReferenceAggregator();
    const normalizer = new ReferenceNormalizer();
    const reporter = new ReferenceReporter();
    
    try {
      // 1. インポート
      console.log(chalk.blue('\n[Step 1/4] HTMLからインポート'));
      await importer.importFromHTML({ limit: options.limit, skipExisting: true });
      
      // 2. 集約
      console.log(chalk.blue('\n[Step 2/4] 参照の集約'));
      await aggregator.aggregate();
      
      // 3. 正規化
      console.log(chalk.blue('\n[Step 3/4] 参照の正規化'));
      await normalizer.normalize();
      
      // 4. 統計
      console.log(chalk.blue('\n[Step 4/4] 統計レポート'));
      await reporter.showStats();
      await reporter.checkDataQuality();
      
      console.log(chalk.green('\n✅ 完全処理が完了しました'));
      
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer['close']();
      await aggregator['close']();
      await normalizer['close']();
      await reporter['close']();
    }
  });

// コマンド実行
if (require.main === module) {
  program.parse();
}

export { ReferenceImporter, ReferenceAggregator, ReferenceNormalizer, ReferenceReporter };