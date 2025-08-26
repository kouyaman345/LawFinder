#!/usr/bin/env npx tsx

/**
 * Neo4j参照データの修正スクリプト
 * 
 * 1. 自己参照をinternalに変更
 * 2. 法令名を補完
 * 3. 重複を削除
 * 4. データ品質を改善
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

class Neo4jReferenceFixer {
  private driver: any;
  private htmlDir: string;
  private stats = {
    selfRefsFixed: 0,
    lawNamesAdded: 0,
    duplicatesRemoved: 0,
    emptyRefsRemoved: 0
  };
  
  constructor() {
    this.driver = initNeo4jDriver();
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
  }

  /**
   * Step 1: 自己参照の修正
   */
  async fixSelfReferences(): Promise<void> {
    console.log(chalk.cyan('\n📌 Step 1: 自己参照の修正'));
    const session = this.driver.session();
    
    try {
      // 現在の自己参照数を確認
      const beforeResult = await session.run(`
        MATCH (source)-[r:REFERENCES]->(target:Law)
        WHERE source.lawId = target.lawId AND r.type = 'external'
        RETURN COUNT(r) as count
      `);
      const beforeCount = beforeResult.records[0].get('count').toNumber();
      console.log(`  修正前: ${beforeCount}件の誤った自己参照`);
      
      // バッチ処理で修正
      const batchSize = 1000;
      let processed = 0;
      
      while (processed < beforeCount) {
        const updateResult = await session.executeWrite(async (tx: any) => {
          return await tx.run(`
            MATCH (source)-[r:REFERENCES]->(target:Law)
            WHERE source.lawId = target.lawId AND r.type = 'external'
            WITH r LIMIT ${batchSize}
            SET r.type = 'internal'
            RETURN COUNT(r) as updated
          `);
        });
        
        const updated = updateResult.records[0].get('updated').toNumber();
        if (updated === 0) break;
        
        processed += updated;
        this.stats.selfRefsFixed += updated;
        
        if (processed % 10000 === 0) {
          console.log(`    ${processed}/${beforeCount}件処理済み`);
        }
      }
      
      console.log(chalk.green(`  ✅ ${this.stats.selfRefsFixed}件の自己参照を internal に変更`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 2: 法令名の補完
   */
  async addMissingLawNames(): Promise<void> {
    console.log(chalk.cyan('\n📌 Step 2: 法令名の補完'));
    const session = this.driver.session();
    
    try {
      // 法令名がない法令を取得
      const result = await session.run(`
        MATCH (l:Law)
        WHERE l.source = 'egov' AND (l.lawTitle IS NULL OR l.lawTitle = '')
        RETURN l.lawId as lawId
        LIMIT 1000
      `);
      
      const lawsToUpdate = result.records.map(r => r.get('lawId'));
      console.log(`  ${lawsToUpdate.length}件の法令名を補完`);
      
      for (const lawId of lawsToUpdate) {
        const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
        
        if (!fs.existsSync(htmlPath)) {
          continue;
        }
        
        try {
          // HTMLから法令名を抽出
          const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
          let lawTitle = '';
          
          // titleタグから抽出
          const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/);
          if (titleMatch) {
            lawTitle = titleMatch[1].replace(' | e-Gov 法令検索', '').trim();
          }
          
          if (!lawTitle) {
            // h1タグから抽出を試みる
            const h1Match = htmlContent.match(/<h1[^>]*class="title[^>]*>([^<]+)/);
            if (h1Match) {
              lawTitle = h1Match[1].replace(/（.*）/, '').trim();
            }
          }
          
          if (lawTitle) {
            // 法令名を更新
            await session.executeWrite(async (tx: any) => {
              await tx.run(`
                MATCH (l:Law {lawId: $lawId})
                SET l.lawTitle = $lawTitle
              `, { lawId, lawTitle });
            });
            
            this.stats.lawNamesAdded++;
            
            if (this.stats.lawNamesAdded % 100 === 0) {
              console.log(`    ${this.stats.lawNamesAdded}件処理済み`);
            }
          }
          
        } catch (error) {
          console.error(chalk.red(`    エラー: ${lawId}`));
        }
      }
      
      console.log(chalk.green(`  ✅ ${this.stats.lawNamesAdded}件の法令名を追加`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 3: 重複参照の削除
   */
  async removeDuplicateReferences(): Promise<void> {
    console.log(chalk.cyan('\n📌 Step 3: 重複参照の削除'));
    const session = this.driver.session();
    
    try {
      // 重複を検出して削除
      const result = await session.executeWrite(async (tx: any) => {
        // まず重複を特定
        const dupResult = await tx.run(`
          MATCH (source)-[r:REFERENCES]->(target)
          WITH source, target, r.text as text, r.type as type, COLLECT(r) as refs
          WHERE SIZE(refs) > 1
          RETURN source.lawId as sourceLaw, target.lawId as targetLaw, 
                 text, type, SIZE(refs) as count
          LIMIT 100
        `);
        
        let totalRemoved = 0;
        
        for (const record of dupResult.records) {
          const sourceLaw = record.get('sourceLaw');
          const targetLaw = record.get('targetLaw');
          const text = record.get('text');
          const type = record.get('type');
          const count = record.get('count').toNumber();
          
          // 重複のうち1つを残して削除
          if (sourceLaw && targetLaw) {
            const deleteResult = await tx.run(`
              MATCH (source {lawId: $sourceLaw})-[r:REFERENCES {text: $text, type: $type}]->(target {lawId: $targetLaw})
              WITH r SKIP 1
              DELETE r
              RETURN COUNT(*) as deleted
            `, { sourceLaw, targetLaw, text, type });
            
            const deleted = deleteResult.records[0]?.get('deleted')?.toNumber() || 0;
            totalRemoved += deleted;
          }
        }
        
        return totalRemoved;
      });
      
      this.stats.duplicatesRemoved = result;
      console.log(chalk.green(`  ✅ ${this.stats.duplicatesRemoved}件の重複参照を削除`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 4: 空のテキスト参照を削除
   */
  async removeEmptyReferences(): Promise<void> {
    console.log(chalk.cyan('\n📌 Step 4: 空のテキスト参照を削除'));
    const session = this.driver.session();
    
    try {
      const result = await session.executeWrite(async (tx: any) => {
        const deleteResult = await tx.run(`
          MATCH ()-[r:REFERENCES]->()
          WHERE r.text IS NULL OR r.text = ''
          DELETE r
          RETURN COUNT(*) as deleted
        `);
        
        return deleteResult.records[0].get('deleted').toNumber();
      });
      
      this.stats.emptyRefsRemoved = result;
      console.log(chalk.green(`  ✅ ${this.stats.emptyRefsRemoved}件の空参照を削除`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Step 5: 不要なノードを削除
   */
  async removeUnnecessaryNodes(): Promise<void> {
    console.log(chalk.cyan('\n📌 Step 5: 不要なノードを削除'));
    const session = this.driver.session();
    
    try {
      // Paragraphノードを削除
      const result = await session.executeWrite(async (tx: any) => {
        const deleteResult = await tx.run(`
          MATCH (p:Paragraph)
          DETACH DELETE p
          RETURN COUNT(*) as deleted
        `);
        
        return deleteResult.records[0].get('deleted').toNumber();
      });
      
      console.log(chalk.green(`  ✅ ${result}件の不要なParagraphノードを削除`));
      
    } finally {
      await session.close();
    }
  }

  /**
   * 修正後の統計を表示
   */
  async showFinalStats(): Promise<void> {
    console.log(chalk.cyan('\n📊 修正後の統計'));
    const session = this.driver.session();
    
    try {
      // 全体統計
      const statsResult = await session.run(`
        MATCH (l:Law)
        WHERE l.source = 'egov'
        OPTIONAL MATCH ()-[r:REFERENCES]->()
        WITH 
          COUNT(DISTINCT l) as lawCount,
          COUNT(DISTINCT CASE WHEN l.lawTitle IS NOT NULL THEN l END) as lawsWithTitle,
          COUNT(r) as totalRefs
        RETURN lawCount, lawsWithTitle, totalRefs
      `);
      
      const lawCount = statsResult.records[0].get('lawCount').toNumber();
      const lawsWithTitle = statsResult.records[0].get('lawsWithTitle').toNumber();
      const totalRefs = statsResult.records[0].get('totalRefs').toNumber();
      
      // 参照タイプ別
      const typeResult = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN r.type as type, COUNT(r) as count
        ORDER BY count DESC
      `);
      
      console.log(chalk.gray('=' .repeat(50)));
      console.log(`  法令数: ${lawCount}件`);
      console.log(`  法令名あり: ${lawsWithTitle}件 (${Math.round(lawsWithTitle/lawCount*100)}%)`);
      console.log(`  総参照数: ${totalRefs}件`);
      
      console.log('\n  参照タイプ別:');
      typeResult.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        console.log(`    ${type}: ${count}件`);
      });
      
      // 自己参照の確認
      const selfRefResult = await session.run(`
        MATCH (source)-[r:REFERENCES]->(target:Law)
        WHERE source.lawId = target.lawId
        RETURN r.type as type, COUNT(r) as count
      `);
      
      console.log('\n  自己参照:');
      let totalSelfRefs = 0;
      selfRefResult.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        totalSelfRefs += count;
        console.log(`    ${type}: ${count}件`);
      });
      console.log(`    合計: ${totalSelfRefs}件`);
      
      console.log(chalk.gray('=' .repeat(50)));
      
    } finally {
      await session.close();
    }
  }

  /**
   * 全修正を実行
   */
  async fixAll(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 Neo4j参照データ修正開始'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const startTime = Date.now();
    
    // Step 1: 自己参照の修正
    await this.fixSelfReferences();
    
    // Step 2: 法令名の補完
    await this.addMissingLawNames();
    
    // Step 3: 重複参照の削除
    await this.removeDuplicateReferences();
    
    // Step 4: 空参照の削除
    await this.removeEmptyReferences();
    
    // Step 5: 不要ノードの削除
    await this.removeUnnecessaryNodes();
    
    // 最終統計
    await this.showFinalStats();
    
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    
    console.log(chalk.cyan('\n=' .repeat(60)));
    console.log(chalk.green('✅ 修正完了'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.blue(`  自己参照修正: ${this.stats.selfRefsFixed}件`));
    console.log(chalk.blue(`  法令名追加: ${this.stats.lawNamesAdded}件`));
    console.log(chalk.blue(`  重複削除: ${this.stats.duplicatesRemoved}件`));
    console.log(chalk.blue(`  空参照削除: ${this.stats.emptyRefsRemoved}件`));
    console.log(chalk.blue(`  所要時間: ${elapsed.toFixed(1)}分`));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 実行
if (require.main === module) {
  const fixer = new Neo4jReferenceFixer();
  
  (async () => {
    try {
      await fixer.fixAll();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await fixer.close();
    }
  })();
}

export default Neo4jReferenceFixer;