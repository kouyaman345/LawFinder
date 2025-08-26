#!/usr/bin/env npx tsx

/**
 * 第3段階: 重い法令の個別処理
 * 
 * スキップされた法令を超安全設定で処理
 * メモリ管理とエラーハンドリングを強化
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

class HeavyLawProcessor {
  private htmlDir: string;
  private driver: any;
  private processedCount = 0;
  private errorCount = 0;
  private stats = {
    totalReferences: 0,
    startTime: Date.now()
  };
  
  constructor() {
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
    this.driver = initNeo4jDriver();
  }

  /**
   * HTMLから参照を抽出（メモリ効率的）
   */
  private extractReferences(lawId: string, htmlPath: string): Reference[] {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const references: Reference[] = [];
    const seenRefs = new Set<string>();
    
    // すべてのリンクを処理
    const links = document.querySelectorAll('a[href]');
    
    links.forEach((link: Element) => {
      const href = link.getAttribute('href') || '';
      
      // e-Gov法令URLパターンのマッチング（新形式対応）
      // 形式1: /law/法令ID
      // 形式2: /document?lawid=法令ID
      let targetLawId: string | null = null;
      
      const newFormatMatch = href.match(/^\/law\/([A-Z0-9]+)/i);
      if (newFormatMatch) {
        targetLawId = newFormatMatch[1];
      } else {
        const oldFormatMatch = href.match(/\/document\?lawid=([A-Z0-9]+)/i);
        if (oldFormatMatch) {
          targetLawId = oldFormatMatch[1];
        }
      }
      
      if (!targetLawId) return;
      
      const linkText = link.textContent?.trim() || '';
      
      // 参照タイプの判定
      const isInternal = targetLawId === lawId;
      
      // 重複チェック用のキー
      const refKey = `${targetLawId}:${linkText}`;
      if (seenRefs.has(refKey)) return;
      seenRefs.add(refKey);
      
      references.push({
        sourceLawId: lawId,
        targetLawId: isInternal ? lawId : targetLawId,
        referenceText: linkText.substring(0, 200),
        referenceType: isInternal ? 'internal' : 'external',
        confidence: 1.0
      });
    });
    
    // メモリ解放
    dom.window.close();
    
    return references;
  }

  /**
   * 単一法令をNeo4jに投入（チャンク処理）
   */
  private async processSingleLaw(lawId: string, htmlPath: string): Promise<boolean> {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      const session = this.driver.session();
      
      try {
        console.log(chalk.blue(`\n処理開始: ${lawId}`));
        
        // 参照を抽出
        const references = this.extractReferences(lawId, htmlPath);
        console.log(chalk.gray(`  参照数: ${references.length}件`));
        
        // 法令ノードを作成
        await session.executeWrite(async (tx: any) => {
          await tx.run(`
            MERGE (l:Law {lawId: $lawId})
            ON CREATE SET 
              l.source = 'egov',
              l.processed = true,
              l.created = datetime()
            ON MATCH SET
              l.processed = true,
              l.updated = datetime()
          `, { lawId });
        });
        
        // 参照を100件ずつのチャンクで処理
        const chunkSize = 100;
        for (let i = 0; i < references.length; i += chunkSize) {
          const chunk = references.slice(i, Math.min(i + chunkSize, references.length));
          
          await session.executeWrite(async (tx: any) => {
            for (const ref of chunk) {
              if (ref.targetLawId) {
                // ターゲット法令ノードを作成
                await tx.run(`
                  MERGE (l:Law {lawId: $lawId})
                  ON CREATE SET 
                    l.source = 'egov',
                    l.created = datetime()
                `, { lawId: ref.targetLawId });
                
                // 参照関係を作成
                await tx.run(`
                  MATCH (s:Law {lawId: $sourceLawId})
                  MATCH (t:Law {lawId: $targetLawId})
                  MERGE (s)-[r:REFERENCES {
                    text: $text,
                    type: $type
                  }]->(t)
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
          
          // 進捗表示
          if ((i + chunkSize) % 500 === 0) {
            console.log(chalk.gray(`    ${Math.min(i + chunkSize, references.length)}/${references.length}件処理済み`));
          }
        }
        
        this.stats.totalReferences += references.length;
        console.log(chalk.green(`✅ ${lawId}: ${references.length}件の参照を投入完了`));
        
        return true;
        
      } catch (error: any) {
        retries++;
        console.error(chalk.red(`❌ ${lawId}: エラー (リトライ ${retries}/${maxRetries})`));
        console.error(chalk.gray(`   ${error.message}`));
        
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } finally {
        await session.close();
      }
    }
    
    return false;
  }

  /**
   * スキップされた法令を処理
   */
  async processSkippedLaws(): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📊 第3段階: 重い法令の個別処理'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    // スキップリストを読み込み
    const skippedFile = path.join(process.cwd(), 'skipped_laws.txt');
    if (!fs.existsSync(skippedFile)) {
      console.error(chalk.red('スキップリストが見つかりません'));
      return;
    }
    
    const skippedLaws = fs.readFileSync(skippedFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    
    console.log(chalk.blue(`\n処理対象: ${skippedLaws.length}法令`));
    console.log(chalk.yellow('設定:'));
    console.log('  - 並列度: 1（シングルプロセス）');
    console.log('  - チャンクサイズ: 100参照/トランザクション');
    console.log('  - リトライ: 3回まで');
    console.log('  - 待機時間: 法令間1秒\n');
    
    // 法令を1つずつ処理
    for (let i = 0; i < skippedLaws.length; i++) {
      const lawId = skippedLaws[i];
      const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
      
      if (!fs.existsSync(htmlPath)) {
        console.log(chalk.yellow(`⚠️ HTMLファイルが存在しません: ${lawId}`));
        continue;
      }
      
      // 進捗表示
      const progress = Math.round((i + 1) / skippedLaws.length * 100);
      console.log(chalk.cyan(`\n[${i + 1}/${skippedLaws.length}] (${progress}%)`));
      
      // 法令を処理
      const success = await this.processSingleLaw(lawId, htmlPath);
      
      if (success) {
        this.processedCount++;
      } else {
        this.errorCount++;
      }
      
      // 次の法令処理前に短い待機
      if (i < skippedLaws.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 10法令ごとに統計表示
      if ((i + 1) % 10 === 0) {
        const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
        const rate = (i + 1) / elapsed;
        const remaining = (skippedLaws.length - i - 1) / rate;
        
        console.log(chalk.gray('\n' + '-'.repeat(40)));
        console.log(chalk.gray(`処理済み: ${this.processedCount}件`));
        console.log(chalk.gray(`エラー: ${this.errorCount}件`));
        console.log(chalk.gray(`総参照数: ${this.stats.totalReferences}件`));
        console.log(chalk.gray(`処理速度: ${rate.toFixed(1)}法令/分`));
        console.log(chalk.gray(`推定残り時間: ${Math.round(remaining)}分`));
        console.log(chalk.gray('-'.repeat(40) + '\n'));
      }
      
      // メモリ使用量チェック
      if ((i + 1) % 5 === 0) {
        const used = process.memoryUsage();
        const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
        if (heapUsedMB > 4000) {
          console.log(chalk.yellow(`⚠️ メモリ使用量: ${heapUsedMB}MB - ガベージコレクション実行`));
          if (global.gc) {
            global.gc();
          }
        }
      }
    }
    
    // 最終統計
    const totalTime = (Date.now() - this.stats.startTime) / 1000 / 60;
    
    console.log(chalk.cyan('\n' + '=' .repeat(60)));
    console.log(chalk.cyan('📊 第3段階完了'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.green(`✅ 処理成功: ${this.processedCount}件`));
    console.log(chalk.red(`❌ エラー: ${this.errorCount}件`));
    console.log(chalk.blue(`📍 総参照数: ${this.stats.totalReferences}件`));
    console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
    console.log(chalk.blue(`📈 平均速度: ${(this.processedCount / totalTime).toFixed(1)}法令/分`));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 実行
if (require.main === module) {
  const processor = new HeavyLawProcessor();
  
  (async () => {
    try {
      await processor.processSkippedLaws();
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await processor.close();
    }
  })();
}

export default HeavyLawProcessor;