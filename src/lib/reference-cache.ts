/**
 * 参照検出結果のキャッシング機構
 * LRUキャッシュによる高速化実装
 */

import { Reference } from '../domain/models/Reference';
import * as crypto from 'crypto';

export interface CacheEntry {
  references: Reference[];
  timestamp: number;
  hitCount: number;
  detectorVersion: string;
}

export interface CacheStatistics {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  cacheSize: number;
  maxSize: number;
  oldestEntry: Date | null;
  mostHitEntry: { key: string; count: number } | null;
}

export class ReferenceCache {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[];
  private readonly maxSize: number;
  private readonly ttl: number; // Time to live in milliseconds
  private totalHits: number = 0;
  private totalMisses: number = 0;
  private readonly detectorVersion: string;
  
  constructor(options: {
    maxSize?: number;
    ttl?: number;
    detectorVersion?: string;
  } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 3600000; // 1時間デフォルト
    this.detectorVersion = options.detectorVersion || '4.0.0';
    this.cache = new Map();
    this.accessOrder = [];
  }
  
  /**
   * キャッシュキーを生成
   */
  private generateKey(text: string, context?: string): string {
    const normalizedText = text.trim().toLowerCase();
    const contextPart = context ? `:${context}` : '';
    const combined = `${normalizedText}${contextPart}`;
    
    // 長いテキストの場合はハッシュ化
    if (combined.length > 100) {
      return crypto.createHash('sha256').update(combined).digest('hex');
    }
    
    return combined;
  }
  
  /**
   * キャッシュから取得
   */
  get(text: string, context?: string): Reference[] | null {
    const key = this.generateKey(text, context);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.totalMisses++;
      return null;
    }
    
    // TTLチェック
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.totalMisses++;
      return null;
    }
    
    // バージョンチェック
    if (entry.detectorVersion !== this.detectorVersion) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.totalMisses++;
      return null;
    }
    
    // ヒット処理
    this.totalHits++;
    entry.hitCount++;
    this.updateAccessOrder(key);
    
    // 参照のコピーを返す（副作用防止）
    return [...entry.references];
  }
  
  /**
   * キャッシュに保存
   */
  set(text: string, references: Reference[], context?: string): void {
    const key = this.generateKey(text, context);
    
    // 容量チェック
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const entry: CacheEntry = {
      references: [...references], // コピーを保存
      timestamp: Date.now(),
      hitCount: 0,
      detectorVersion: this.detectorVersion
    };
    
    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }
  
  /**
   * キャッシュの存在確認
   */
  has(text: string, context?: string): boolean {
    const key = this.generateKey(text, context);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    // TTLとバージョンチェック
    const now = Date.now();
    if (now - entry.timestamp > this.ttl || entry.detectorVersion !== this.detectorVersion) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * 特定のエントリを削除
   */
  delete(text: string, context?: string): boolean {
    const key = this.generateKey(text, context);
    this.removeFromAccessOrder(key);
    return this.cache.delete(key);
  }
  
  /**
   * キャッシュをクリア
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.totalHits = 0;
    this.totalMisses = 0;
  }
  
  /**
   * LRU削除
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }
  
  /**
   * アクセス順序を更新
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }
  
  /**
   * アクセス順序から削除
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(): CacheStatistics {
    const hitRate = this.totalHits + this.totalMisses > 0
      ? this.totalHits / (this.totalHits + this.totalMisses)
      : 0;
    
    let oldestEntry: Date | null = null;
    let mostHitEntry: { key: string; count: number } | null = null;
    let maxHits = 0;
    
    this.cache.forEach((entry, key) => {
      if (!oldestEntry || entry.timestamp < oldestEntry.getTime()) {
        oldestEntry = new Date(entry.timestamp);
      }
      
      if (entry.hitCount > maxHits) {
        maxHits = entry.hitCount;
        mostHitEntry = { key, count: entry.hitCount };
      }
    });
    
    return {
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate,
      cacheSize: this.cache.size,
      maxSize: this.maxSize,
      oldestEntry,
      mostHitEntry
    };
  }
  
  /**
   * キャッシュサイズを取得
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * 期限切れエントリを削除
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.ttl || entry.detectorVersion !== this.detectorVersion) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      pruned++;
    });
    
    return pruned;
  }
  
  /**
   * メモリ使用量の推定（バイト）
   */
  estimateMemoryUsage(): number {
    let bytes = 0;
    
    this.cache.forEach((entry, key) => {
      // キーのサイズ
      bytes += key.length * 2; // UTF-16
      
      // エントリのメタデータ
      bytes += 8 + 8 + 8; // timestamp, hitCount, detectorVersion参照
      
      // 参照データの推定（1参照あたり約200バイト）
      bytes += entry.references.length * 200;
    });
    
    // アクセス順序配列
    bytes += this.accessOrder.length * 50; // 推定値
    
    return bytes;
  }
  
  /**
   * ウォームアップ（よく使うパターンを事前キャッシュ）
   */
  warmup(patterns: Array<{ text: string; references: Reference[]; context?: string }>): void {
    patterns.forEach(pattern => {
      this.set(pattern.text, pattern.references, pattern.context);
    });
  }
  
  /**
   * キャッシュの内容をシリアライズ（永続化用）
   */
  serialize(): string {
    const data = {
      version: this.detectorVersion,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        entry: {
          ...entry,
          references: entry.references.map(ref => ({
            ...ref,
            // 関数は除外
            position: ref.position
          }))
        }
      })),
      statistics: {
        totalHits: this.totalHits,
        totalMisses: this.totalMisses
      }
    };
    
    return JSON.stringify(data);
  }
  
  /**
   * シリアライズデータから復元
   */
  static deserialize(data: string, detectorVersion: string): ReferenceCache {
    const parsed = JSON.parse(data);
    const cache = new ReferenceCache({ detectorVersion });
    
    if (parsed.version === detectorVersion) {
      parsed.entries.forEach((item: any) => {
        cache.cache.set(item.key, {
          ...item.entry,
          references: item.entry.references
        });
        cache.accessOrder.push(item.key);
      });
      
      if (parsed.statistics) {
        cache.totalHits = parsed.statistics.totalHits;
        cache.totalMisses = parsed.statistics.totalMisses;
      }
    }
    
    return cache;
  }
}

// シングルトンインスタンス
let globalCache: ReferenceCache | null = null;

export function getGlobalCache(version?: string): ReferenceCache {
  if (!globalCache) {
    globalCache = new ReferenceCache({ detectorVersion: version });
  }
  return globalCache;
}

export function clearGlobalCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}