#!/usr/bin/env npx tsx

/**
 * e-Gov法令検索スクレイピングツール v2
 * 
 * e-Gov法令検索の実際のDOM構造に基づいて再実装
 * デバッグツールの結果を反映した改良版
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external' | 'structural';
  confidence: number;
}

export class EGovScraperV2 {
  private browser: Browser | null = null;
  private cacheDir: string;
  
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'egov_cache_v2', 'references');
    
    // キャッシュディレクトリ作成
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private loadFromCache(lawId: string): EGovReference[] | null {
    const cachePath = path.join(this.cacheDir, `${lawId}.json`);
    
    if (fs.existsSync(cachePath)) {
      try {
        const data = fs.readFileSync(cachePath, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error(chalk.red(`キャッシュ読み込みエラー: ${lawId}`));
      }
    }
    
    return null;
  }

  private saveToCache(lawId: string, references: EGovReference[]): void {
    const cachePath = path.join(this.cacheDir, `${lawId}.json`);
    
    try {
      fs.writeFileSync(cachePath, JSON.stringify(references, null, 2));
    } catch (error) {
      console.error(chalk.red(`キャッシュ保存エラー: ${lawId}`));
    }
  }

  /**
   * e-Gov法令ページから参照データをスクレイピング（改良版）
   */
  async scrapeLawReferences(lawId: string, useCache: boolean = true): Promise<EGovReference[]> {
    // キャッシュチェック
    if (useCache) {
      const cached = this.loadFromCache(lawId);
      if (cached) {
        console.log(chalk.green(`✓ キャッシュ使用: ${lawId} (${cached.length}件)`));
        return cached;
      }
    }

    console.log(chalk.blue(`🔍 スクレイピング開始: ${lawId}`));
    const references: EGovReference[] = [];

    try {
      await this.initBrowser();
      const page = await this.browser!.newPage();
      
      // User-Agent設定
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      // e-Gov法令ページにアクセス（elaws.e-gov.go.jpを優先）
      const urls = [
        `https://elaws.e-gov.go.jp/document?lawid=${lawId}`,
        `https://laws.e-gov.go.jp/law/${lawId}`
      ];

      let loaded = false;
      for (const url of urls) {
        console.log(chalk.gray(`  試行: ${url}`));
        
        const response = await page.goto(url, { 
          waitUntil: 'networkidle',
          timeout: 30000
        });

        if (response && response.ok()) {
          loaded = true;
          break;
        }
      }

      if (!loaded) {
        console.log(chalk.yellow(`⚠️ ページ読み込み失敗: ${lawId}`));
        await page.close();
        return references;
      }

      // コンテンツの読み込みを待つ（タイムアウトを短縮）
      await page.waitForSelector('.Article, .tocitem', { timeout: 3000 }).catch(() => {});

      // 詳細な参照データを抽出
      const extractedData = await page.evaluate(() => {
        const results: Array<{
          text: string;
          href: string;
          articleNumber?: string;
          articleTitle?: string;
          isReference: boolean;
        }> = [];

        // すべての条文要素を取得
        const articles = document.querySelectorAll('.Article');
        
        articles.forEach(article => {
          // 条文番号と見出しを取得
          const articleId = article.id; // Mp-Pa_1-Ch_1-At_1 形式
          let articleNumber = '';
          let articleTitle = '';
          
          // IDから条文番号を抽出
          const match = articleId.match(/At_(\d+)/);
          if (match) {
            articleNumber = match[1];
          }
          
          // 条文見出しを取得
          const caption = article.querySelector('._div_ArticleCaption');
          if (caption) {
            articleTitle = caption.textContent?.trim() || '';
          }

          // 条文内のすべてのリンクを取得
          const links = article.querySelectorAll('a[href]');
          
          links.forEach(link => {
            const href = (link as HTMLAnchorElement).href;
            const text = (link as HTMLElement).textContent?.trim() || '';
            
            // 参照リンクかどうかを判定
            let isReference = false;
            
            // URLパターンで判定
            if (href.includes('/law/') && !href.includes('#')) {
              // 他法令への参照
              isReference = true;
            } else if (href.includes('#Mp-') || href.includes('#At_')) {
              // 同一法令内の条文参照
              isReference = true;
            }
            
            // テキストパターンでも判定
            if (!isReference && text) {
              const refPatterns = [
                /第\d+条/,
                /\d+条/,
                /前条/,
                /次条/,
                /同条/,
                /第\d+項/,
                /前項/,
                /次項/,
                /法第/,
                /令第/,
                /規則第/
              ];
              
              isReference = refPatterns.some(pattern => pattern.test(text));
            }
            
            if (isReference) {
              results.push({
                text,
                href,
                articleNumber,
                articleTitle,
                isReference
              });
            }
          });
        });

        return results;
      });

      console.log(chalk.gray(`  抽出: ${extractedData.length}件のリンク`));

      // 抽出したデータを参照形式に変換
      const seenRefs = new Set<string>();
      
      for (const data of extractedData) {
        // URLから対象法令IDを抽出
        let targetLawId = '';
        let targetArticle = '';
        let referenceType: 'internal' | 'external' = 'external';
        
        if (data.href.includes('/law/')) {
          // 他法令への参照
          const lawMatch = data.href.match(/\/law\/([^/#?]+)/);
          if (lawMatch) {
            targetLawId = lawMatch[1];
            
            // アンカーから条文番号を抽出
            const anchorMatch = data.href.match(/#([^#]+)$/);
            if (anchorMatch) {
              const articleMatch = anchorMatch[1].match(/At_(\d+)/);
              if (articleMatch) {
                targetArticle = articleMatch[1];
              }
            }
          }
        } else if (data.href.includes('#')) {
          // 同一法令内参照
          referenceType = 'internal';
          targetLawId = lawId;
          
          const anchorMatch = data.href.match(/#([^#]+)$/);
          if (anchorMatch) {
            const articleMatch = anchorMatch[1].match(/At_(\d+)/);
            if (articleMatch) {
              targetArticle = articleMatch[1];
            }
          }
        }

        // テキストから条文番号を補完
        if (!targetArticle && data.text) {
          const articleMatch = data.text.match(/第?(\d+)条/);
          if (articleMatch) {
            targetArticle = articleMatch[1];
          }
        }

        // 重複チェック用のキー
        const refKey = `${data.articleNumber}-${targetLawId}-${targetArticle}-${data.text}`;
        
        if (!seenRefs.has(refKey) && (targetLawId || targetArticle)) {
          seenRefs.add(refKey);
          
          const ref: EGovReference = {
            sourceLawId: lawId,
            sourceArticle: data.articleNumber,
            targetLawId: targetLawId || undefined,
            targetArticle: targetArticle || undefined,
            referenceText: data.text,
            referenceType,
            confidence: 1.0 // e-Gov公式データなので信頼度100%
          };
          
          references.push(ref);
        }
      }

      await page.close();

      // キャッシュに保存
      this.saveToCache(lawId, references);

      console.log(chalk.green(`✓ 完了: ${lawId} (${references.length}件の参照を検出)`));
      
      // サンプル表示
      if (references.length > 0) {
        console.log(chalk.gray('\n  サンプル（最初の3件）:'));
        references.slice(0, 3).forEach((ref, i) => {
          console.log(chalk.gray(`    ${i + 1}. ${ref.sourceArticle ? `第${ref.sourceArticle}条` : '本文'}から`));
          if (ref.targetLawId && ref.targetLawId !== lawId) {
            console.log(chalk.gray(`       → 他法令(${ref.targetLawId})の${ref.targetArticle ? `第${ref.targetArticle}条` : '条文'}`));
          } else {
            console.log(chalk.gray(`       → 同法令の第${ref.targetArticle}条`));
          }
          console.log(chalk.gray(`       テキスト: "${ref.referenceText}"`));
        });
      }

    } catch (error) {
      console.error(chalk.red(`✗ エラー: ${lawId}`), error);
    }

    return references;
  }

  /**
   * キャッシュ統計を表示
   */
  async showStatistics(): Promise<void> {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    
    let totalReferences = 0;
    let internalRefs = 0;
    let externalRefs = 0;
    let lawsWithRefs = 0;

    for (const file of files) {
      const data = this.loadFromCache(file.replace('.json', ''));
      if (data && data.length > 0) {
        totalReferences += data.length;
        internalRefs += data.filter(r => r.referenceType === 'internal').length;
        externalRefs += data.filter(r => r.referenceType === 'external').length;
        lawsWithRefs++;
      }
    }

    console.log(chalk.cyan('\n📊 キャッシュ統計'));
    console.log(chalk.gray('='.repeat(40)));
    console.log(`  キャッシュ済み法令: ${files.length}件`);
    console.log(`  参照を持つ法令: ${lawsWithRefs}件`);
    console.log(`  総参照数: ${totalReferences}件`);
    console.log(`  内部参照: ${internalRefs}件 (${Math.round(internalRefs / totalReferences * 100)}%)`);
    console.log(`  外部参照: ${externalRefs}件 (${Math.round(externalRefs / totalReferences * 100)}%)`);
    console.log(`  平均参照数: ${Math.round(totalReferences / lawsWithRefs)}件/法令`);
    console.log(chalk.gray('='.repeat(40)));
  }
}

// CLI実行
if (require.main === module) {
  const scraper = new EGovScraperV2();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      switch (command) {
        case 'scrape':
          const lawId = args[0];
          if (!lawId) {
            console.error(chalk.red('法令IDを指定してください'));
            process.exit(1);
          }
          await scraper.scrapeLawReferences(lawId, !args.includes('--force'));
          break;

        case 'batch':
          // 主要法令のテスト
          const majorLaws = [
            '129AC0000000089', // 民法
            '140AC0000000045', // 刑法
            '417AC0000000086', // 会社法
            '322AC0000000049', // 労働基準法
            '132AC0000000048', // 商法
          ];
          
          for (const id of majorLaws) {
            await scraper.scrapeLawReferences(id);
            // レート制限
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          break;

        case 'stats':
          await scraper.showStatistics();
          break;

        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-scraper-v2.ts scrape [法令ID] [--force]');
          console.log('  npx tsx scripts/egov-scraper-v2.ts batch');
          console.log('  npx tsx scripts/egov-scraper-v2.ts stats');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await scraper.closeBrowser();
    }
  })();
}

export default EGovScraperV2;