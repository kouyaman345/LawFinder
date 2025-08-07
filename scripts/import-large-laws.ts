#!/usr/bin/env npx tsx
/**
 * 大きなXMLファイルも含めて全法令をインポート
 * ストリーミング処理とチャンク処理で大容量ファイルに対応
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';
import * as readline from 'readline';

const prisma = new PrismaClient({
  log: ['error'],
});

interface ImportStats {
  total: number;
  processed: number;
  largeFiles: number;
  failed: number;
  startTime: number;
}

class LargeLawImporter {
  private stats: ImportStats = {
    total: 0,
    processed: 0,
    largeFiles: 0,
    failed: 0,
    startTime: 0
  };

  /**
   * ストリーミングでXMLから基本情報を抽出
   */
  private async extractLawInfoStream(xmlPath: string, dirName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const lawId = dirName.split('_')[0];
      let title = `法令${lawId}`;
      let lawNumber: string | null = null;
      let foundTitle = false;
      let foundLawNum = false;
      
      const stream = fs.createReadStream(xmlPath, { 
        encoding: 'utf8',
        highWaterMark: 16 * 1024 // 16KB chunks
      });
      
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      
      let buffer = '';
      
      rl.on('line', (line) => {
        buffer += line;
        
        // タイトルを探す
        if (!foundTitle) {
          const titleMatch = buffer.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
          if (titleMatch) {
            title = titleMatch[1];
            foundTitle = true;
          }
        }
        
        // 法令番号を探す
        if (!foundLawNum) {
          const lawNumMatch = buffer.match(/<LawNum>([^<]+)<\/LawNum>/);
          if (lawNumMatch) {
            lawNumber = lawNumMatch[1];
            foundLawNum = true;
          }
        }
        
        // 両方見つかったら早期終了
        if (foundTitle && foundLawNum) {
          rl.close();
        }
        
        // バッファをクリア（メモリ節約）
        if (buffer.length > 10000) {
          buffer = buffer.slice(-5000);
        }
      });
      
      rl.on('close', () => {
        resolve({
          id: lawId,
          title: title,
          lawNumber: lawNumber,
        });
      });
      
      rl.on('error', reject);
    });
  }

  /**
   * 大きなファイルを分割して読み込み
   */
  private async readLargeFile(xmlPath: string): Promise<string> {
    const stat = await fsPromises.stat(xmlPath);
    const fileSize = stat.size;
    
    // 50MB以下は通常読み込み
    if (fileSize <= 50 * 1024 * 1024) {
      return await fsPromises.readFile(xmlPath, 'utf-8');
    }
    
    // 50MB超はチャンク読み込み
    console.log(`  📦 大容量ファイル処理中: ${path.basename(xmlPath)} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
    
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = fs.createReadStream(xmlPath);
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('utf-8'));
      });
      
      stream.on('error', reject);
    });
  }

  /**
   * 単一の法令をインポート（大容量対応）
   */
  private async importLaw(xmlPath: string): Promise<void> {
    try {
      const dirName = path.basename(path.dirname(xmlPath));
      const stat = await fsPromises.stat(xmlPath);
      const fileSize = stat.size;
      
      // 基本情報の抽出（ストリーミング）
      const lawInfo = await this.extractLawInfoStream(xmlPath, dirName);
      
      // XMLコンテンツの読み込み
      let xmlContent = '';
      
      if (fileSize > 10 * 1024 * 1024) {
        this.stats.largeFiles++;
        console.log(`  🔄 大容量ファイル: ${lawInfo.id} - ${lawInfo.title} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
        
        // 大きなファイルは分割読み込み
        xmlContent = await this.readLargeFile(xmlPath);
      } else {
        // 通常サイズは一括読み込み
        xmlContent = await fsPromises.readFile(xmlPath, 'utf-8');
      }
      
      // データベースに保存（upsert）
      await prisma.law.upsert({
        where: { id: lawInfo.id },
        update: {
          title: lawInfo.title,
          lawNumber: lawInfo.lawNumber,
          xmlContent: xmlContent,
        },
        create: {
          id: lawInfo.id,
          title: lawInfo.title,
          lawNumber: lawInfo.lawNumber,
          xmlContent: xmlContent,
        }
      });
      
      this.stats.processed++;
      
      // メモリ使用量が高い場合はガベージコレクションを強制
      if (global.gc && this.stats.processed % 100 === 0) {
        global.gc();
      }
      
    } catch (error: any) {
      console.error(`❌ エラー (${path.basename(xmlPath)}): ${error.message?.substring(0, 100)}`);
      this.stats.failed++;
    }
  }

  /**
   * スキップされた大きなファイルを特定
   */
  private async findLargeLaws(): Promise<string[]> {
    const lawsDir = path.join(process.cwd(), 'laws_data');
    const dirs = await fsPromises.readdir(lawsDir);
    
    const largeLaws: string[] = [];
    
    for (const dir of dirs) {
      if (dir.endsWith('.csv') || dir === 'sample') {
        continue;
      }
      
      const dirPath = path.join(lawsDir, dir);
      try {
        const stat = await fsPromises.stat(dirPath);
        
        if (stat.isDirectory()) {
          const files = await fsPromises.readdir(dirPath);
          const xmlFile = files.find(f => f.endsWith('.xml'));
          
          if (xmlFile) {
            const xmlPath = path.join(dirPath, xmlFile);
            const xmlStat = await fsPromises.stat(xmlPath);
            
            // 10MB以上のファイルを対象
            if (xmlStat.size > 10 * 1024 * 1024) {
              largeLaws.push(xmlPath);
            }
          }
        }
      } catch (e) {
        // エラーは無視
      }
    }
    
    return largeLaws;
  }

  /**
   * 大きなファイルを含む全法令をインポート
   */
  async importAll(): Promise<void> {
    console.log('🚀 大容量ファイル対応全法令インポートを開始します...\n');
    this.stats.startTime = performance.now();
    
    // 大きなファイルを特定
    const largeLaws = await this.findLargeLaws();
    console.log(`📦 ${largeLaws.length}件の大容量ファイルを検出（10MB以上）\n`);
    
    // 既存の法令数を確認
    const existingCount = await prisma.law.count();
    console.log(`📚 既存の法令数: ${existingCount}件\n`);
    
    this.stats.total = largeLaws.length;
    
    // 大きなファイルを順次処理（メモリ管理のため）
    for (let i = 0; i < largeLaws.length; i++) {
      const file = largeLaws[i];
      
      console.log(`\n処理中 ${i + 1}/${largeLaws.length}:`);
      await this.importLaw(file);
      
      // 進捗表示
      if ((i + 1) % 10 === 0 || i === largeLaws.length - 1) {
        const percentage = Math.round(((i + 1) / largeLaws.length) * 100);
        const elapsed = (performance.now() - this.stats.startTime) / 1000;
        const rate = (i + 1) / elapsed;
        const eta = (largeLaws.length - (i + 1)) / rate;
        
        console.log(`\n📊 進捗: ${i + 1}/${largeLaws.length} (${percentage}%)`);
        console.log(`  ✅ 処理済み: ${this.stats.processed}`);
        console.log(`  📦 大容量: ${this.stats.largeFiles}`);
        console.log(`  ❌ 失敗: ${this.stats.failed}`);
        console.log(`  ⏱️  速度: ${rate.toFixed(2)}件/秒`);
        if (eta > 0) {
          console.log(`  ⏳ 残り: 約${Math.ceil(eta / 60)}分`);
        }
      }
    }
    
    // 最終統計
    await this.printFinalStats();
  }

  /**
   * 最終統計情報の表示
   */
  private async printFinalStats(): Promise<void> {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    // 最終的なデータ数を確認
    const lawCount = await prisma.law.count();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 大容量ファイルのインポート完了！');
    console.log('='.repeat(60));
    console.log(`📊 処理統計:`);
    console.log(`  対象ファイル: ${this.stats.total}件`);
    console.log(`  処理成功: ${this.stats.processed}件`);
    console.log(`  大容量ファイル: ${this.stats.largeFiles}件`);
    console.log(`  失敗: ${this.stats.failed}件`);
    console.log(`  処理時間: ${(elapsed / 60).toFixed(1)}分`);
    if (this.stats.total > 0) {
      console.log(`  平均速度: ${(this.stats.total / elapsed).toFixed(2)}件/秒`);
    }
    console.log();
    console.log(`📚 データベース内容:`);
    console.log(`  総法令数: ${lawCount}件`);
    console.log();
    console.log('✨ 大容量ファイルを含む全法令のインポートが完了しました！');
  }
}

// メイン実行
async function main() {
  const importer = new LargeLawImporter();
  
  try {
    // Node.jsのメモリ制限を確認
    const memoryLimit = process.env.NODE_OPTIONS?.includes('--max-old-space-size') 
      ? process.env.NODE_OPTIONS 
      : 'デフォルト (約1.5GB)';
    console.log(`💾 メモリ制限: ${memoryLimit}\n`);
    
    await importer.importAll();
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト実行
if (require.main === module) {
  // メモリ制限を増やして実行する場合は以下のコマンドを使用:
  // NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/import-large-laws.ts
  main().catch(console.error);
}