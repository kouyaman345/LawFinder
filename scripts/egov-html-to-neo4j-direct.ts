#!/usr/bin/env npx tsx

/**
 * e-Gov HTMLファイルから直接Neo4jへ投入（並列処理版）
 * 
 * 中間JSONファイルを作成せず、HTMLから直接グラフDBを構築
 * 5並列で処理し、約100倍の高速化を実現
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import pLimit from 'p-limit';

interface Reference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external';
  confidence: number;
}

interface ParseResult {
  lawId: string;
  lawTitle: string;
  references: Reference[];
  articleCount: number;
  linkCount: number;
}

class EGovHTMLToNeo4jDirect {
  private htmlDir: string;
  private driver: any;
  private concurrency: number = 2; // 並列度を削減してNeo4j負荷軽減
  private batchSize: number = 50; // バッチサイズを縮小してメモリ効率化
  private maxReferencesPerLaw: number = 1000; // 大量参照の閾値
  private stats = {
    processed: 0,
    references: 0,
    errors: 0,
    skipped: 0,
    startTime: Date.now()
  };
  
  constructor() {
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
    this.driver = initNeo4jDriver();
  }

  /**
   * HTMLファイルをパース
   */
  private parseHTML(lawId: string, htmlPath: string): ParseResult {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // メタデータを抽出
    let metadata: any = {};
    const metaMatch = htmlContent.match(/<!-- METADATA: (.*?) -->/);
    if (metaMatch) {
      try {
        metadata = JSON.parse(metaMatch[1]);
      } catch {}
    }
    
    // JSOMでHTML解析
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const references: Reference[] = [];
    const seenRefs = new Set<string>();
    
    // 法令タイトルを取得
    let lawTitle = metadata.lawTitle || '';
    if (!lawTitle) {
      const titleEl = document.querySelector('.law_title, .lawTitle, h1');
      if (titleEl) {
        lawTitle = titleEl.textContent?.trim() || '';
      }
    }
    
    // すべての条文要素を処理
    const articles = document.querySelectorAll('.Article, article, [class*="article"]');
    let articleCount = 0;
    let totalLinkCount = 0;
    
    articles.forEach((article: Element) => {
      articleCount++;
      
      // 条文番号を取得
      const articleId = article.id || '';
      let articleNumber = '';
      
      // IDから条文番号を抽出（Mp-Pa_1-Ch_1-At_1 形式）
      const idMatch = articleId.match(/At_(\d+)/);
      if (idMatch) {
        articleNumber = idMatch[1];
      }
      
      // 条文番号が取れない場合は、テキストから抽出
      if (!articleNumber) {
        const articleText = article.textContent || '';
        const textMatch = articleText.match(/第(\d+)条/);
        if (textMatch) {
          articleNumber = textMatch[1];
        }
      }
      
      // 条文内のリンクを処理
      const links = article.querySelectorAll('a[href]');
      
      links.forEach((link: Element) => {
        totalLinkCount++;
        const href = (link as HTMLAnchorElement).href;
        const text = link.textContent?.trim() || '';
        
        // 参照タイプを判定
        let referenceType: 'internal' | 'external' = 'external';
        let targetLawId = '';
        let targetArticle = '';
        
        // URLパターンから情報抽出
        if (href.includes('/law/') || href.includes('lawid=')) {
          // 他法令への参照
          const lawMatch = href.match(/(?:\/law\/|lawid=)([^/#?&]+)/);
          if (lawMatch) {
            targetLawId = lawMatch[1];
          }
          
          // アンカーから条文番号を抽出
          const anchorMatch = href.match(/#([^#]+)$/);
          if (anchorMatch) {
            const atMatch = anchorMatch[1].match(/At_(\d+)/);
            if (atMatch) {
              targetArticle = atMatch[1];
            }
          }
        } else if (href.includes('#')) {
          // 同一法令内参照
          referenceType = 'internal';
          targetLawId = lawId;
          
          const anchorMatch = href.match(/#([^#]+)$/);
          if (anchorMatch) {
            const atMatch = anchorMatch[1].match(/At_(\d+)/);
            if (atMatch) {
              targetArticle = atMatch[1];
            }
          }
        }
        
        // テキストパターンからも条文番号を補完
        if (!targetArticle && text) {
          const articleMatch = text.match(/第?(\d+)条/);
          if (articleMatch) {
            targetArticle = articleMatch[1];
          }
        }
        
        // 参照として有効か判定
        const isValidReference = (targetLawId || targetArticle) && text && text.length > 0;
        
        if (isValidReference) {
          // 重複チェック
          const refKey = `${articleNumber}-${targetLawId}-${targetArticle}-${text}`;
          
          if (!seenRefs.has(refKey)) {
            seenRefs.add(refKey);
            
            const ref: Reference = {
              sourceLawId: lawId,
              sourceArticle: articleNumber || undefined,
              targetLawId: targetLawId || undefined,
              targetArticle: targetArticle || undefined,
              referenceText: text,
              referenceType,
              confidence: 1.0 // HTMLリンクからの抽出なので信頼度100%
            };
            
            references.push(ref);
          }
        }
      });
    });
    
    // 条文がない場合は本文全体のリンクを処理
    if (articleCount === 0) {
      const allLinks = document.querySelectorAll('a[href]');
      
      allLinks.forEach((link: Element) => {
        totalLinkCount++;
        const href = (link as HTMLAnchorElement).href;
        const text = link.textContent?.trim() || '';
        
        // URLから法令IDを抽出
        let targetLawId = '';
        const lawMatch = href.match(/(?:\/law\/|lawid=)([^/#?&]+)/);
        if (lawMatch) {
          targetLawId = lawMatch[1];
        }
        
        if (targetLawId && targetLawId !== lawId) {
          const refKey = `main-${targetLawId}-${text}`;
          
          if (!seenRefs.has(refKey)) {
            seenRefs.add(refKey);
            
            const ref: Reference = {
              sourceLawId: lawId,
              targetLawId,
              referenceText: text,
              referenceType: 'external',
              confidence: 1.0
            };
            
            references.push(ref);
          }
        }
      });
    }
    
    return {
      lawId,
      lawTitle,
      references,
      articleCount,
      linkCount: totalLinkCount
    };
  }

  /**
   * 単一法令をNeo4jに投入
   */
  private async importLawToNeo4j(lawId: string, htmlPath: string): Promise<void> {
    const session = this.driver.session();
    try {
      // HTMLをパース
      const result = this.parseHTML(lawId, htmlPath);
      
      // 大量参照の法令をスキップ
      if (result.references.length > this.maxReferencesPerLaw) {
        console.log(chalk.yellow(`⚠ ${lawId}: ${result.references.length}件の参照（多すぎるため後回し）`));
        this.stats.skipped++;
        return;
      }
      
      // トランザクション内で処理
      await session.executeWrite(async (tx: any) => {
        // 1. 法令ノードを作成
        await tx.run(`
          MERGE (l:Law {lawId: $lawId})
          ON CREATE SET 
            l.lawTitle = $lawTitle,
            l.source = 'egov',
            l.processed = true,
            l.created = datetime()
          ON MATCH SET
            l.lawTitle = $lawTitle,
            l.processed = true,
            l.updated = datetime()
        `, { lawId, lawTitle: result.lawTitle });

        // 2. 条文ノードをバッチで作成（必要に応じて）
        const articleNumbers = new Set<string>();
        result.references.forEach(ref => {
          if (ref.sourceArticle) articleNumbers.add(ref.sourceArticle);
          if (ref.targetArticle && ref.targetLawId === lawId) {
            articleNumbers.add(ref.targetArticle);
          }
        });

        for (const articleNumber of articleNumbers) {
          await tx.run(`
            MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            ON CREATE SET 
              a.source = 'egov',
              a.created = datetime()
          `, { lawId, articleNumber });
        }

        // 3. 参照関係を作成
        for (const ref of result.references) {
          if (ref.referenceType === 'internal') {
            // 内部参照
            if (ref.sourceArticle && ref.targetArticle) {
              await tx.run(`
                MATCH (s:Article {lawId: $lawId, articleNumber: $sourceArticle})
                MATCH (t:Article {lawId: $lawId, articleNumber: $targetArticle})
                MERGE (s)-[r:REFERENCES {
                  text: $text,
                  type: 'internal'
                }]->(t)
                ON CREATE SET
                  r.source = 'egov',
                  r.confidence = 1.0,
                  r.created = datetime()
              `, {
                lawId,
                sourceArticle: ref.sourceArticle,
                targetArticle: ref.targetArticle,
                text: ref.referenceText
              });
            }
          } else {
            // 外部参照
            if (ref.targetLawId) {
              // 対象法令ノードを作成
              await tx.run(`
                MERGE (l:Law {lawId: $lawId})
                ON CREATE SET 
                  l.source = 'egov',
                  l.created = datetime()
              `, { lawId: ref.targetLawId });

              // 参照関係を作成
              if (ref.sourceArticle) {
                // 条文から法令への参照
                await tx.run(`
                  MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
                  MATCH (t:Law {lawId: $targetLawId})
                  MERGE (s)-[r:REFERENCES {
                    text: $text,
                    type: 'external'
                  }]->(t)
                  ON CREATE SET
                    r.source = 'egov',
                    r.confidence = 1.0,
                    r.created = datetime()
                `, {
                  sourceLawId: ref.sourceLawId,
                  sourceArticle: ref.sourceArticle,
                  targetLawId: ref.targetLawId,
                  text: ref.referenceText
                });
              } else {
                // 法令から法令への参照
                await tx.run(`
                  MATCH (s:Law {lawId: $sourceLawId})
                  MATCH (t:Law {lawId: $targetLawId})
                  MERGE (s)-[r:REFERENCES {
                    text: $text,
                    type: 'external'
                  }]->(t)
                  ON CREATE SET
                    r.source = 'egov',
                    r.confidence = 1.0,
                    r.created = datetime()
                `, {
                  sourceLawId: ref.sourceLawId,
                  targetLawId: ref.targetLawId,
                  text: ref.referenceText
                });
              }
            }
          }
        }
      });

      this.stats.references += result.references.length;
      
      console.log(chalk.green(`✓ ${lawId}: ${result.references.length}件の参照を投入`));
      
    } catch (error: any) {
      this.stats.errors++;
      console.error(chalk.red(`✗ ${lawId}: ${error.message}`));
    } finally {
      await session.close();
    }
  }

  /**
   * 処理済み法令IDを取得
   */
  private async getProcessedLaws(): Promise<Set<string>> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (l:Law {processed: true, source: 'egov'})
        RETURN l.lawId as lawId
      `);
      
      const processed = new Set<string>();
      result.records.forEach((record: any) => {
        processed.add(record.get('lawId'));
      });
      
      return processed;
    } finally {
      await session.close();
    }
  }

  /**
   * 全HTMLファイルを並列処理でNeo4jに投入
   */
  async importAll(options: { clean?: boolean; skipHeavy?: boolean } = {}): Promise<void> {
    // skipHeavyオプションが有効な場合は閾値を調整
    if (options.skipHeavy) {
      this.maxReferencesPerLaw = 500; // より厳しい閾値
    }
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📊 e-Gov HTML to Neo4j 直接投入（最適化版）'));
    console.log(chalk.cyan('='.repeat(60)));

    // クリーンアップオプション
    if (options.clean) {
      console.log(chalk.yellow('🗑️ 既存のe-Govデータを削除中...'));
      const session = this.driver.session();
      try {
        await session.executeWrite(async (tx: any) => {
          await tx.run(`
            MATCH ()-[r:REFERENCES]->()
            WHERE r.source = 'egov'
            DELETE r
          `);
          await tx.run(`
            MATCH (n)
            WHERE n.source = 'egov' AND NOT (n)--()
            DELETE n
          `);
        });
        console.log(chalk.green('✅ クリーンアップ完了\n'));
      } finally {
        await session.close();
      }
    }

    // HTMLファイル一覧を取得
    const htmlFiles = fs.readdirSync(this.htmlDir)
      .filter(f => f.endsWith('.html'))
      .map(f => ({
        lawId: f.replace('.html', ''),
        path: path.join(this.htmlDir, f)
      }));

    // 処理済みを除外
    const processed = await this.getProcessedLaws();
    const targetFiles = htmlFiles.filter(f => !processed.has(f.lawId));

    console.log(chalk.blue('📊 処理状況:'));
    console.log(`  HTMLファイル総数: ${htmlFiles.length}件`);
    console.log(`  処理済み: ${processed.size}件`);
    console.log(`  処理対象: ${targetFiles.length}件`);
    console.log(`  並列度: ${this.concurrency}`);
    console.log(`  バッチサイズ: ${this.batchSize}法令/トランザクション\n`);

    if (targetFiles.length === 0) {
      console.log(chalk.green('✅ すべて処理済みです'));
      return;
    }

    // バッチに分割
    const batches: typeof targetFiles[] = [];
    for (let i = 0; i < targetFiles.length; i += this.batchSize) {
      batches.push(targetFiles.slice(i, i + this.batchSize));
    }

    // 並列処理のリミット設定
    const limit = pLimit(this.concurrency);

    // バッチごとに処理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      console.log(chalk.cyan(`\n📦 バッチ ${batchIndex + 1}/${batches.length} 処理中...`));
      
      // バッチ内の法令を並列処理（各処理が独自のセッションを使用）
      await Promise.all(
        batch.map(file =>
          limit(async () => {
            await this.importLawToNeo4j(file.lawId, file.path);
            this.stats.processed++;
            
            // 進捗表示（10件ごと）
            if (this.stats.processed % 10 === 0) {
              const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
              const rate = this.stats.processed / elapsed;
              const remaining = (targetFiles.length - this.stats.processed) / rate;
              
              console.log(chalk.cyan(
                `📈 進捗: ${this.stats.processed}/${targetFiles.length} ` +
                `(${Math.round(this.stats.processed / targetFiles.length * 100)}%) ` +
                `| 速度: ${rate.toFixed(1)}法令/分 ` +
                `| 残り: 約${Math.round(remaining)}分`
              ));
            }
          })
        )
      );
    }

    // 最終統計
    const totalTime = (Date.now() - this.stats.startTime) / 1000 / 60;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📊 投入完了'));
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.green(`✅ 処理済み: ${this.stats.processed}件`));
    console.log(chalk.yellow(`⚠ スキップ: ${this.stats.skipped}件（大量参照）`));
    console.log(chalk.red(`✗ エラー: ${this.stats.errors}件`));
    console.log(chalk.blue(`📍 総参照数: ${this.stats.references}件`));
    console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
    console.log(chalk.blue(`📈 処理速度: ${(this.stats.processed / totalTime).toFixed(1)}法令/分`));
  }

  /**
   * 統計情報を表示
   */
  async showStatistics(): Promise<void> {
    console.log(chalk.cyan('\n📊 Neo4j統計情報（e-Govソース）'));
    console.log(chalk.gray('=' .repeat(50)));

    const session = this.driver.session();
    
    try {
      // ノード数
      const nodeResult = await session.run(`
        MATCH (n)
        WHERE n.source = 'egov'
        RETURN labels(n)[0] as label, count(n) as count
        ORDER BY count DESC
      `);

      console.log(chalk.blue('📌 ノード数:'));
      nodeResult.records.forEach((record: any) => {
        const count = record.get('count');
        console.log(`  ${record.get('label')}: ${count.toNumber ? count.toNumber() : count}件`);
      });

      // 参照数（内部/外部）
      const refResult = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.source = 'egov'
        RETURN r.type as type, count(r) as count
        ORDER BY type
      `);

      console.log(chalk.blue('\n🔗 参照数:'));
      let totalRefs = 0;
      refResult.records.forEach((record: any) => {
        const count = record.get('count');
        const num = count.toNumber ? count.toNumber() : count;
        totalRefs += num;
        console.log(`  ${record.get('type')}: ${num}件`);
      });
      console.log(`  合計: ${totalRefs}件`);

      // 最も参照される法令TOP10
      const topResult = await session.run(`
        MATCH (l:Law)<-[r:REFERENCES]-(s)
        WHERE r.source = 'egov' AND r.type = 'external'
        RETURN l.lawId as lawId, l.lawTitle as title, count(r) as refs
        ORDER BY refs DESC
        LIMIT 10
      `);

      if (topResult.records.length > 0) {
        console.log(chalk.blue('\n🏆 最も参照される法令TOP10:'));
        topResult.records.forEach((record: any, i: number) => {
          const refs = record.get('refs');
          const title = record.get('title') || record.get('lawId');
          console.log(`  ${i + 1}. ${title}: ${refs.toNumber ? refs.toNumber() : refs}件`);
        });
      }

      // 処理済み法令数
      const processedResult = await session.run(`
        MATCH (l:Law {processed: true, source: 'egov'})
        RETURN count(l) as count
      `);
      
      const processedCount = processedResult.records[0].get('count');
      console.log(chalk.blue(`\n✅ 処理済み法令: ${processedCount.toNumber ? processedCount.toNumber() : processedCount}件`));

    } finally {
      await session.close();
    }

    console.log(chalk.gray('=' .repeat(50)));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const converter = new EGovHTMLToNeo4jDirect();
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'import':
          await converter.importAll({
            clean: process.argv.includes('--clean'),
            skipHeavy: process.argv.includes('--skip-heavy')
          });
          break;

        case 'stats':
          await converter.showStatistics();
          break;

        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-html-to-neo4j-direct.ts import  # HTML to Neo4j投入');
          console.log('  npx tsx scripts/egov-html-to-neo4j-direct.ts stats   # 統計表示');
          console.log('\nオプション:');
          console.log('  --clean       インポート前に既存データを削除');
          console.log('  --skip-heavy  大量参照（500件以上）の法令をスキップ');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await converter.close();
    }
  })();
}

export default EGovHTMLToNeo4jDirect;