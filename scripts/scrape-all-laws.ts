#!/usr/bin/env npx tsx

/**
 * 全法令のe-Govスクレイピング実行スクリプト
 * 
 * all_law_list.csvから全法令IDを読み込み、
 * e-Gov法令検索から参照データをスクレイピング
 */

import { EGovScraperV2 } from './egov-scraper-v2';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parse } from 'csv-parse/sync';

interface LawEntry {
  lawId: string;
  lawNumber: string;
  lawTitle: string;
  url?: string;
}

class AllLawsScraper {
  private scraper: EGovScraperV2;
  private csvPath: string;
  private cacheDir: string;
  private progressFile: string;
  
  constructor() {
    this.scraper = new EGovScraperV2();
    this.csvPath = path.join(process.cwd(), 'laws_data', 'all_law_list.csv');
    this.cacheDir = path.join(process.cwd(), 'egov_cache_v2', 'references');
    this.progressFile = path.join(process.cwd(), 'egov_cache_v2', 'progress.json');
  }

  /**
   * CSVから法令リストを読み込み
   */
  private loadLawList(): LawEntry[] {
    console.log(chalk.blue('📂 法令リストを読み込み中...'));
    
    const csvContent = fs.readFileSync(this.csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      encoding: 'utf-8'
    });
    
    const laws: LawEntry[] = [];
    
    records.forEach((record: any) => {
      const lawId = record['法令ID'];
      if (lawId && lawId !== '法令ID') {
        laws.push({
          lawId,
          lawNumber: record['法令番号'] || '',
          lawTitle: record['法令名'] || '',
          url: record['本文URL'] || ''
        });
      }
    });
    
