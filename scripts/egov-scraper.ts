#!/usr/bin/env npx tsx

/**
 * e-Gov法令検索スクレイピングツール
 * 
 * e-Gov法令検索から参照データを取得し、ローカルキャッシュに保存
 * 初期データセットアップと差分更新の両方に対応
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

const prisma = new PrismaClient();

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external' | 'structural';
  scrapeDate: string;
  confidence: number;
}

interface LawMetadata {
  lawId: string;
  lawNumber: string;
  lawName: string;
  lastUpdated?: string;
  totalReferences?: number;
}

export class EGovScraper {
  private browser: Browser | null = null;
  private cacheDir: string;
  private metadataPath: string;
  private lawListPath: string;
  private requestDelay = 2000; // 2秒の遅延（サーバー負荷軽減）
  
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'egov_cache', 'references');
    this.metadataPath = path.join(process.cwd(), 'egov_cache', 'metadata.json');
    this.lawListPath = path.join(process.cwd(), 'laws_data', 'all_law_list.csv');
    
    // キャッシュディレクトリ作成
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * ブラウザ初期化
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
  }

  /**
   * ブラウザ終了
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 法令リストをCSVから読み込み
   */
  private loadLawList(): LawMetadata[] {
    const csvContent = fs.readFileSync(this.lawListPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1); // ヘッダーをスキップ
    const laws: LawMetadata[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const parts = line.split(',');
      if (parts.length >= 12 && parts[11]) {
        laws.push({
          lawId: parts[11],
          lawNumber: parts[1],
          lawName: parts[2]
        });
      }
    }
    
    return laws;
  }

  /**
   * キャッシュから参照データを読み込み
   */
  private loadFromCache(lawId: string): EGovReference[] | null {
    const cachePath = path.join(this.cacheDir, `${lawId}.json`);
    
    if (fs.existsSync(cachePath)) {
      try {
        const data = fs.readFileSync(cachePath, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error(chalk.red(`キャッシュ読み込みエラー: ${lawId}`), error);
      }
    }
    
    return null;
  }

  /**
   * 参照データをキャッシュに保存
   */
  private saveToCache(lawId: string, references: EGovReference[]): void {
    const cachePath = path.join(this.cacheDir, `${lawId}.json`);
    
    try {
      fs.writeFileSync(cachePath, JSON.stringify(references, null, 2));
    } catch (error) {
      console.error(chalk.red(`キャッシュ保存エラー: ${lawId}`), error);
    }
  }

  /**
   * メタデータを更新
   */
  private updateMetadata(lawId: string, referenceCount: number): void {
    let metadata: Record<string, any> = {};
    
    if (fs.existsSync(this.metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
      } catch (error) {
        console.error(chalk.red('メタデータ読み込みエラー'), error);
      }
    }
    
    metadata[lawId] = {
      lastScraped: new Date().toISOString(),
      referenceCount: referenceCount
    };
    
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * e-Gov法令ページから参照データをスクレイピング
   */
  async scrapeLawReferences(lawId: string, lawName: string, useCache: boolean = true): Promise<EGovReference[]> {
    // キャッシュチェック
    if (useCache) {
      const cached = this.loadFromCache(lawId);
      if (cached) {
        console.log(chalk.green(`✓ キャッシュ使用: ${lawName} (${cached.length}件)`));
        return cached;
      }
    }

    console.log(chalk.blue(`🔍 スクレイピング開始: ${lawName}`));
    const references: EGovReference[] = [];

    try {
      await this.initBrowser();
      const page = await this.browser!.newPage();
      
      // User-Agentを設定
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      // e-Gov法令ページにアクセス（新形式のURL）
      const url = `https://laws.e-gov.go.jp/law/${lawId}`;
      console.log(chalk.gray(`  URL: ${url}`));
      
      // ページ遷移
      const response = await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // レスポンスチェック
      if (!response || !response.ok()) {
        // 代替URL形式
        const altUrl = `https://elaws.e-gov.go.jp/document?lawid=${lawId}`;
        console.log(chalk.gray(`  代替URL: ${altUrl}`));
        
        const altResponse = await page.goto(altUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        if (!altResponse || !altResponse.ok()) {
          console.log(chalk.yellow(`⚠️ ページの読み込み失敗`));
          await page.close();
          return references;
        }
      }

      // コンテンツの読み込みを待つ
      await page.waitForSelector('.Article, article.law', { timeout: 5000 }).catch(() => {});

      // ページが正しく読み込まれたか確認（e-Gov法令検索の実際のDOM構造に合わせる）
      const hasContent = await page.evaluate(() => {
        // 各種要素をチェック
        const selectors = [
          '.law_title',     // 法令タイトル
          '.article',       // 条文
          '.item',          // 項目
          '.paragraph',     // 段落
          'table.items',    // 条文テーブル
          '#lawContents',   // 法令コンテンツ
          'div[class*="Article"]',  // 条文関連のdiv
          'a[href*="/law/"]',      // 法令リンク
        ];
        
        for (const selector of selectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        
        // コンテンツがあるかテキストでもチェック
        const bodyText = document.body?.innerText || '';
        return bodyText.includes('第') && bodyText.includes('条');
      });

      if (!hasContent) {
        console.log(chalk.yellow(`⚠️ コンテンツが見つかりません: ${lawName}`));
        
        // ページ内容をデバッグ出力
        const pageTitle = await page.title();
        console.log(chalk.gray(`  ページタイトル: ${pageTitle}`));
        
        await page.close();
        return references;
      }

      // 参照リンクを抽出（実際のe-GovのDOM構造に合わせて修正）
      const extractedData = await page.evaluate(() => {
        const results: Array<{
          text: string;
          href: string;
          articleContext?: string;
          paragraphContext?: string;
        }> = [];

        // すべてのリンクを取得（e-Govは条文中にリンクを埋め込んでいる）
        const allLinks = document.querySelectorAll('a[href]');
        
        allLinks.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          const text = (link as HTMLElement).innerText || (link as HTMLElement).textContent || '';
          
          // 法令参照のリンクパターン
          // 1. 他法令への参照: /law/法令ID
          // 2. 同一法令内の参照: #アンカー
          // 3. 検索結果への参照: /search
          if (href && (
            href.includes('/law/') || 
            href.includes('/document?lawid=') ||
            href.includes('#') && !href.endsWith('#')
          )) {
            // 参照テキストが法令参照らしいかチェック
            if (text && (
              text.includes('法') ||
              text.includes('令') ||
              text.includes('条') ||
              text.includes('項') ||
              text.includes('号')
            )) {
              // 条文コンテキストを取得（リンクの親要素から）
              let parent = link.parentElement;
              let articleContext = '';
              let depth = 0;
              
              while (parent && depth < 10) {
                const parentText = parent.textContent || '';
                const articleMatch = parentText.match(/第([０-９0-9]+)条/);
                if (articleMatch && !articleContext) {
                  articleContext = articleMatch[1];
                  break;
                }
                parent = parent.parentElement;
                depth++;
              }
              
              results.push({
                text: text.trim(),
                href: href,
                articleContext: articleContext,
                paragraphContext: ''
              });
            }
          }
        });

        // デバッグ情報
        console.log(`Found ${allLinks.length} links, extracted ${results.length} references`);
        
        return results;
      });

      // 抽出したデータを参照形式に変換
      for (const data of extractedData) {
        const ref: EGovReference = {
          sourceLawId: lawId,
          sourceArticle: data.articleContext,
          referenceText: data.text,
          referenceType: 'external',
          scrapeDate: new Date().toISOString(),
          confidence: 1.0 // e-Gov公式データなので信頼度100%
        };

        // URLから対象法令と条文を抽出
        if (data.href.includes('lawid=')) {
          const targetMatch = data.href.match(/lawid=([^&#]+)/);
          if (targetMatch) {
            ref.targetLawId = targetMatch[1];
            
            // アンカーから条文番号を抽出
            const anchorMatch = data.href.match(/#([^#]+)$/);
            if (anchorMatch) {
              ref.targetArticle = anchorMatch[1];
            }
          }
        } else if (data.href.includes('#')) {
          // 同一法令内参照
          ref.referenceType = 'internal';
          ref.targetLawId = lawId;
          
          const anchorMatch = data.href.match(/#([^#]+)$/);
          if (anchorMatch) {
            ref.targetArticle = anchorMatch[1];
          }
        }

        // テキストから条文番号を抽出（補完）
        if (!ref.targetArticle && data.text) {
          const articleMatch = data.text.match(/第([０-９0-9]+)条/);
          if (articleMatch) {
            ref.targetArticle = articleMatch[1];
          }
        }

        references.push(ref);
      }

      await page.close();

      // キャッシュに保存
      this.saveToCache(lawId, references);
      this.updateMetadata(lawId, references.length);

      console.log(chalk.green(`✓ 完了: ${lawName} (${references.length}件の参照を検出)`));

    } catch (error) {
      console.error(chalk.red(`✗ エラー: ${lawName}`), error);
    }

    // レート制限のための遅延
    await new Promise(resolve => setTimeout(resolve, this.requestDelay));

    return references;
  }

  /**
   * 全法令のスクレイピング（バッチ処理）
   */
  async scrapeAllLaws(options: {
    limit?: number;
    skipExisting?: boolean;
    startFrom?: string;
  } = {}): Promise<void> {
    const laws = this.loadLawList();
    const { limit, skipExisting = true, startFrom } = options;

    let startIndex = 0;
    if (startFrom) {
      startIndex = laws.findIndex(l => l.lawId === startFrom);
      if (startIndex === -1) startIndex = 0;
    }

    const targetLaws = limit ? laws.slice(startIndex, startIndex + limit) : laws.slice(startIndex);
    
    console.log(chalk.cyan(`\n📊 スクレイピング対象: ${targetLaws.length}件の法令`));
    console.log(chalk.gray(`  開始位置: ${startIndex + 1}/${laws.length}`));
    if (skipExisting) {
      console.log(chalk.gray('  既存キャッシュはスキップ'));
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const startTime = Date.now();

    for (const law of targetLaws) {
      // 既存チェック
      if (skipExisting && this.loadFromCache(law.lawId)) {
        console.log(chalk.gray(`⏭️ スキップ: ${law.lawName}`));
        skipped++;
        continue;
      }

      try {
        await this.scrapeLawReferences(law.lawId, law.lawName, false);
        processed++;
      } catch (error) {
        console.error(chalk.red(`エラー: ${law.lawName}`), error);
        errors++;
      }

      // 進捗表示
      if ((processed + skipped) % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000 / 60;
        const rate = (processed + skipped) / elapsed;
        console.log(chalk.cyan(`\n📈 進捗: ${processed + skipped}/${targetLaws.length} (${Math.round(rate)}件/分)`));
      }

      // 50件ごとに休憩（サーバー負荷軽減）
      if (processed % 50 === 0 && processed > 0) {
        console.log(chalk.yellow('\n⏸️ 休憩中... (30秒)'));
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    await this.closeBrowser();

    // 最終統計
    const totalTime = (Date.now() - startTime) / 1000 / 60;
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan('📊 スクレイピング完了'));
    console.log(chalk.green(`  ✓ 処理済み: ${processed}件`));
    console.log(chalk.gray(`  ⏭️ スキップ: ${skipped}件`));
    console.log(chalk.red(`  ✗ エラー: ${errors}件`));
    console.log(chalk.blue(`  ⏱️ 所要時間: ${Math.round(totalTime)}分`));
    console.log(chalk.cyan('='.repeat(50)));
  }

  /**
   * キャッシュ統計を表示
   */
  async showStatistics(): Promise<void> {
    const files = fs.readdirSync(this.cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    let totalReferences = 0;
    let internalRefs = 0;
    let externalRefs = 0;

    for (const file of jsonFiles) {
      const data = this.loadFromCache(file.replace('.json', ''));
      if (data) {
        totalReferences += data.length;
        internalRefs += data.filter(r => r.referenceType === 'internal').length;
        externalRefs += data.filter(r => r.referenceType === 'external').length;
      }
    }

    console.log(chalk.cyan('\n📊 キャッシュ統計'));
    console.log(chalk.gray('='.repeat(40)));
    console.log(`  法令数: ${jsonFiles.length}件`);
    console.log(`  総参照数: ${totalReferences}件`);
    console.log(`  内部参照: ${internalRefs}件`);
    console.log(`  外部参照: ${externalRefs}件`);
    console.log(`  平均参照数: ${Math.round(totalReferences / jsonFiles.length)}件/法令`);
    console.log(chalk.gray('='.repeat(40)));
  }

  /**
   * データベースへのインポート
   */
  async importToDatabase(): Promise<void> {
    const files = fs.readdirSync(this.cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(chalk.cyan(`\n💾 データベースへのインポート開始 (${jsonFiles.length}件)`));

    let imported = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const lawId = file.replace('.json', '');
      const references = this.loadFromCache(lawId);
      
      if (!references) continue;

      try {
        // 既存の参照を削除
        await prisma.reference.deleteMany({
          where: { sourceLawId: lawId }
        });

        // 新しい参照を挿入
        for (const ref of references) {
          await prisma.reference.create({
            data: {
              sourceLawId: ref.sourceLawId,
              sourceArticleNumber: ref.sourceArticle,
              targetLawId: ref.targetLawId || '',
              targetArticleNumber: ref.targetArticle,
              referenceText: ref.referenceText,
              referenceType: ref.referenceType,
              confidence: ref.confidence,
              metadata: {
                scrapeDate: ref.scrapeDate,
                source: 'egov'
              }
            }
          });
        }

        imported++;
        if (imported % 100 === 0) {
          console.log(chalk.green(`  ✓ ${imported}件インポート完了`));
        }

      } catch (error) {
        console.error(chalk.red(`エラー: ${lawId}`), error);
        errors++;
      }
    }

    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan('💾 インポート完了'));
    console.log(chalk.green(`  ✓ 成功: ${imported}件`));
    console.log(chalk.red(`  ✗ エラー: ${errors}件`));
    console.log(chalk.cyan('='.repeat(50)));
  }
}

// CLI実行
if (require.main === module) {
  const scraper = new EGovScraper();
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
          await scraper.scrapeLawReferences(lawId, lawId);
          break;

        case 'batch':
          const limit = args.includes('--limit') ? 
            parseInt(args[args.indexOf('--limit') + 1]) : undefined;
          const skipExisting = !args.includes('--force');
          const startFrom = args.includes('--start') ?
            args[args.indexOf('--start') + 1] : undefined;
          
          await scraper.scrapeAllLaws({ limit, skipExisting, startFrom });
          break;

        case 'stats':
          await scraper.showStatistics();
          break;

        case 'import':
          await scraper.importToDatabase();
          break;

        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-scraper.ts scrape [法令ID]');
          console.log('  npx tsx scripts/egov-scraper.ts batch [--limit N] [--force] [--start 法令ID]');
          console.log('  npx tsx scripts/egov-scraper.ts stats');
          console.log('  npx tsx scripts/egov-scraper.ts import');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await scraper.closeBrowser();
      await prisma.$disconnect();
    }
  })();
}

export default EGovScraper;