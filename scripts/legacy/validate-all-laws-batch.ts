#!/usr/bin/env tsx

/**
 * 全法令データバッチ検証スクリプト（メモリ効率版）
 * メモリ不足を回避するため、小バッチで処理して結果を逐次保存
 */

import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

interface BatchResult {
  batchNumber: number;
  startIndex: number;
  endIndex: number;
  processedCount: number;
  results: any[];
  processingTimeMs: number;
  memoryUsage: NodeJS.MemoryUsage;
}

class BatchLawValidator {
  private detector: EnhancedReferenceDetectorV41;
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  private resultsPath = '/home/coffee/projects/LawFinder/validation_results';
  private batchSize = 50; // 小さいバッチサイズでメモリ管理
  private totalProcessed = 0;
  private totalLaws = 0;
  private startTime: number;
  
  constructor() {
    // キャッシュを無効化してメモリ使用量を削減
    this.detector = new EnhancedReferenceDetectorV41({ enableCache: false });
    
    // 結果ディレクトリの作成
    if (!existsSync(this.resultsPath)) {
      mkdirSync(this.resultsPath, { recursive: true });
    }
  }
  
  /**
   * バッチ処理で全法令を検証
   */
  async validateAllInBatches(): Promise<void> {
    console.log('='.repeat(80));
    console.log('📚 全法令データバッチ検証（メモリ効率版）');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log(`バッチサイズ: ${this.batchSize}件/バッチ`);
    console.log();
    
    this.startTime = Date.now();
    
    // 法令ディレクトリの取得
    const lawDirs = this.getLawDirectories();
    this.totalLaws = lawDirs.length;
    console.log(`総法令数: ${this.totalLaws.toLocaleString()}件`);
    console.log(`総バッチ数: ${Math.ceil(this.totalLaws / this.batchSize)}バッチ`);
    console.log();
    
    // 結果ファイルの初期化
    const summaryPath = join(this.resultsPath, 'batch_summary.jsonl');
    writeFileSync(summaryPath, ''); // クリア
    
    // バッチ処理
    const totalBatches = Math.ceil(this.totalLaws / this.batchSize);
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const startIdx = batchNum * this.batchSize;
      const endIdx = Math.min(startIdx + this.batchSize, this.totalLaws);
      const batchDirs = lawDirs.slice(startIdx, endIdx);
      
      console.log(`\nバッチ ${batchNum + 1}/${totalBatches} 処理中...`);
      console.log(`  範囲: ${startIdx + 1} - ${endIdx} / ${this.totalLaws}`);
      
      const batchStartTime = Date.now();
      const batchResults = [];
      
      // バッチ内の法令を処理
      for (const dir of batchDirs) {
        const result = await this.validateSingleLaw(dir);
        if (result) {
          batchResults.push(result);
        }
        this.totalProcessed++;
        
        // 進捗表示
        if (this.totalProcessed % 10 === 0) {
          const progress = (this.totalProcessed / this.totalLaws * 100).toFixed(1);
          process.stdout.write(`\r  進捗: ${progress}% (${this.totalProcessed}/${this.totalLaws})`);
        }
      }
      
      const batchTime = Date.now() - batchStartTime;
      
      // バッチ結果を保存
      const batchResult: BatchResult = {
        batchNumber: batchNum + 1,
        startIndex: startIdx,
        endIndex: endIdx,
        processedCount: batchResults.length,
        results: batchResults,
        processingTimeMs: batchTime,
        memoryUsage: process.memoryUsage()
      };
      
      // JSONL形式で追記（メモリ効率的）
      appendFileSync(summaryPath, JSON.stringify(batchResult) + '\n');
      
      // バッチごとの詳細も保存
      const batchPath = join(this.resultsPath, `batch_${String(batchNum + 1).padStart(4, '0')}.json`);
      writeFileSync(batchPath, JSON.stringify(batchResult, null, 2));
      
      console.log();
      console.log(`  バッチ処理時間: ${(batchTime / 1000).toFixed(1)}秒`);
      console.log(`  メモリ使用量: ${(batchResult.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);
      
      // 強制的なガベージコレクション（メモリ解放）
      if (global.gc) {
        global.gc();
        console.log('  GC実行済み');
      }
      
      // メモリ使用量が高い場合は警告
      if (batchResult.memoryUsage.heapUsed > 2 * 1024 * 1024 * 1024) {
        console.log(`  ⚠️ メモリ使用量が高くなっています: ${(batchResult.memoryUsage.heapUsed / 1024 / 1024 / 1024).toFixed(2)}GB`);
      }
    }
    
    const totalTime = Date.now() - this.startTime;
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 全バッチ処理完了');
    console.log('='.repeat(80));
    console.log(`総処理時間: ${(totalTime / 1000 / 60).toFixed(1)}分`);
    console.log(`平均処理時間: ${(totalTime / this.totalLaws).toFixed(0)}ms/法令`);
    console.log();
    console.log(`結果保存先: ${this.resultsPath}`);
    
    // 最終集計
    this.generateFinalReport();
  }
  
  /**
   * 法令ディレクトリの取得
   */
  private getLawDirectories(): string[] {
    const entries = readdirSync(this.lawsDataPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .filter(name => name !== 'sample' && name !== 'all_law_list.csv');
  }
  
  /**
   * 単一法令の検証（簡略版）
   */
  private async validateSingleLaw(dirName: string): Promise<any | null> {
    const lawPath = join(this.lawsDataPath, dirName);
    const xmlFiles = readdirSync(lawPath).filter(f => f.endsWith('.xml'));
    
    if (xmlFiles.length === 0) return null;
    
    const xmlPath = join(lawPath, xmlFiles[0]);
    
    try {
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      
      // 簡易パース（DOMを作らずに正規表現で処理してメモリ節約）
      const lawNameMatch = xmlContent.match(/<LawName>([^<]+)<\/LawName>/);
      const lawName = lawNameMatch ? lawNameMatch[1] : dirName;
      const lawId = dirName.split('_')[0];
      
      // 条文数のカウント（簡易）
      const articleMatches = xmlContent.match(/<Article\s+Num="[^"]+"/g);
      const articleCount = articleMatches ? articleMatches.length : 0;
      
      // 参照検出（主要な条文のみサンプリング）
      let totalReferences = 0;
      let sampleCount = Math.min(10, articleCount); // 最大10条文をサンプリング
      
      if (articleMatches && sampleCount > 0) {
        // ランダムサンプリング
        for (let i = 0; i < sampleCount; i++) {
          const idx = Math.floor(Math.random() * articleMatches.length);
          const articleMatch = xmlContent.match(new RegExp(`<Article[^>]*Num="${idx + 1}"[^>]*>([\\s\\S]*?)</Article>`));
          
          if (articleMatch) {
            const articleText = articleMatch[1].replace(/<[^>]+>/g, ''); // タグ除去
            const refs = this.detector.detectReferences(articleText, `第${idx + 1}条`);
            totalReferences += refs.length;
          }
        }
        
        // サンプリングから全体を推定
        if (sampleCount > 0) {
          totalReferences = Math.round(totalReferences * articleCount / sampleCount);
        }
      }
      
      return {
        lawId,
        lawName,
        dirName,
        totalArticles: articleCount,
        estimatedReferences: totalReferences,
        sampled: true
      };
      
    } catch (error) {
      // エラーは無視して続行
      return null;
    }
  }
  
  /**
   * 最終レポート生成
   */
  private generateFinalReport(): void {
    const summaryPath = join(this.resultsPath, 'batch_summary.jsonl');
    const lines = readFileSync(summaryPath, 'utf-8').split('\n').filter(l => l);
    
    let totalArticles = 0;
    let totalReferences = 0;
    let processedLaws = 0;
    
    lines.forEach(line => {
      const batch = JSON.parse(line) as BatchResult;
      batch.results.forEach(r => {
        totalArticles += r.totalArticles;
        totalReferences += r.estimatedReferences;
        processedLaws++;
      });
    });
    
    const report = {
      timestamp: new Date().toISOString(),
      totalLaws: this.totalLaws,
      processedLaws,
      totalArticles,
      estimatedTotalReferences: totalReferences,
      avgReferencesPerArticle: totalArticles > 0 ? totalReferences / totalArticles : 0,
      avgReferencesPerLaw: processedLaws > 0 ? totalReferences / processedLaws : 0,
      processingTimeSeconds: (Date.now() - this.startTime) / 1000
    };
    
    const reportPath = join(this.resultsPath, 'final_report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 最終統計:');
    console.log(`  処理法令数: ${processedLaws.toLocaleString()}/${this.totalLaws.toLocaleString()}`);
    console.log(`  総条文数: ${totalArticles.toLocaleString()}`);
    console.log(`  推定総参照数: ${totalReferences.toLocaleString()}`);
    console.log(`  平均参照数/条文: ${report.avgReferencesPerArticle.toFixed(1)}`);
    console.log(`  平均参照数/法令: ${report.avgReferencesPerLaw.toFixed(1)}`);
  }
}

// メイン実行
async function main() {
  console.log('メモリ効率版バッチ処理を開始します...');
  console.log('※ このスクリプトはメモリ使用量を最小限に抑えるよう設計されています');
  console.log();
  
  const validator = new BatchLawValidator();
  await validator.validateAllInBatches();
}

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('\n❌ 予期しないエラー:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ 未処理のPromise拒否:', reason);
  process.exit(1);
});

main().catch(console.error);