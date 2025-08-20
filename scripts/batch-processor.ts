#!/usr/bin/env npx tsx

/**
 * 全法令バッチ処理システム
 * 中断・再開可能、リアルタイム進捗表示付き
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

const BATCH_SIZE = 100; // バッチサイズ
const CHECKPOINT_DIR = 'Report/checkpoints';
const CHECKPOINT_FILE = 'batch_processing_state.json';

interface ProcessingState {
  startTime: string;
  lastUpdate: string;
  totalLaws: number;
  processedLaws: number;
  currentBatch: number;
  totalBatches: number;
  results: {
    totalReferences: number;
    totalArticles: number;
    totalMatched: number;
    totalMissed: number;
    totalExtra: number;
    errors: number;
  };
  batches: {
    [batchNum: number]: {
      lawIds: string[];
      processed: boolean;
      results?: any;
      processingTime?: number;
    };
  };
}

/**
 * 処理状態を読み込む
 */
function loadState(): ProcessingState | null {
  const statePath = path.join(CHECKPOINT_DIR, CHECKPOINT_FILE);
  if (existsSync(statePath)) {
    try {
      const content = readFileSync(statePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.log(chalk.yellow('⚠️ 既存の状態ファイルが破損しています。新規開始します。'));
    }
  }
  return null;
}

/**
 * 処理状態を保存する
 */
function saveState(state: ProcessingState) {
  if (!existsSync(CHECKPOINT_DIR)) {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
  const statePath = path.join(CHECKPOINT_DIR, CHECKPOINT_FILE);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * 進捗状況を表示
 */
function displayProgress(state: ProcessingState) {
  const progress = (state.processedLaws / state.totalLaws * 100).toFixed(2);
  const elapsedMs = Date.now() - new Date(state.startTime).getTime();
  const elapsedSec = elapsedMs / 1000;
  const avgTimePerLaw = elapsedSec / state.processedLaws;
  const remainingLaws = state.totalLaws - state.processedLaws;
  const estimatedRemainingSec = remainingLaws * avgTimePerLaw;
  
  console.clear();
  console.log(chalk.cyan('=' .repeat(80)));
  console.log(chalk.cyan.bold('📊 全法令処理 - 進捗状況'));
  console.log(chalk.cyan('=' .repeat(80)));
  
  // プログレスバー
  const barLength = 50;
  const completed = Math.floor(barLength * state.processedLaws / state.totalLaws);
  const remaining = barLength - completed;
  const progressBar = chalk.green('█'.repeat(completed)) + chalk.gray('░'.repeat(remaining));
  
  console.log(`\n進捗: ${progressBar} ${progress}%`);
  console.log(`\n処理済み: ${chalk.green(state.processedLaws.toLocaleString())} / ${state.totalLaws.toLocaleString()} 法令`);
  console.log(`バッチ: ${state.currentBatch} / ${state.totalBatches}`);
  
  console.log(chalk.yellow('\n⏱️ 時間統計:'));
  console.log(`  経過時間: ${formatTime(elapsedSec)}`);
  console.log(`  推定残り時間: ${formatTime(estimatedRemainingSec)}`);
  console.log(`  平均処理時間: ${avgTimePerLaw.toFixed(2)}秒/法令`);
  
  console.log(chalk.magenta('\n📈 検出統計:'));
  console.log(`  総参照数: ${state.results.totalReferences.toLocaleString()}`);
  console.log(`  総条文数: ${state.results.totalArticles.toLocaleString()}`);
  console.log(`  マッチ数: ${state.results.totalMatched.toLocaleString()}`);
  console.log(`  エラー: ${state.results.errors}`);
  
  // 最新のバッチ情報
  const lastBatch = state.batches[state.currentBatch - 1];
  if (lastBatch && lastBatch.processingTime) {
    console.log(chalk.gray(`\n最終バッチ処理時間: ${lastBatch.processingTime.toFixed(1)}秒`));
  }
  
  console.log(chalk.cyan('\n' + '=' .repeat(80)));
  console.log(chalk.gray('Ctrl+C で中断（後で再開可能）'));
}

/**
 * 時間をフォーマット
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}時間${minutes}分${secs}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

/**
 * バッチを処理
 */
async function processBatch(lawIds: string[], batchNum: number): Promise<any> {
  const { UltimateReferenceDetector, extractArticlesFromXML, extractBaselineReferences } = require('./detector');
  const detector = new UltimateReferenceDetector(false);
  
  const results = {
    laws: [] as any[],
    totalReferences: 0,
    totalArticles: 0,
    totalMatched: 0,
    totalMissed: 0,
    totalExtra: 0,
    errors: 0
  };
  
  for (const lawId of lawIds) {
    try {
      // XMLファイルを探す
      const xmlPath = await findXMLFile(lawId);
      if (!xmlPath) {
        results.errors++;
        continue;
      }
      
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      
      // ベースライン参照を抽出
      const baselineRefs = extractBaselineReferences(xmlContent);
      
      // 条文を抽出して参照検出
      const articles = extractArticlesFromXML(xmlContent);
      const ourRefs: any[] = [];
      
      for (const article of articles) {
        const refs = await detector.detectReferences(article.content, lawId, '');
        ourRefs.push(...refs);
      }
      
      // 統計更新
      results.totalReferences += ourRefs.length;
      results.totalArticles += articles.length;
      
      // マッチング計算
      const baselineTexts = new Set(baselineRefs.map((r: any) => r.text.trim()));
      const ourTexts = new Set(ourRefs.map(r => r.text.trim()));
      
      for (const text of ourTexts) {
        if (baselineTexts.has(text)) {
          results.totalMatched++;
        } else {
          results.totalExtra++;
        }
      }
      
      for (const text of baselineTexts) {
        if (!ourTexts.has(text)) {
          results.totalMissed++;
        }
      }
      
      results.laws.push({
        lawId,
        articles: articles.length,
        references: ourRefs.length,
        baseline: baselineRefs.length
      });
      
    } catch (error) {
      results.errors++;
    }
  }
  
  return results;
}

/**
 * XMLファイルを検索
 */
async function findXMLFile(lawId: string): Promise<string | null> {
  const { readdirSync } = require('fs');
  const basePath = 'laws_data';
  
  try {
    const dirs = readdirSync(basePath);
    for (const dir of dirs) {
      if (dir.startsWith(lawId)) {
        const dirPath = path.join(basePath, dir);
        const files = readdirSync(dirPath);
        const xmlFile = files.find((f: string) => f.endsWith('.xml'));
        if (xmlFile) {
          return path.join(dirPath, xmlFile);
        }
      }
    }
  } catch (error) {
    // エラーは無視
  }
  
  return null;
}

/**
 * メイン処理
 */
export async function processAllLaws(resume: boolean = true) {
  // 既存の状態を読み込むか新規作成
  let state = resume ? loadState() : null;
  
  if (!state) {
    console.log(chalk.cyan('🚀 新規処理を開始します...'));
    
    // CSVから法令リストを取得
    const csvPath = 'laws_data/all_law_list.csv';
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1).filter(line => line.trim());
    
    const lawIds = lines.map(line => {
      const columns = line.split(',');
      if (columns.length >= 12) {
        return columns[11] ? columns[11].trim() : null;
      }
      return null;
    }).filter(id => id) as string[];
    
    const totalBatches = Math.ceil(lawIds.length / BATCH_SIZE);
    
    // バッチに分割
    const batches: ProcessingState['batches'] = {};
    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, lawIds.length);
      batches[i + 1] = {
        lawIds: lawIds.slice(start, end),
        processed: false
      };
    }
    
    state = {
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      totalLaws: lawIds.length,
      processedLaws: 0,
      currentBatch: 1,
      totalBatches,
      results: {
        totalReferences: 0,
        totalArticles: 0,
        totalMatched: 0,
        totalMissed: 0,
        totalExtra: 0,
        errors: 0
      },
      batches
    };
    
    saveState(state);
  } else {
    console.log(chalk.green(`✅ 既存の処理を再開します（${state.processedLaws}/${state.totalLaws}法令完了）`));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 中断ハンドラー
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️ 処理を中断しています...'));
    saveState(state!);
    console.log(chalk.green('✅ 状態を保存しました。後で再開できます。'));
    process.exit(0);
  });
  
  // バッチ処理
  for (let batchNum = state.currentBatch; batchNum <= state.totalBatches; batchNum++) {
    const batch = state.batches[batchNum];
    
    if (batch.processed) {
      state.processedLaws += batch.lawIds.length;
      continue;
    }
    
    displayProgress(state);
    
    const startTime = Date.now();
    const spinner = ora(`バッチ ${batchNum}/${state.totalBatches} を処理中...`).start();
    
    try {
      const results = await processBatch(batch.lawIds, batchNum);
      
      // 結果を統合
      state.results.totalReferences += results.totalReferences;
      state.results.totalArticles += results.totalArticles;
      state.results.totalMatched += results.totalMatched;
      state.results.totalMissed += results.totalMissed;
      state.results.totalExtra += results.totalExtra;
      state.results.errors += results.errors;
      
      // バッチを完了としてマーク
      batch.processed = true;
      batch.results = results;
      batch.processingTime = (Date.now() - startTime) / 1000;
      
      state.processedLaws += batch.lawIds.length;
      state.currentBatch = batchNum + 1;
      state.lastUpdate = new Date().toISOString();
      
      spinner.succeed(`バッチ ${batchNum} 完了（${batch.processingTime?.toFixed(1)}秒）`);
      
      // 状態を保存
      saveState(state);
      
      // バッチごとの結果も保存
      const batchReportPath = path.join(CHECKPOINT_DIR, `batch_${batchNum}_results.json`);
      writeFileSync(batchReportPath, JSON.stringify(results, null, 2));
      
    } catch (error) {
      spinner.fail(`バッチ ${batchNum} でエラーが発生`);
      console.error(error);
      state.results.errors++;
      saveState(state);
    }
  }
  
  // 最終結果を表示
  displayProgress(state);
  console.log(chalk.green('\n\n✅ 全法令の処理が完了しました！'));
  
  // 最終レポートを生成
  const finalReport = {
    ...state,
    completedAt: new Date().toISOString(),
    processingTimeSeconds: (Date.now() - new Date(state.startTime).getTime()) / 1000
  };
  
  const reportPath = `Report/all_laws_processing_${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
  console.log(chalk.green(`\n📊 最終レポート: ${reportPath}`));
  
  // 精度指標を計算
  const precision = state.results.totalReferences > 0 
    ? (state.results.totalMatched / state.results.totalReferences * 100) 
    : 0;
  const recall = (state.results.totalMatched + state.results.totalMissed) > 0
    ? (state.results.totalMatched / (state.results.totalMatched + state.results.totalMissed) * 100)
    : 0;
  const f1 = precision + recall > 0 
    ? (2 * precision * recall / (precision + recall))
    : 0;
  
  console.log(chalk.yellow('\n📈 最終精度指標:'));
  console.log(`  精度(Precision): ${precision.toFixed(2)}%`);
  console.log(`  再現率(Recall): ${recall.toFixed(2)}%`);
  console.log(`  F1スコア: ${f1.toFixed(2)}%`);
}

// CLIから実行された場合
if (require.main === module) {
  const args = process.argv.slice(2);
  const resume = !args.includes('--new');
  
  processAllLaws(resume).catch(console.error);
}