    console.log(chalk.green(`✓ ${laws.length}件の法令を検出`));
    return laws;
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
  private saveProgress(completed: Set<string>, stats: any): void {
    const data = {
      completed: Array.from(completed),
      stats,
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
  }

  /**
   * 全法令をスクレイピング
   */
  async scrapeAll(options: {
    limit?: number;
    skipExisting?: boolean;
    batchSize?: number;
    delayMs?: number;
    resume?: boolean;
  } = {}): Promise<void> {
    const {
      limit,
      skipExisting = true,
      batchSize = 10,
      delayMs = 2000,
      resume = true
    } = options;

    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🚀 全法令e-Govスクレイピング開始'));
    console.log(chalk.cyan('='.repeat(60)));
    
    // 法令リストを読み込み
    const allLaws = this.loadLawList();
    
    // 進捗状況を読み込み（再開モード）
    const completed = resume ? this.loadProgress() : new Set<string>();
    
    // 処理対象を決定
    let targetLaws = allLaws;
    
    if (skipExisting || resume) {
      targetLaws = allLaws.filter(law => {
        // 既に完了したものはスキップ
        if (completed.has(law.lawId)) {
          return false;
        }
        // キャッシュ存在チェック
        if (skipExisting) {
          const cachePath = path.join(this.cacheDir, `${law.lawId}.json`);
          if (fs.existsSync(cachePath)) {
            try {
              const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
              if (Array.isArray(data) && data.length > 0) {
                completed.add(law.lawId);
                return false;
              }
            } catch {}
          }
        }
        return true;
      });
    }
    
    // 制限を適用
    if (limit && limit < targetLaws.length) {
      targetLaws = targetLaws.slice(0, limit);
    }
    
    console.log(chalk.blue(`\n📊 処理状況:`));
    console.log(`  総法令数: ${allLaws.length}件`);
    console.log(`  完了済み: ${completed.size}件`);
    console.log(`  処理対象: ${targetLaws.length}件`);
    console.log(`  バッチサイズ: ${batchSize}件`);
    console.log(`  遅延: ${delayMs}ms/法令`);
    
    const estimatedTime = (targetLaws.length * (delayMs + 3000)) / 1000 / 60;
    console.log(`  推定時間: 約${Math.ceil(estimatedTime)}分`);
    console.log('');
    
    // 統計初期化
    const stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: completed.size,
      totalRefs: 0,
      errors: [] as string[]
    };
    
    const startTime = Date.now();
    
    try {
      // ブラウザを初期化
      await this.scraper.initBrowser();
      
      // バッチ処理
      for (let i = 0; i < targetLaws.length; i += batchSize) {
        const batch = targetLaws.slice(i, i + batchSize);
        
        console.log(chalk.cyan(`\nバッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetLaws.length / batchSize)}`));
        
        for (const law of batch) {
          try {
            console.log(chalk.gray(`[${stats.processed + 1}/${targetLaws.length}] ${law.lawTitle || law.lawId}`));
            
            const refs = await this.scraper.scrapeLawReferences(law.lawId, false);
            
            if (refs.length > 0) {
              stats.succeeded++;
              stats.totalRefs += refs.length;
              console.log(chalk.green(`  ✓ ${refs.length}件の参照を検出`));
            } else {
              console.log(chalk.yellow(`  ⚠ 参照なし`));
            }
            
            completed.add(law.lawId);
            stats.processed++;
            
            // 遅延
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
          } catch (error: any) {
            stats.failed++;
            stats.errors.push(`${law.lawId}: ${error.message}`);
            console.log(chalk.red(`  ✗ エラー: ${error.message}`));
          }
          
          // 定期的に進捗を保存
          if (stats.processed % 50 === 0) {
            this.saveProgress(completed, stats);
            const elapsed = (Date.now() - startTime) / 1000 / 60;
            const rate = stats.processed / elapsed;
            const remaining = (targetLaws.length - stats.processed) / rate;
            
            console.log(chalk.blue(`\n📈 進捗レポート:`));
            console.log(`  処理済み: ${stats.processed}/${targetLaws.length} (${Math.round(stats.processed / targetLaws.length * 100)}%)`);
            console.log(`  成功: ${stats.succeeded}件 (${stats.totalRefs}参照)`);
            console.log(`  失敗: ${stats.failed}件`);
            console.log(`  処理速度: ${rate.toFixed(1)}法令/分`);
            console.log(`  残り時間: 約${Math.round(remaining)}分\n`);
          }
        }
        
        // バッチ間の休憩（サーバー負荷軽減）
        if (i + batchSize < targetLaws.length) {
          console.log(chalk.yellow('⏸ バッチ間休憩（10秒）'));
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
    } finally {
      await this.scraper.closeBrowser();
      
      // 最終進捗を保存
      this.saveProgress(completed, stats);
      
      // 最終統計
      const totalTime = (Date.now() - startTime) / 1000 / 60;
      
      console.log(chalk.cyan('\n' + '='.repeat(60)));
      console.log(chalk.cyan('📊 スクレイピング完了'));
      console.log(chalk.cyan('='.repeat(60)));
      console.log(chalk.green(`✅ 成功: ${stats.succeeded}件`));
      console.log(chalk.yellow(`⚠ 参照なし: ${stats.processed - stats.succeeded - stats.failed}件`));
      console.log(chalk.red(`✗ 失敗: ${stats.failed}件`));
      console.log(chalk.blue(`📚 総参照数: ${stats.totalRefs}件`));
      console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
      console.log(chalk.blue(`📈 処理速度: ${(stats.processed / totalTime).toFixed(1)}法令/分`));
      
      if (stats.errors.length > 0) {
        console.log(chalk.red('\n❌ エラー詳細（最初の10件）:'));
        stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
      }
      
      // キャッシュ統計
      await this.scraper.showStatistics();
    }
  }

  /**
   * キャッシュ状況を確認
   */
  checkCacheStatus(): void {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    const allLaws = this.loadLawList();
    
    let validCache = 0;
    let emptyCache = 0;
    let totalRefs = 0;
    
    files.forEach(file => {
      const data = JSON.parse(fs.readFileSync(path.join(this.cacheDir, file), 'utf-8'));
      if (Array.isArray(data) && data.length > 0) {
        validCache++;
        totalRefs += data.length;
      } else {
        emptyCache++;
      }
    });
    
    console.log(chalk.cyan('\n📊 キャッシュ状況'));
    console.log(chalk.gray('='.repeat(50)));
    console.log(`全法令数: ${allLaws.length}件`);
    console.log(`キャッシュ済み: ${files.length}件 (${(files.length / allLaws.length * 100).toFixed(1)}%)`);
    console.log(`  有効: ${validCache}件`);
    console.log(`  空: ${emptyCache}件`);
    console.log(`総参照数: ${totalRefs}件`);
    console.log(`平均参照数: ${validCache > 0 ? (totalRefs / validCache).toFixed(1) : 0}件/法令`);
    console.log(chalk.gray('='.repeat(50)));
  }
}

// CLI実行
if (require.main === module) {
  const scraper = new AllLawsScraper();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'scrape':
          await scraper.scrapeAll({
            limit: process.argv.includes('--limit') ? 
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
            skipExisting: !process.argv.includes('--force'),
            batchSize: process.argv.includes('--batch') ?
              parseInt(process.argv[process.argv.indexOf('--batch') + 1]) : 10,
            delayMs: process.argv.includes('--delay') ?
              parseInt(process.argv[process.argv.indexOf('--delay') + 1]) : 2000,
            resume: !process.argv.includes('--no-resume')
          });
          break;
          
        case 'status':
          scraper.checkCacheStatus();
          break;
          
        case 'test':
          // テストモード（最初の5件のみ）
          await scraper.scrapeAll({ limit: 5 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/scrape-all-laws.ts scrape [オプション]');
          console.log('  npx tsx scripts/scrape-all-laws.ts status');
          console.log('  npx tsx scripts/scrape-all-laws.ts test');
          console.log('\nオプション:');
          console.log('  --limit N     処理する法令数を制限');
          console.log('  --force       既存キャッシュを上書き');
          console.log('  --batch N     バッチサイズ（デフォルト: 10）');
          console.log('  --delay N     法令間の遅延ms（デフォルト: 2000）');
          console.log('  --no-resume   進捗を無視して最初から実行');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    }
  })();
}

export default AllLawsScraper;