#!/usr/bin/env npx tsx

/**
 * e-Gov法令HTMLダウンローダー（並列処理版）
 * 
 * 法令ページのHTMLを並列でダウンロードし、
 * 処理速度を大幅に向上させる
 */

import { chromium, Browser } from 'playwright';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parse } from 'csv-parse/sync';

interface DownloadStats {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  totalSize: number;
}

interface LawData {
  lawId: string;
  lawTitle: string;
}

export class EGovHTMLDownloaderParallel {
  private browser: Browser | null = null;
  private htmlDir: string;
  private csvPath: string;
  private progressFile: string;
  private stats: DownloadStats;
  private concurrency: number;
  
  constructor(concurrency: number = 5) {
    this.concurrency = concurrency;
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
    this.csvPath = path.join(process.cwd(), 'laws_data', 'all_law_list.csv');
    this.progressFile = path.join(this.htmlDir, 'download_progress.json');
    
    // ディレクトリ作成
    if (!fs.existsSync(this.htmlDir)) {
      fs.mkdirSync(this.htmlDir, { recursive: true });
    }
    
    this.stats = {
      total: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      totalSize: 0
    };
  }

  /**
   * ブラウザを初期化
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  /**
   * ブラウザを終了
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 進捗状況を読み込み
   */
  private loadProgress(): Set<string> {
    if (fs.existsSync(this.progressFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf-8'));
        // 既存のstatsも読み込み
        if (data.stats) {
          this.stats = { ...this.stats, ...data.stats };
        }
        return new Set(data.completed || []);
      } catch {
        return new Set();
      }
    }
    return new Set();
  }

