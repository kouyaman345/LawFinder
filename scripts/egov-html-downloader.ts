#!/usr/bin/env npx tsx

/**
 * e-Gov法令HTMLダウンローダー
 * 
 * 法令ページのHTMLを丸ごと保存し、
 * 後でローカルで参照検出を行う
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

export class EGovHTMLDownloader {
  private browser: Browser | null = null;
  private htmlDir: string;
  private csvPath: string;
  private progressFile: string;
  private stats: DownloadStats;
  
  constructor() {
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
   * 法令HTMLをダウンロード
   */
  async downloadLawHTML(lawId: string, lawTitle?: string): Promise<boolean> {
    const htmlPath = this.getHTMLPath(lawId);
    
    // 既存チェック
    if (fs.existsSync(htmlPath)) {
      const stats = fs.statSync(htmlPath);
      if (stats.size > 1000) { // 1KB以上なら有効とみなす
        console.log(chalk.gray(`⏭ スキップ: ${lawId} (既存)`));
        this.stats.skipped++;
        return false;
      }
    }
    
    console.log(chalk.blue(`📥 ダウンロード: ${lawTitle || lawId}`));
    
    try {
      await this.initBrowser();
      const page = await this.browser!.newPage();
      
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
      await page.waitForTimeout(2000);
      
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
      console.log(chalk.green(`  ✓ 保存完了: ${sizeMB.toFixed(2)}MB`));
      
      this.stats.downloaded++;
      this.stats.totalSize += html.length;
      
      await page.close();
      return true;
      
    } catch (error: any) {
      console.error(chalk.red(`  ✗ エラー: ${error.message}`));
      this.stats.failed++;
      
      // エラー時は空ファイルを作成（再試行を避けるため）
      fs.writeFileSync(htmlPath, `<!-- ERROR: ${error.message} -->`);
      return false;
    }
  }

  /**
   * 法令リストを読み込み
   */
  private loadLawList(): Array<{lawId: string, lawTitle: string}> {
    console.log(chalk.blue('📂 法令リストを読み込み中...'));
    
    const csvContent = fs.readFileSync(this.csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    const laws: Array<{lawId: string, lawTitle: string}> = [];
    
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
   * バッチダウンロード
   */
  async downloadAll(options: {
    limit?: number;
    batchSize?: number;
    delayMs?: number;
    resume?: boolean;
  } = {}): Promise<void> {
    const {
      limit,
      batchSize = 10,
      delayMs = 2000,
      resume = true
    } = options;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🚀 e-Gov法令HTMLダウンロード開始'));
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
    console.log(`  保存先: ${this.htmlDir}`);
    
    const estimatedTime = (targetLaws.length * (delayMs + 5000)) / 1000 / 60;
    console.log(`  推定時間: 約${Math.ceil(estimatedTime)}分\n`);
    
    const startTime = Date.now();
    
    try {
      // バッチ処理
      for (let i = 0; i < targetLaws.length; i += batchSize) {
        const batch = targetLaws.slice(i, i + batchSize);
        
        console.log(chalk.cyan(`\nバッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetLaws.length / batchSize)}`));
        
        for (const law of batch) {
          await this.downloadLawHTML(law.lawId, law.lawTitle);
          completed.add(law.lawId);
          
          // 遅延
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
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
            console.log(`  残り時間: 約${Math.round(remaining)}分\n`);
          }
        }
        
        // バッチ間の休憩
        if (i + batchSize < targetLaws.length) {
          console.log(chalk.yellow('⏸ 休憩（5秒）'));
          await new Promise(resolve => setTimeout(resolve, 5000));
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
  const downloader = new EGovHTMLDownloader();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'download':
          await downloader.downloadAll({
            limit: process.argv.includes('--limit') ?
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
            batchSize: process.argv.includes('--batch') ?
              parseInt(process.argv[process.argv.indexOf('--batch') + 1]) : 10,
            delayMs: process.argv.includes('--delay') ?
              parseInt(process.argv[process.argv.indexOf('--delay') + 1]) : 2000,
            resume: !process.argv.includes('--no-resume')
          });
          break;
          
        case 'status':
          downloader.checkStatus();
          break;
          
        case 'test':
          // テスト（5件のみ）
          await downloader.downloadAll({ limit: 5 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-html-downloader.ts download [オプション]');
          console.log('  npx tsx scripts/egov-html-downloader.ts status');
          console.log('  npx tsx scripts/egov-html-downloader.ts test');
          console.log('\nオプション:');
          console.log('  --limit N     ダウンロード数を制限');
          console.log('  --batch N     バッチサイズ（デフォルト: 10）');
          console.log('  --delay N     法令間の遅延ms（デフォルト: 2000）');
          console.log('  --no-resume   最初から実行');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    }
  })();
}

export default EGovHTMLDownloader;