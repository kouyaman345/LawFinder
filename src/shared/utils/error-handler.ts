/**
 * 統一エラーハンドリングユーティリティ
 */

import chalk from 'chalk';

/**
 * カスタムエラークラス
 */
export class LawFinderError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'LawFinderError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * エラータイプ定義
 */
export enum ErrorCode {
  // データベース関連
  DB_CONNECTION_ERROR = 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR = 'DB_QUERY_ERROR',
  DB_TRANSACTION_ERROR = 'DB_TRANSACTION_ERROR',
  
  // 参照検出関連
  DETECTION_ERROR = 'DETECTION_ERROR',
  INVALID_LAW_ID = 'INVALID_LAW_ID',
  INVALID_ARTICLE_NUMBER = 'INVALID_ARTICLE_NUMBER',
  
  // ファイル操作関連
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  XML_PARSE_ERROR = 'XML_PARSE_ERROR',
  
  // ネットワーク関連
  API_ERROR = 'API_ERROR',
  NEO4J_CONNECTION_ERROR = 'NEO4J_CONNECTION_ERROR',
  LLM_CONNECTION_ERROR = 'LLM_CONNECTION_ERROR',
  
  // バリデーション関連
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // その他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR'
}

/**
 * エラーログレベル
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

/**
 * エラーハンドラクラス
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private logFile?: string;
  private isProduction: boolean;

  private constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logFile = process.env.ERROR_LOG_FILE;
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * エラーをハンドリング
   */
  handle(error: Error | LawFinderError, context?: string): void {
    const timestamp = new Date().toISOString();
    const errorInfo = this.formatError(error, context);
    
    // コンソールに出力
    this.logToConsole(errorInfo);
    
    // ファイルに記録（本番環境）
    if (this.isProduction && this.logFile) {
      this.logToFile(errorInfo);
    }
    
    // 開発環境ではスタックトレースも表示
    if (!this.isProduction && error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }

  /**
   * エラーを再スロー可能な形式でハンドリング
   */
  handleAndThrow(error: Error | LawFinderError, context?: string): never {
    this.handle(error, context);
    
    if (error instanceof LawFinderError) {
      throw error;
    }
    
    throw new LawFinderError(
      error.message,
      ErrorCode.UNKNOWN_ERROR,
      500,
      { originalError: error.name }
    );
  }

  /**
   * 非同期処理のエラーハンドリング
   */
  async handleAsync<T>(
    promise: Promise<T>,
    context?: string
  ): Promise<T | null> {
    try {
      return await promise;
    } catch (error) {
      this.handle(error as Error, context);
      return null;
    }
  }

  /**
   * リトライ付きエラーハンドリング
   */
  async retry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000,
    context?: string
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (i < retries - 1) {
          this.log(
            LogLevel.WARN,
            `リトライ ${i + 1}/${retries}: ${error.message}`,
            context
          );
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    
    this.handleAndThrow(
      lastError || new Error('Unknown error in retry'),
      context
    );
  }

  /**
   * エラー情報をフォーマット
   */
  private formatError(error: Error | LawFinderError, context?: string): string {
    const timestamp = new Date().toISOString();
    let errorInfo = `[${timestamp}]`;
    
    if (context) {
      errorInfo += ` [${context}]`;
    }
    
    if (error instanceof LawFinderError) {
      errorInfo += ` [${error.code}]`;
      errorInfo += ` ${error.message}`;
      
      if (error.details) {
        errorInfo += ` Details: ${JSON.stringify(error.details)}`;
      }
    } else {
      errorInfo += ` [${ErrorCode.UNKNOWN_ERROR}]`;
      errorInfo += ` ${error.message}`;
    }
    
    return errorInfo;
  }

  /**
   * コンソールにログ出力
   */
  private logToConsole(message: string): void {
    if (message.includes('[FATAL]')) {
      console.error(chalk.red.bold(message));
    } else if (message.includes('[ERROR]')) {
      console.error(chalk.red(message));
    } else if (message.includes('[WARN]')) {
      console.warn(chalk.yellow(message));
    } else if (message.includes('[INFO]')) {
      console.info(chalk.blue(message));
    } else {
      console.log(message);
    }
  }

  /**
   * ファイルにログ出力
   */
  private logToFile(message: string): void {
    if (!this.logFile) return;
    
    try {
      const fs = require('fs');
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error(chalk.red('ログファイルへの書き込みに失敗:', error));
    }
  }

  /**
   * 汎用ログメソッド
   */
  log(level: LogLevel, message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}]`;
    
    if (context) {
      logMessage += ` [${context}]`;
    }
    
    logMessage += ` ${message}`;
    
    this.logToConsole(logMessage);
    
    if (this.isProduction && this.logFile) {
      this.logToFile(logMessage);
    }
  }
}

/**
 * グローバルエラーハンドラのエクスポート
 */
export const errorHandler = ErrorHandler.getInstance();

/**
 * エラーハンドリングデコレータ
 */
export function HandleError(context?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (error) {
        errorHandler.handle(
          error as Error,
          context || `${target.constructor.name}.${propertyKey}`
        );
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * タイムアウトエラーハンドリング
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context?: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new LawFinderError(
        `Operation timed out after ${timeoutMs}ms`,
        ErrorCode.TIMEOUT_ERROR,
        408,
        { timeoutMs, context }
      ));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    errorHandler.handleAndThrow(error as Error, context);
  }
}

/**
 * メモリ使用量チェック
 */
export function checkMemoryUsage(threshold: number = 0.9): void {
  const used = process.memoryUsage();
  const total = require('os').totalmem();
  const usage = used.heapUsed / total;
  
  if (usage > threshold) {
    errorHandler.log(
      LogLevel.WARN,
      `Memory usage high: ${(usage * 100).toFixed(2)}%`,
      'MemoryMonitor'
    );
  }
}