  /**
   * 進捗状況を保存
   */
  private saveProgress(completed: Set<string>): void {
    const data = {
      completed: Array.from(completed),
      stats: this.stats,
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
  }

  /**
   * HTMLファイルのパスを取得
   */
  private getHTMLPath(lawId: string): string {
    return path.join(this.htmlDir, `${lawId}.html`);
  }

  /**
   * 単一の法令HTMLをダウンロード（並列実行用）
   */
  private async downloadLawHTMLSingle(lawId: string, lawTitle: string = '', page: any): Promise<{
    success: boolean;
    size: number;
    skipped: boolean;
  }> {
    const htmlPath = this.getHTMLPath(lawId);
    
    // 既存チェック
    if (fs.existsSync(htmlPath)) {
      const stats = fs.statSync(htmlPath);
      if (stats.size > 1000) { // 1KB以上なら有効とみなす
        console.log(chalk.gray(`⏭ スキップ: ${lawId} (既存)`));
        return { success: true, size: 0, skipped: true };
      }
    }
    
    console.log(chalk.blue(`📥 ダウンロード開始: ${lawTitle || lawId}`));
    
    try {
      // User-Agent設定
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      // e-Gov法令ページにアクセス
      const url = `https://elaws.e-gov.go.jp/document?lawid=${lawId}`;
      
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      if (!response || !response.ok()) {
        throw new Error(`HTTPエラー: ${response?.status()}`);
      }
      
      // ページが完全に読み込まれるのを待つ
      await page.waitForTimeout(1500);
      
      // HTMLを取得（JavaScriptで生成された内容も含む）
      const html = await page.content();
      
      // メタデータを追加
      const metadata = {
        lawId,
        lawTitle: lawTitle || '',
        downloadDate: new Date().toISOString(),
        url,
        size: html.length
      };
      
      // HTMLの先頭にメタデータをコメントとして追加
      const htmlWithMeta = `<!-- METADATA: ${JSON.stringify(metadata)} -->\n${html}`;
      
      // 保存
      fs.writeFileSync(htmlPath, htmlWithMeta);
      
      const sizeMB = html.length / 1024 / 1024;
      console.log(chalk.green(`  ✓ 完了: ${lawId} (${sizeMB.toFixed(2)}MB)`));
      
      return { success: true, size: html.length, skipped: false };
      
    } catch (error: any) {
      console.error(chalk.red(`  ✗ エラー: ${lawId} - ${error.message}`));
      
      // エラー時は空ファイルを作成（再試行を避けるため）
      fs.writeFileSync(htmlPath, `<!-- ERROR: ${error.message} -->`);
      return { success: false, size: 0, skipped: false };
    }
  }

  /**
   * 法令リストを読み込み
   */
  private loadLawList(): Array<LawData> {
    console.log(chalk.blue('📂 法令リストを読み込み中...'));
    
    const csvContent = fs.readFileSync(this.csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    const laws: Array<LawData> = [];
    
    records.forEach((record: any) => {
      const lawId = record['法令ID'];
      const lawTitle = record['法令名'];
      
      if (lawId && lawId !== '法令ID') {
        laws.push({ lawId, lawTitle: lawTitle || '' });
      }
    });
    
    console.log(chalk.green(`✓ ${laws.length}件の法令を検出`));
    return laws;
  }

  /**
   * バッチを並列でダウンロード
   */
  private async downloadBatchParallel(batch: LawData[], completed: Set<string>): Promise<void> {
    await this.initBrowser();
    
    // 並列実行用のページを作成
    const pages = await Promise.all(
      Array(Math.min(this.concurrency, batch.length))
        .fill(null)
        .map(() => this.browser!.newPage())
    );
    
    try {
      const chunks: LawData[][] = [];
      for (let i = 0; i < batch.length; i += this.concurrency) {
        chunks.push(batch.slice(i, i + this.concurrency));
      }
      
      for (const chunk of chunks) {
        // スタガリング付き並列実行
        const promises = chunk.map(async (law, index) => {
          // スタガリング（サーバー負荷軽減）
          await new Promise(resolve => setTimeout(resolve, index * 300));
          
          const pageIndex = index % pages.length;
          const result = await this.downloadLawHTMLSingle(
            law.lawId, 
            law.lawTitle,
            pages[pageIndex]
          );
          
          if (result.skipped) {
            this.stats.skipped++;
          } else if (result.success) {
            this.stats.downloaded++;
            this.stats.totalSize += result.size;
          } else {
            this.stats.failed++;
          }
          
          completed.add(law.lawId);
          return result;
        });
        
        await Promise.all(promises);
      }
    } finally {
      // ページをクローズ
      await Promise.all(pages.map(page => page.close()));
    }
  }

  /**
   * 並列バッチダウンロード
   */
  async downloadAll(options: {
    limit?: number;
    batchSize?: number;
    resume?: boolean;
  } = {}): Promise<void> {
    const {
      limit,
      batchSize = 25,
      resume = true
    } = options;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🚀 e-Gov法令HTMLダウンロード開始（並列処理版）'));
    console.log(chalk.cyan('='.repeat(60)));
    
    // 法令リストを読み込み
    const allLaws = this.loadLawList();
    
    // 進捗状況を読み込み
    const completed = resume ? this.loadProgress() : new Set<string>();
    
    // 処理対象を決定
    let targetLaws = allLaws.filter(law => !completed.has(law.lawId));
    
    if (limit) {
      targetLaws = targetLaws.slice(0, limit);
    }
    
    this.stats.total = targetLaws.length;
    
    console.log(chalk.blue(`\n📊 処理状況:`));
    console.log(`  総法令数: ${allLaws.length}件`);
    console.log(`  完了済み: ${completed.size}件`);
    console.log(`  処理対象: ${targetLaws.length}件`);
    console.log(`  並列数: ${this.concurrency}`);
    console.log(`  バッチサイズ: ${batchSize}`);
    console.log(`  保存先: ${this.htmlDir}`);
    
    const estimatedTime = (targetLaws.length / (this.concurrency * 2)) / 60; // 並列処理での推定
    console.log(`  推定時間: 約${Math.ceil(estimatedTime)}分\n`);
    
    const startTime = Date.now();
    
    try {
      // バッチ処理
      for (let i = 0; i < targetLaws.length; i += batchSize) {
        const batch = targetLaws.slice(i, i + batchSize);
        
        console.log(chalk.cyan(`\nバッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetLaws.length / batchSize)}`));
        console.log(chalk.gray(`  処理: ${batch.length}件を並列${this.concurrency}でダウンロード`));
        
        await this.downloadBatchParallel(batch, completed);
        
        // 定期的に進捗を保存
        if ((this.stats.downloaded + this.stats.skipped) % 20 === 0) {
          this.saveProgress(completed);
          
          const processed = this.stats.downloaded + this.stats.skipped + this.stats.failed;
          const elapsed = (Date.now() - startTime) / 1000 / 60;
          const rate = processed / elapsed;
          const remaining = (targetLaws.length - processed) / rate;
          
          console.log(chalk.blue(`\n📈 進捗: ${processed}/${targetLaws.length} (${Math.round(processed / targetLaws.length * 100)}%)`));
          console.log(`  ダウンロード: ${this.stats.downloaded}件`);
          console.log(`  スキップ: ${this.stats.skipped}件`);
          console.log(`  エラー: ${this.stats.failed}件`);
          console.log(`  合計サイズ: ${(this.stats.totalSize / 1024 / 1024).toFixed(1)}MB`);
          console.log(`  処理速度: ${rate.toFixed(1)}件/分`);
          console.log(`  残り時間: 約${Math.round(remaining)}分\n`);
        }
        
        // バッチ間の短い休憩
        if (i + batchSize < targetLaws.length) {
          console.log(chalk.yellow('⏸ 休憩（2秒）'));
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
    } finally {
      await this.closeBrowser();
      this.saveProgress(completed);
      
      // 最終統計
      const totalTime = (Date.now() - startTime) / 1000 / 60;
      
      console.log(chalk.cyan('\n' + '='.repeat(60)));
      console.log(chalk.cyan('📊 ダウンロード完了'));
      console.log(chalk.cyan('='.repeat(60)));
      console.log(chalk.green(`✅ ダウンロード: ${this.stats.downloaded}件`));
      console.log(chalk.gray(`⏭ スキップ: ${this.stats.skipped}件`));
      console.log(chalk.red(`✗ エラー: ${this.stats.failed}件`));
      console.log(chalk.blue(`💾 合計サイズ: ${(this.stats.totalSize / 1024 / 1024).toFixed(1)}MB`));
      console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
      console.log(chalk.blue(`📈 処理速度: ${((this.stats.downloaded + this.stats.skipped) / totalTime).toFixed(1)}法令/分`));
    }
  }

  /**
   * キャッシュ状況を確認
   */
  checkStatus(): void {
    const files = fs.readdirSync(this.htmlDir).filter(f => f.endsWith('.html'));
    const allLaws = this.loadLawList();
    const completed = this.loadProgress();
    
    let validFiles = 0;
    let errorFiles = 0;
    let totalSize = 0;
    
    files.forEach(file => {
      const filePath = path.join(this.htmlDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.size > 10000) { // 10KB以上を有効とみなす
        validFiles++;
        totalSize += stats.size;
      } else {
        errorFiles++;
      }
    });
    
    console.log(chalk.cyan('\n📊 HTMLキャッシュ状況'));
    console.log(chalk.gray('='.repeat(50)));
    console.log(`全法令数: ${allLaws.length}件`);
    console.log(`進捗記録: ${completed.size}件`);
    console.log(`ダウンロード済み: ${files.length}件 (${(files.length / allLaws.length * 100).toFixed(1)}%)`);
    console.log(`  有効: ${validFiles}件`);
    console.log(`  エラー: ${errorFiles}件`);
    console.log(`合計サイズ: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
    console.log(`平均サイズ: ${validFiles > 0 ? (totalSize / validFiles / 1024).toFixed(1) : 0}KB/法令`);
    console.log(chalk.gray('='.repeat(50)));
  }
}

// CLI実行
if (require.main === module) {
  const downloader = new EGovHTMLDownloaderParallel(5); // 並列数5
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'download':
          await downloader.downloadAll({
            limit: process.argv.includes('--limit') ?
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
            batchSize: process.argv.includes('--batch') ?
              parseInt(process.argv[process.argv.indexOf('--batch') + 1]) : 25,
            resume: !process.argv.includes('--no-resume')
          });
          break;
          
        case 'status':
          downloader.checkStatus();
          break;
          
        case 'test':
          // テスト（50件のみ）
          await downloader.downloadAll({ limit: 50 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-html-downloader-parallel.ts download [オプション]');
          console.log('  npx tsx scripts/egov-html-downloader-parallel.ts status');
          console.log('  npx tsx scripts/egov-html-downloader-parallel.ts test');
          console.log('\nオプション:');
          console.log('  --limit N     ダウンロード数を制限');
          console.log('  --batch N     バッチサイズ（デフォルト: 25）');
          console.log('  --no-resume   最初から実行');
          console.log('\n特徴:');
          console.log('  - 並列5でダウンロード（3-4倍高速化）');
          console.log('  - スタガリング付き（サーバー負荷軽減）');
          console.log('  - 既存の進捗ファイルを継続使用');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    }
  })();
}

export default EGovHTMLDownloaderParallel;