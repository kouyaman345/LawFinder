#!/usr/bin/env npx tsx

/**
 * 参照が欠落している法令の再処理
 * アンカーリンクを含む完全な内部参照を検出
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface Reference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external';
  confidence: number;
}

class MissingReferencesProcessor {
  private htmlDir: string;
  private driver: any;
  private stats = {
    lawsProcessed: 0,
    internalRefsAdded: 0,
    externalRefsAdded: 0,
    errors: 0
  };
  
  constructor() {
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
    this.driver = initNeo4jDriver();
  }

  /**
   * 改良版HTMLパーサー：アンカーリンクも検出
   */
  private parseHTMLComplete(lawId: string, htmlPath: string): Reference[] {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const references: Reference[] = [];
    const seenRefs = new Map<string, number>();
    
    // すべてのリンクを処理
    const links = document.querySelectorAll('a[href]');
    
    links.forEach((link: Element) => {
      const href = link.getAttribute('href') || '';
      const linkText = link.textContent?.trim() || '';
      
      // スキップ条件
      if (!href || href.startsWith('/css/') || href.startsWith('/assets/') || 
          href.startsWith('/images/') || href.startsWith('/help/') ||
          href === '/' || href.startsWith('http')) {
        return;
      }
      
      let targetLawId: string | null = null;
      let targetArticle: string | null = null;
      let isInternal = false;
      
      // パターン1: アンカーリンク（内部参照）
      if (href.startsWith('#')) {
        isInternal = true;
        targetLawId = lawId;
        
        // アンカーから条文番号を抽出
        const anchorMatch = href.match(/#Mp-Pa_\d+-Ch_\d+-At_(\d+)/);
        if (anchorMatch) {
          targetArticle = anchorMatch[1];
        }
      }
      // パターン2: 法令リンク
      else if (href.startsWith('/law/')) {
        const lawMatch = href.match(/^\/law\/([A-Z0-9]+)/i);
        if (lawMatch) {
          targetLawId = lawMatch[1];
          isInternal = (targetLawId === lawId);
          
          // アンカー部分があれば条文番号を抽出
          const anchorPart = href.split('#')[1];
          if (anchorPart) {
            const anchorMatch = anchorPart.match(/Mp-Pa_\d+-Ch_\d+-At_(\d+)/);
            if (anchorMatch) {
              targetArticle = anchorMatch[1];
            }
          }
        }
      }
      
      if (!targetLawId) return;
      
      // 重複カウント（同じ参照テキストは集約）
      const refKey = `${targetLawId}:${targetArticle || 'law'}:${linkText}`;
      const count = seenRefs.get(refKey) || 0;
      
      if (count < 3) { // 同じ参照は最大3つまで
        seenRefs.set(refKey, count + 1);
        
        references.push({
          sourceLawId: lawId,
          sourceArticle: undefined, // 今回は法令レベルで処理
          targetLawId: targetLawId,
          targetArticle: targetArticle || undefined,
          referenceText: linkText.substring(0, 200),
          referenceType: isInternal ? 'internal' : 'external',
          confidence: 1.0
        });
      }
    });
    
    // メモリ解放
    dom.window.close();
    
    return references;
  }

  /**
   * 法令の参照を再処理してNeo4jに投入
   */
  private async reprocessLaw(lawId: string): Promise<boolean> {
    const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
    
    if (!fs.existsSync(htmlPath)) {
      console.log(chalk.yellow(`  HTMLファイルなし: ${lawId}`));
      return false;
    }
    
    const session = this.driver.session();
    
    try {
      // 既存の発信参照を削除（この法令から出る参照のみ）
      await session.executeWrite(async (tx: any) => {
        await tx.run(`
          MATCH (source:Law {lawId: $lawId})-[r:REFERENCES]->()
          DELETE r
        `, { lawId });
      });
      
      // 参照を抽出
      const references = this.parseHTMLComplete(lawId, htmlPath);
      
      const internalRefs = references.filter(r => r.referenceType === 'internal');
      const externalRefs = references.filter(r => r.referenceType === 'external');
      
      console.log(`  ${lawId}: 内部${internalRefs.length}件、外部${externalRefs.length}件`);
      
      // バッチで投入
      const batchSize = 100;
      for (let i = 0; i < references.length; i += batchSize) {
        const batch = references.slice(i, i + batchSize);
        
        await session.executeWrite(async (tx: any) => {
          for (const ref of batch) {
            // ターゲットノードを確保
            if (ref.targetLawId) {
              await tx.run(`
                MERGE (l:Law {lawId: $lawId})
                ON CREATE SET 
                  l.source = 'egov',
                  l.created = datetime()
              `, { lawId: ref.targetLawId });
              
              // 参照を作成
              await tx.run(`
                MATCH (source:Law {lawId: $sourceLawId})
                MATCH (target:Law {lawId: $targetLawId})
                MERGE (source)-[r:REFERENCES {
                  text: $text,
                  type: $type
                }]->(target)
                ON CREATE SET
                  r.source = 'egov',
                  r.confidence = 1.0,
                  r.created = datetime()
              `, {
                sourceLawId: ref.sourceLawId,
                targetLawId: ref.targetLawId,
                text: ref.referenceText,
                type: ref.referenceType
              });
            }
          }
        });
      }
      
      this.stats.internalRefsAdded += internalRefs.length;
      this.stats.externalRefsAdded += externalRefs.length;
      this.stats.lawsProcessed++;
      
      return true;
      
    } catch (error) {
      console.error(chalk.red(`  エラー: ${lawId}`), error);
      this.stats.errors++;
      return false;
      
    } finally {
      await session.close();
    }
  }

  /**
   * 発信参照が欠落している法令を検出して再処理
   */
  async reprocessMissingReferences(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 欠落参照の再処理'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    const session = this.driver.session();
    
    try {
      // 発信参照が少ない or ゼロの法令を検出
      const result = await session.run(`
        MATCH (l:Law)
        WHERE l.source = 'egov'
        OPTIONAL MATCH (l)-[out:REFERENCES]->()
        WITH l.lawId as lawId, COUNT(out) as outgoingCount
        WHERE outgoingCount < 10
        RETURN lawId, outgoingCount
        ORDER BY outgoingCount ASC
        LIMIT 100
      `);
      
      const lawsToReprocess = result.records.map(r => ({
        lawId: r.get('lawId'),
        currentRefs: r.get('outgoingCount').toNumber()
      }));
      
      console.log(`\n${lawsToReprocess.length}件の法令を再処理します\n`);
      
      // 重要な法令を優先
      const priorityLaws = ['417AC0000000086', '411AC0000000103', '426AC0000000068'];
      
      // 優先法令を先に処理
      for (const lawId of priorityLaws) {
        if (lawsToReprocess.some(l => l.lawId === lawId)) {
          console.log(chalk.yellow(`\n優先処理: ${lawId}`));
          await this.reprocessLaw(lawId);
        }
      }
      
      // 残りを処理
      for (const law of lawsToReprocess) {
        if (!priorityLaws.includes(law.lawId)) {
          if (this.stats.lawsProcessed >= 50) break; // 最大50件まで
          await this.reprocessLaw(law.lawId);
        }
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 処理結果の統計を表示
   */
  async showResults(): Promise<void> {
    console.log(chalk.cyan('\n=' .repeat(60)));
    console.log(chalk.green('✅ 再処理完了'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    console.log(chalk.blue(`  処理法令数: ${this.stats.lawsProcessed}件`));
    console.log(chalk.blue(`  追加内部参照: ${this.stats.internalRefsAdded}件`));
    console.log(chalk.blue(`  追加外部参照: ${this.stats.externalRefsAdded}件`));
    console.log(chalk.blue(`  総追加参照: ${this.stats.internalRefsAdded + this.stats.externalRefsAdded}件`));
    if (this.stats.errors > 0) {
      console.log(chalk.red(`  エラー: ${this.stats.errors}件`));
    }
    
    // 更新後の統計
    const session = this.driver.session();
    try {
      const statsResult = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.source = 'egov'
        RETURN r.type as type, COUNT(r) as count
        ORDER BY count DESC
      `);
      
      console.log('\n📊 更新後の参照タイプ:');
      let total = 0;
      statsResult.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        total += count;
      });
      
      statsResult.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        const percent = Math.round(count/total*100);
        console.log(`  ${type}: ${count}件 (${percent}%)`);
      });
      
      // 重要法令の確認
      const importantLaws = ['417AC0000000086', '411AC0000000103', '129AC0000000089'];
      console.log('\n📌 重要法令の参照状況:');
      
      for (const lawId of importantLaws) {
        const result = await session.run(`
          MATCH (l:Law {lawId: $lawId})
          OPTIONAL MATCH (l)-[out:REFERENCES]->()
          OPTIONAL MATCH ()-[in:REFERENCES]->(l)
          WITH 
            COUNT(DISTINCT out) as outgoing,
            COUNT(DISTINCT CASE WHEN out.type = 'internal' THEN out END) as internalOut,
            COUNT(DISTINCT in) as incoming
          RETURN outgoing, internalOut, incoming
        `, { lawId });
        
        const rec = result.records[0];
        const outgoing = rec.get('outgoing').toNumber();
        const internal = rec.get('internalOut').toNumber();
        const incoming = rec.get('incoming').toNumber();
        
        const name = lawId === '417AC0000000086' ? '会社法' :
                     lawId === '411AC0000000103' ? '独立行政法人通則法' :
                     '民法';
        
        console.log(`  ${name}: 発信${outgoing}件（内部${internal}件）、受信${incoming}件`);
      }
      
    } finally {
      await session.close();
    }
  }

  async run(): Promise<void> {
    await this.reprocessMissingReferences();
    await this.showResults();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 実行
if (require.main === module) {
  const processor = new MissingReferencesProcessor();
  
  (async () => {
    try {
      await processor.run();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await processor.close();
    }
  })();
}

export default MissingReferencesProcessor;