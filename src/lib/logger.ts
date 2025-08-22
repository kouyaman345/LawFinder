/**
 * 統合ロギングシステム
 * 商用環境での監視・デバッグ用
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
  context?: {
    lawId?: string;
    articleNumber?: string;
    detectionPhase?: string;
    processingTime?: number;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logFile?: string;
  private buffer: LogEntry[] = [];
  private bufferSize = 100;
  private performanceMetrics: Map<string, number[]> = new Map();

  private constructor() {
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    
    if (process.env.LOG_FILE) {
      this.logFile = path.resolve(process.env.LOG_FILE);
      this.ensureLogDirectory();
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'FATAL': return LogLevel.FATAL;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDirectory() {
    if (this.logFile) {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private formatLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return chalk.gray('DEBUG');
      case LogLevel.INFO: return chalk.blue('INFO');
      case LogLevel.WARN: return chalk.yellow('WARN');
      case LogLevel.ERROR: return chalk.red('ERROR');
      case LogLevel.FATAL: return chalk.bgRed.white('FATAL');
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private writeToFile(entry: LogEntry) {
    if (!this.logFile) return;

    const logLine = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString()
    }) + '\n';

    fs.appendFileSync(this.logFile, logLine);
  }

  private writeToConsole(entry: LogEntry) {
    const timestamp = chalk.gray(entry.timestamp.toISOString());
    const level = this.formatLevel(entry.level);
    const message = entry.message;
    
    let output = `${timestamp} ${level} ${message}`;
    
    if (entry.context) {
      output += chalk.gray(` [${JSON.stringify(entry.context)}]`);
    }
    
    if (entry.error) {
      output += '\n' + chalk.red(entry.error.stack || entry.error.message);
    }

    console.log(output);
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.flush();
    }

    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: any) {
    this.log(LogLevel.ERROR, message, data, error);
  }

  fatal(message: string, error?: Error, data?: any) {
    this.log(LogLevel.FATAL, message, data, error);
    this.flush(); // 致命的エラーは即座にフラッシュ
  }

  /**
   * パフォーマンス測定開始
   */
  startTimer(label: string): void {
    const metrics = this.performanceMetrics.get(label) || [];
    metrics.push(Date.now());
    this.performanceMetrics.set(label, metrics);
  }

  /**
   * パフォーマンス測定終了
   */
  endTimer(label: string): number {
    const metrics = this.performanceMetrics.get(label);
    if (!metrics || metrics.length === 0) {
      this.warn(`Timer '${label}' was not started`);
      return 0;
    }

    const startTime = metrics.pop()!;
    const duration = Date.now() - startTime;
    
    this.debug(`Performance: ${label}`, { duration: `${duration}ms` });
    
    if (metrics.length === 0) {
      this.performanceMetrics.delete(label);
    }

    return duration;
  }

  /**
   * 検出結果のサマリーログ
   */
  logDetectionSummary(lawId: string, references: any[], processingTime: number) {
    const summary = {
      lawId,
      totalReferences: references.length,
      byType: this.groupByType(references),
      processingTime: `${processingTime}ms`,
      avgConfidence: this.calculateAvgConfidence(references)
    };

    this.info('Detection Summary', summary);
  }

  private groupByType(references: any[]): Record<string, number> {
    const groups: Record<string, number> = {};
    references.forEach(ref => {
      groups[ref.type] = (groups[ref.type] || 0) + 1;
    });
    return groups;
  }

  private calculateAvgConfidence(references: any[]): number {
    if (references.length === 0) return 0;
    const sum = references.reduce((acc, ref) => acc + (ref.confidence || 0), 0);
    return Math.round((sum / references.length) * 100) / 100;
  }

  /**
   * バッファをフラッシュ
   */
  flush() {
    if (this.buffer.length === 0) return;
    
    if (this.logFile) {
      const lines = this.buffer.map(entry => JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      })).join('\n') + '\n';
      
      fs.appendFileSync(this.logFile, lines);
    }
    
    this.buffer = [];
  }

  /**
   * ログレベルを動的に変更
   */
  setLogLevel(level: LogLevel | string) {
    if (typeof level === 'string') {
      this.logLevel = this.parseLogLevel(level);
    } else {
      this.logLevel = level;
    }
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): any {
    return {
      bufferSize: this.buffer.length,
      performanceMetrics: Array.from(this.performanceMetrics.entries()).map(([key, values]) => ({
        label: key,
        activeTimers: values.length
      }))
    };
  }
}

// シングルトンインスタンスをエクスポート
export const logger = Logger.getInstance();