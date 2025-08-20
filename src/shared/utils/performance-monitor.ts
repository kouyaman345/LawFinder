/**
 * パフォーマンス監視ユーティリティ
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * パフォーマンスメトリクス
 */
export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsed: number;
  cpuUsage?: NodeJS.CpuUsage;
  metadata?: Record<string, any>;
}

/**
 * 統計情報
 */
export interface PerformanceStats {
  operation: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  averageMemory: number;
}

/**
 * パフォーマンスモニタークラス
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private activeTimers: Map<string, { startTime: number; startMemory: number; startCpu?: NodeJS.CpuUsage }> = new Map();
  private reportPath: string;
  private autoSaveInterval?: NodeJS.Timeout;

  private constructor() {
    this.reportPath = process.env.PERF_REPORT_PATH || 'Report/performance';
    
    // 定期的に統計を保存
    if (process.env.PERF_AUTO_SAVE === 'true') {
      this.autoSaveInterval = setInterval(() => {
        this.saveReport();
      }, 60000); // 1分ごと
    }
    
    // プロセス終了時にレポート保存
    process.on('exit', () => {
      this.saveReport();
    });
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 計測開始
   */
  start(operation: string, metadata?: Record<string, any>): string {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    
    this.activeTimers.set(id, {
      startTime: Date.now(),
      startMemory: process.memoryUsage().heapUsed,
      startCpu: process.cpuUsage()
    });
    
    if (process.env.PERF_DEBUG === 'true') {
      console.log(chalk.gray(`⏱️  [PERF] Started: ${operation}`));
    }
    
    return id;
  }

  /**
   * 計測終了
   */
  end(id: string, metadata?: Record<string, any>): PerformanceMetrics | null {
    const timer = this.activeTimers.get(id);
    if (!timer) {
      console.warn(chalk.yellow(`⚠️  Timer not found: ${id}`));
      return null;
    }
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const endCpu = process.cpuUsage(timer.startCpu);
    
    const operation = id.split('_')[0];
    const metrics: PerformanceMetrics = {
      operation,
      startTime: timer.startTime,
      endTime,
      duration: endTime - timer.startTime,
      memoryUsed: endMemory - timer.startMemory,
      cpuUsage: endCpu,
      metadata
    };
    
    // メトリクスを保存
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(metrics);
    
    // タイマーを削除
    this.activeTimers.delete(id);
    
    if (process.env.PERF_DEBUG === 'true') {
      console.log(chalk.gray(
        `⏱️  [PERF] Completed: ${operation} (${metrics.duration}ms, ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB)`
      ));
    }
    
    return metrics;
  }

  /**
   * 非同期処理の計測
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const id = this.start(operation, metadata);
    
    try {
      const result = await fn();
      this.end(id, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.end(id, { ...metadata, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * 同期処理の計測
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const id = this.start(operation, metadata);
    
    try {
      const result = fn();
      this.end(id, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.end(id, { ...metadata, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(operation?: string): PerformanceStats[] {
    const stats: PerformanceStats[] = [];
    
    const operations = operation ? [operation] : Array.from(this.metrics.keys());
    
    for (const op of operations) {
      const metrics = this.metrics.get(op);
      if (!metrics || metrics.length === 0) continue;
      
      const durations = metrics.map(m => m.duration);
      const memories = metrics.map(m => m.memoryUsed);
      
      stats.push({
        operation: op,
        count: metrics.length,
        totalDuration: durations.reduce((a, b) => a + b, 0),
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        averageMemory: memories.reduce((a, b) => a + b, 0) / memories.length
      });
    }
    
    return stats;
  }

  /**
   * 統計をコンソールに表示
   */
  printStats(operation?: string): void {
    const stats = this.getStats(operation);
    
    if (stats.length === 0) {
      console.log(chalk.yellow('📊 No performance data available'));
      return;
    }
    
    console.log(chalk.cyan('\n📊 Performance Statistics'));
    console.log('='.repeat(80));
    
    const headers = ['Operation', 'Count', 'Total(ms)', 'Avg(ms)', 'Min(ms)', 'Max(ms)', 'Avg Mem(MB)'];
    const colWidths = [25, 8, 12, 10, 10, 10, 12];
    
    // ヘッダー表示
    console.log(
      headers.map((h, i) => h.padEnd(colWidths[i])).join('│')
    );
    console.log('─'.repeat(80));
    
    // データ表示
    for (const stat of stats) {
      const row = [
        stat.operation.substring(0, 24),
        stat.count.toString(),
        stat.totalDuration.toFixed(0),
        stat.averageDuration.toFixed(2),
        stat.minDuration.toFixed(0),
        stat.maxDuration.toFixed(0),
        (stat.averageMemory / 1024 / 1024).toFixed(2)
      ];
      
      console.log(
        row.map((r, i) => r.padEnd(colWidths[i])).join('│')
      );
    }
    
    console.log('='.repeat(80));
  }

  /**
   * レポートを保存
   */
  saveReport(filename?: string): void {
    const stats = this.getStats();
    if (stats.length === 0) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = filename || `${this.reportPath}/perf_${timestamp}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      stats,
      details: Array.from(this.metrics.entries()).map(([op, metrics]) => ({
        operation: op,
        metrics: metrics.slice(-100) // 最新100件のみ保存
      }))
    };
    
    try {
      const dir = path.dirname(reportFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      
      if (process.env.PERF_DEBUG === 'true') {
        console.log(chalk.green(`📊 Performance report saved: ${reportFile}`));
      }
    } catch (error) {
      console.error(chalk.red('Failed to save performance report:'), error);
    }
  }

  /**
   * メトリクスをクリア
   */
  clear(operation?: string): void {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.saveReport();
    this.clear();
  }
}

/**
 * グローバルインスタンス
 */
export const perfMonitor = PerformanceMonitor.getInstance();

/**
 * パフォーマンス計測デコレータ
 */
export function Measure(operation?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const opName = operation || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      return await perfMonitor.measure(
        opName,
        async () => originalMethod.apply(this, args),
        { args: args.length }
      );
    };
    
    return descriptor;
  };
}

/**
 * メモリ使用量をチェック
 */
export function checkMemoryUsage(): { used: number; total: number; percentage: number } {
  const used = process.memoryUsage().heapUsed;
  const total = require('os').totalmem();
  const percentage = (used / total) * 100;
  
  return {
    used: used / 1024 / 1024, // MB
    total: total / 1024 / 1024, // MB
    percentage
  };
}

/**
 * CPU使用率をチェック
 */
export function checkCPUUsage(): NodeJS.CpuUsage {
  return process.cpuUsage();
}