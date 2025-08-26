#!/usr/bin/env npx tsx

/**
 * 欠損法令HTMLをe-Govからダウンロード
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import pLimit from 'p-limit';

class MissingLawDownloader {
  private htmlDir: string;
  private stats = {
    downloaded: 0,
    errors: 0,
    skipped: 0
  };
  
  constructor() {
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
  }

  /**
   * 法令HTMLをダウンロード
   */
  private async downloadLawHTML(lawId: string): Promise<boolean> {
    const url = `https://elaws.e-gov.go.jp/document?lawid=${lawId}`;
    const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
    
    // 既に存在する場合はスキップ
    if (fs.existsSync(htmlPath)) {
      this.stats.skipped++;
      return true;
    }
    
    try {
      console.log(chalk.gray(`  Downloading: ${lawId}...`));
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(chalk.yellow(`    404: ${lawId} (法令が見つかりません)`));
        } else {
          console.log(chalk.red(`    Error ${response.status}: ${lawId}`));
        }
        this.stats.errors++;
        return false;
      }
      
      const html = await response.text();
      
      // HTMLを保存
      fs.writeFileSync(htmlPath, html, 'utf-8');
      
      console.log(chalk.green(`    ✓ ${lawId}`));
      this.stats.downloaded++;
      
      // レート制限のため少し待機
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;
      
    } catch (error: any) {
      console.error(chalk.red(`    Error: ${lawId} - ${error.message}`));
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 欠損法令リストをダウンロード
   */
  async downloadMissingLaws(limit: number = 50): Promise<void> {
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.cyan('📥 欠損法令HTMLダウンロード'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    // 欠損リストを読み込み
    const missingFile = path.join(process.cwd(), 'all_missing_laws.txt');
    if (!fs.existsSync(missingFile)) {
      console.error(chalk.red('all_missing_laws.txt が見つかりません'));
      return;
    }
    
    const missingLaws = fs.readFileSync(missingFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .slice(0, limit); // 制限
    
    console.log(`\n${missingLaws.length}法令をダウンロードします\n`);
    
    // 並列度を制限（e-Gov サーバーに負荷をかけないため）
    const concurrencyLimit = pLimit(2);
    
    // バッチ処理
    const batchSize = 10;
    for (let i = 0; i < missingLaws.length; i += batchSize) {
      const batch = missingLaws.slice(i, i + batchSize);
      
      console.log(chalk.blue(`\nバッチ ${Math.floor(i/batchSize) + 1}/${Math.ceil(missingLaws.length/batchSize)}`));
      
      await Promise.all(
        batch.map(lawId => 
          concurrencyLimit(() => this.downloadLawHTML(lawId))
        )
      );
      
      // バッチ間で少し待機
      if (i + batchSize < missingLaws.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 重要法令を優先ダウンロード
   */
  async downloadPriorityLaws(): Promise<void> {
    console.log(chalk.yellow('\n📌 重要法令の優先ダウンロード\n'));
    
    // 優先度の高い法令ID
    const priorityLaws = [
      '417AC0000000086', // 会社法
      '411AC0000000103', // 独立行政法人通則法
      '405AC0000000088', // 行政手続法
      '426AC0000000068', // 行政不服審査法
      '322AC0000000067', // 地方自治法
    ];
    
    for (const lawId of priorityLaws) {
      const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
      if (!fs.existsSync(htmlPath)) {
        console.log(chalk.yellow(`重要法令: ${lawId}`));
        await this.downloadLawHTML(lawId);
      }
    }
  }

  /**
   * 結果を表示
   */
  showResults(): void {
    console.log(chalk.cyan('\n' + '=' .repeat(60)));
    console.log(chalk.green('✅ ダウンロード完了'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.blue(`  ダウンロード成功: ${this.stats.downloaded}件`));
    console.log(chalk.yellow(`  スキップ: ${this.stats.skipped}件`));
    console.log(chalk.red(`  エラー: ${this.stats.errors}件`));
  }

  async run(options: { priority?: boolean, limit?: number } = {}): Promise<void> {
    const startTime = Date.now();
    
    if (options.priority) {
      await this.downloadPriorityLaws();
    }
    
    await this.downloadMissingLaws(options.limit || 50);
    
    this.showResults();
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(chalk.gray(`\n所要時間: ${elapsed.toFixed(1)}秒`));
  }
}

// 実行
if (require.main === module) {
  const downloader = new MissingLawDownloader();
  
  // コマンドライン引数
  const args = process.argv.slice(2);
  const priority = args.includes('--priority');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;
  
  console.log(chalk.gray('使用方法:'));
  console.log(chalk.gray('  npx tsx scripts/download-missing-laws.ts [--priority] [--limit=50]'));
  console.log(chalk.gray('  --priority: 重要法令を優先ダウンロード'));
  console.log(chalk.gray('  --limit=N: ダウンロード数を制限（デフォルト50）\n'));
  
  downloader.run({ priority, limit })
    .catch(error => {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    });
}

export default MissingLawDownloader;