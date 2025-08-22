#!/usr/bin/env tsx
/**
 * パフォーマンスベンチマークツール
 * 商用環境での性能評価用
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface BenchmarkResult {
  testName: string;
  lawId: string;
  textLength: number;
  referenceCount: number;
  executionTime: number;
  memoryUsed: number;
  throughput: number; // 文字/秒
}

interface BenchmarkSummary {
  timestamp: string;
  totalTests: number;
  avgExecutionTime: number;
  avgMemoryUsed: number;
  avgThroughput: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  p50ExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  results: BenchmarkResult[];
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  
  /**
   * メモリ使用量を取得
   */
  private getMemoryUsage(): number {
    const mem = process.memoryUsage();
    return Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100; // MB
  }

  /**
   * 単一テストを実行
   */
  private async runSingleTest(
    testName: string,
    lawId: string,
    text: string
  ): Promise<BenchmarkResult> {
    const startMemory = this.getMemoryUsage();
    const startTime = Date.now();
    
    try {
      // CLIコマンドを実行
      const result = execSync(
        `npx tsx scripts/cli.ts ref detect "${text}" --law-id ${lawId}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      
      const endTime = Date.now();
      const endMemory = this.getMemoryUsage();
      
      // 結果から参照数を抽出
      const refCountMatch = result.match(/総参照数: (\d+)/);
      const referenceCount = refCountMatch ? parseInt(refCountMatch[1]) : 0;
      
      const executionTime = endTime - startTime;
      const memoryUsed = endMemory - startMemory;
      const throughput = text.length / (executionTime / 1000); // 文字/秒
      
      return {
        testName,
        lawId,
        textLength: text.length,
        referenceCount,
        executionTime,
        memoryUsed,
        throughput
      };
    } catch (error) {
      console.error(chalk.red(`テスト失敗: ${testName}`), error);
      return {
        testName,
        lawId,
        textLength: text.length,
        referenceCount: 0,
        executionTime: -1,
        memoryUsed: 0,
        throughput: 0
      };
    }
  }

  /**
   * ベンチマークテストケース
   */
  private getTestCases(): Array<{name: string, lawId: string, text: string}> {
    return [
      {
        name: '短文・単純参照',
        lawId: '129AC0000000089',
        text: '民法第90条の規定により無効とする。'
      },
      {
        name: '中文・複数参照',
        lawId: '129AC0000000089',
        text: '民法第90条及び第91条の規定により、商法第1条から第10条までの規定を準用する。前条の規定は適用しない。'
      },
      {
        name: '長文・複雑参照',
        lawId: '417AC0000000086',
        text: '第三百三十一条第一項（第三百三十五条第一項において準用する場合を含む。）、第三百三十三条第一項若しくは第三項又は第三百三十七条第一項若しくは第三項の規定により成立後の株式会社の取締役となることができない者は、それぞれ設立時取締役となることができない。第三百三十一条の二の規定は、設立時取締役及び設立時監査役について準用する。'
      },
      {
        name: '超長文・大量参照',
        lawId: '129AC0000000089',
        text: '民法第1条、第2条、第3条、第4条、第5条、第6条、第7条、第8条、第9条、第10条、' +
              '第11条、第12条、第13条、第14条、第15条、第16条、第17条、第18条、第19条、第20条、' +
              '第21条から第30条まで、第31条第1項、第32条第2項第3号、前条、次条、同法第90条、' +
              '商法（明治32年法律第48号）第1条、会社法第2条、労働基準法第1条の規定を適用する。' +
              'この場合において、第1項中「過半数」とあるのは「三分の二以上」と読み替えるものとする。'
      },
      {
        name: '実データ・民法第90条',
        lawId: '129AC0000000089',
        text: fs.readFileSync(
          path.join(__dirname, '..', 'laws_data', 'sample', '129AC0000000089.xml'),
          'utf-8'
        ).substring(0, 10000) // 最初の10000文字
      }
    ];
  }

  /**
   * ウォームアップ実行
   */
  private async warmup() {
    console.log(chalk.yellow('⏳ ウォームアップ中...'));
    await this.runSingleTest('warmup', '129AC0000000089', 'テスト');
    console.log(chalk.green('✅ ウォームアップ完了\n'));
  }

  /**
   * ベンチマークを実行
   */
  async run(iterations: number = 3): Promise<BenchmarkSummary> {
    console.log(chalk.cyan('🚀 パフォーマンスベンチマーク開始'));
    console.log('=' .repeat(80));
    
    await this.warmup();
    
    const testCases = this.getTestCases();
    
    for (const testCase of testCases) {
      console.log(chalk.blue(`\n📊 テスト: ${testCase.name}`));
      console.log(`  法令ID: ${testCase.lawId}`);
      console.log(`  テキスト長: ${testCase.text.length}文字`);
      
      const iterationResults: BenchmarkResult[] = [];
      
      for (let i = 0; i < iterations; i++) {
        process.stdout.write(`  実行 ${i + 1}/${iterations}... `);
        const result = await this.runSingleTest(
          testCase.name,
          testCase.lawId,
          testCase.text
        );
        iterationResults.push(result);
        
        if (result.executionTime > 0) {
          console.log(chalk.green(
            `✓ ${result.executionTime}ms, ` +
            `${result.referenceCount}参照, ` +
            `${Math.round(result.throughput)}文字/秒`
          ));
        } else {
          console.log(chalk.red('✗ 失敗'));
        }
      }
      
      // 平均値を計算して記録
      const validResults = iterationResults.filter(r => r.executionTime > 0);
      if (validResults.length > 0) {
        const avgResult: BenchmarkResult = {
          testName: testCase.name,
          lawId: testCase.lawId,
          textLength: testCase.text.length,
          referenceCount: Math.round(
            validResults.reduce((sum, r) => sum + r.referenceCount, 0) / validResults.length
          ),
          executionTime: Math.round(
            validResults.reduce((sum, r) => sum + r.executionTime, 0) / validResults.length
          ),
          memoryUsed: Math.round(
            validResults.reduce((sum, r) => sum + r.memoryUsed, 0) / validResults.length * 100
          ) / 100,
          throughput: Math.round(
            validResults.reduce((sum, r) => sum + r.throughput, 0) / validResults.length
          )
        };
        this.results.push(avgResult);
      }
    }
    
    return this.generateSummary();
  }

  /**
   * サマリーを生成
   */
  private generateSummary(): BenchmarkSummary {
    const validResults = this.results.filter(r => r.executionTime > 0);
    const executionTimes = validResults.map(r => r.executionTime).sort((a, b) => a - b);
    
    const summary: BenchmarkSummary = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      avgExecutionTime: Math.round(
        executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length
      ),
      avgMemoryUsed: Math.round(
        validResults.reduce((sum, r) => sum + r.memoryUsed, 0) / validResults.length * 100
      ) / 100,
      avgThroughput: Math.round(
        validResults.reduce((sum, r) => sum + r.throughput, 0) / validResults.length
      ),
      minExecutionTime: executionTimes[0] || 0,
      maxExecutionTime: executionTimes[executionTimes.length - 1] || 0,
      p50ExecutionTime: this.percentile(executionTimes, 50),
      p95ExecutionTime: this.percentile(executionTimes, 95),
      p99ExecutionTime: this.percentile(executionTimes, 99),
      results: this.results
    };
    
    return summary;
  }

  /**
   * パーセンタイルを計算
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * 結果を表示
   */
  displayResults(summary: BenchmarkSummary) {
    console.log('\n' + '=' .repeat(80));
    console.log(chalk.cyan('📈 ベンチマーク結果サマリー'));
    console.log('=' .repeat(80));
    
    console.log('\n' + chalk.yellow('⚡ パフォーマンス指標:'));
    console.log(`  平均実行時間: ${chalk.green(summary.avgExecutionTime + 'ms')}`);
    console.log(`  最小実行時間: ${chalk.green(summary.minExecutionTime + 'ms')}`);
    console.log(`  最大実行時間: ${chalk.yellow(summary.maxExecutionTime + 'ms')}`);
    console.log(`  P50: ${summary.p50ExecutionTime}ms`);
    console.log(`  P95: ${summary.p95ExecutionTime}ms`);
    console.log(`  P99: ${summary.p99ExecutionTime}ms`);
    
    console.log('\n' + chalk.yellow('💾 メモリ使用量:'));
    console.log(`  平均メモリ: ${chalk.green(summary.avgMemoryUsed + 'MB')}`);
    
    console.log('\n' + chalk.yellow('📊 スループット:'));
    console.log(`  平均処理速度: ${chalk.green(summary.avgThroughput + '文字/秒')}`);
    
    console.log('\n' + chalk.yellow('📝 詳細結果:'));
    console.table(
      summary.results.map(r => ({
        テスト: r.testName,
        '文字数': r.textLength,
        '参照数': r.referenceCount,
        '実行時間(ms)': r.executionTime,
        'メモリ(MB)': r.memoryUsed,
        '速度(文字/秒)': r.throughput
      }))
    );
    
    // 結果をファイルに保存
    const reportPath = path.join(__dirname, '..', 'Report', 'benchmark_result.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    console.log(`\n📄 詳細レポート: ${reportPath}`);
  }

  /**
   * 性能評価
   */
  evaluatePerformance(summary: BenchmarkSummary) {
    console.log('\n' + '=' .repeat(80));
    console.log(chalk.cyan('🎯 性能評価'));
    console.log('=' .repeat(80));
    
    const criteria = {
      excellent: { time: 50, memory: 50, throughput: 10000 },
      good: { time: 100, memory: 100, throughput: 5000 },
      acceptable: { time: 200, memory: 200, throughput: 2000 }
    };
    
    // 実行時間の評価
    let timeGrade = '❌ 要改善';
    if (summary.avgExecutionTime <= criteria.excellent.time) {
      timeGrade = '🌟 優秀';
    } else if (summary.avgExecutionTime <= criteria.good.time) {
      timeGrade = '✅ 良好';
    } else if (summary.avgExecutionTime <= criteria.acceptable.time) {
      timeGrade = '⭕ 許容範囲';
    }
    
    // メモリの評価
    let memoryGrade = '❌ 要改善';
    if (summary.avgMemoryUsed <= criteria.excellent.memory) {
      memoryGrade = '🌟 優秀';
    } else if (summary.avgMemoryUsed <= criteria.good.memory) {
      memoryGrade = '✅ 良好';
    } else if (summary.avgMemoryUsed <= criteria.acceptable.memory) {
      memoryGrade = '⭕ 許容範囲';
    }
    
    // スループットの評価
    let throughputGrade = '❌ 要改善';
    if (summary.avgThroughput >= criteria.excellent.throughput) {
      throughputGrade = '🌟 優秀';
    } else if (summary.avgThroughput >= criteria.good.throughput) {
      throughputGrade = '✅ 良好';
    } else if (summary.avgThroughput >= criteria.acceptable.throughput) {
      throughputGrade = '⭕ 許容範囲';
    }
    
    console.log(`  実行時間: ${timeGrade}`);
    console.log(`  メモリ使用: ${memoryGrade}`);
    console.log(`  スループット: ${throughputGrade}`);
    
    // 総合評価
    const grades = [timeGrade, memoryGrade, throughputGrade];
    const excellentCount = grades.filter(g => g.includes('🌟')).length;
    const goodCount = grades.filter(g => g.includes('✅')).length;
    
    console.log('\n' + chalk.yellow('📊 総合評価:'));
    if (excellentCount >= 2) {
      console.log(chalk.green('  🏆 商用レベル - 優秀な性能です！'));
    } else if (excellentCount + goodCount >= 2) {
      console.log(chalk.green('  ✅ 商用レベル - 十分な性能です'));
    } else {
      console.log(chalk.yellow('  ⚠️ 改善推奨 - パフォーマンス最適化が必要です'));
    }
  }
}

// メイン実行
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  const iterations = process.argv[2] ? parseInt(process.argv[2]) : 3;
  
  benchmark.run(iterations)
    .then(summary => {
      benchmark.displayResults(summary);
      benchmark.evaluatePerformance(summary);
    })
    .catch(error => {
      console.error(chalk.red('ベンチマークエラー:'), error);
      process.exit(1);
    });
}

export { PerformanceBenchmark, BenchmarkResult, BenchmarkSummary };