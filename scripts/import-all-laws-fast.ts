#!/usr/bin/env npx tsx
/**
 * 高速全法令インポート（upsert使用）
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient({
  log: ['error'],
});

interface ImportStats {
  total: number;
  processed: number;
  new: number;
  updated: number;
  failed: number;
  startTime: number;
}

class FastLawImporter {
  private stats: ImportStats = {
    total: 0,
    processed: 0,
    new: 0,
    updated: 0,
    failed: 0,
    startTime: 0
  };

  /**
   * XMLファイルから基本情報を抽出（最小限）
   */
  private extractMinimalLawInfo(content: string, dirName: string): any {
    // 法令IDの抽出
    const lawId = dirName.split('_')[0];
    
    // 法令名の抽出
    const titleMatch = content.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const title = titleMatch ? titleMatch[1] : `法令${lawId}`;
    
    // 法令番号の抽出
    const lawNumMatch = content.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNumber = lawNumMatch ? lawNumMatch[1] : null;
    
    return {
      id: lawId,
      title: title,
      lawNumber: lawNumber,
      xmlContent: content,
    };
  }

  /**
   * 単一の法令をupsert（存在すれば更新、なければ作成）
   */
  private async upsertLaw(xmlPath: string): Promise<void> {
    try {
      const dirName = path.basename(path.dirname(xmlPath));
      
      // ファイルサイズチェック（大きすぎるファイルはスキップ）
      const stat = await fs.stat(xmlPath);
      if (stat.size > 10 * 1024 * 1024) { // 10MB以上はスキップ
        console.log(`⚠️ スキップ: ${dirName} (ファイルサイズが大きすぎます)`);
        this.stats.failed++;
        return;
      }
      
      const content = await fs.readFile(xmlPath, 'utf-8');
      const lawData = this.extractMinimalLawInfo(content, dirName);
      
      // upsertで効率的に処理
      const result = await prisma.law.upsert({
        where: { id: lawData.id },
        update: {
          title: lawData.title,
          lawNumber: lawData.lawNumber,
          xmlContent: lawData.xmlContent,
        },
        create: {
          id: lawData.id,
          title: lawData.title,
          lawNumber: lawData.lawNumber,
          xmlContent: lawData.xmlContent,
        },
        select: { id: true }
      });
      
      this.stats.processed++;
      
      // 新規作成か更新かはログでは区別しない（パフォーマンスのため）
      this.stats.new++;
      
    } catch (error: any) {
      if (error.message?.includes('Unique constraint')) {
        // 重複エラーは無視
        this.stats.processed++;
      } else {
        console.error(`❌ エラー (${path.basename(xmlPath)}): ${error.message?.substring(0, 50)}`);
        this.stats.failed++;
      }
    }
  }

  /**
   * 全法令を高速インポート
   */
  async importAll(): Promise<void> {
    console.log('🚀 高速全法令インポートを開始します...\n');
    this.stats.startTime = performance.now();
    
    // XMLファイルを検索
    const lawsDir = path.join(process.cwd(), 'laws_data');
    const dirs = await fs.readdir(lawsDir);
    
    const xmlFiles: string[] = [];
    for (const dir of dirs) {
      if (dir.endsWith('.csv') || dir === 'sample') {
        continue;
      }
      
      const dirPath = path.join(lawsDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        
        if (stat.isDirectory()) {
          const files = await fs.readdir(dirPath);
          const xmlFile = files.find(f => f.endsWith('.xml'));
          if (xmlFile) {
            xmlFiles.push(path.join(dirPath, xmlFile));
          }
        }
      } catch (e) {
        // エラーは無視
      }
    }
    
    this.stats.total = xmlFiles.length;
    console.log(`📁 ${this.stats.total}件の法令XMLファイルを検出\n`);
    
    // 大きめのバッチサイズで高速処理
    const BATCH_SIZE = 100;
    let lastReportTime = Date.now();
    
    for (let i = 0; i < xmlFiles.length; i += BATCH_SIZE) {
      const batch = xmlFiles.slice(i, i + BATCH_SIZE);
      
      // 並列処理
      await Promise.allSettled(batch.map(file => this.upsertLaw(file)));
      
      // 5秒ごとまたは10%ごとに進捗表示
      const now = Date.now();
      const processed = Math.min(i + BATCH_SIZE, xmlFiles.length);
      const percentage = Math.round((processed / xmlFiles.length) * 100);
      
      if (now - lastReportTime > 5000 || percentage % 10 === 0) {
        const elapsed = (performance.now() - this.stats.startTime) / 1000;
        const rate = processed / elapsed;
        const eta = (xmlFiles.length - processed) / rate;
        
        console.log(`📊 進捗: ${processed}/${xmlFiles.length} (${percentage}%)`);
        console.log(`  ⚡ 速度: ${rate.toFixed(1)}件/秒`);
        console.log(`  ⏳ 残り: 約${Math.ceil(eta / 60)}分\n`);
        
        lastReportTime = now;
      }
    }
    
    // 最終統計
    this.printFinalStats();
  }

  /**
   * 最終統計情報の表示
   */
  private async printFinalStats(): Promise<void> {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    // 実際のデータ数を確認
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    
    console.log('='.repeat(60));
    console.log('✅ インポート完了！');
    console.log('='.repeat(60));
    console.log(`📊 処理統計:`);
    console.log(`  対象ファイル: ${this.stats.total}件`);
    console.log(`  処理済み: ${this.stats.processed}件`);
    console.log(`  失敗: ${this.stats.failed}件`);
    console.log(`  処理時間: ${(elapsed / 60).toFixed(1)}分`);
    console.log(`  平均速度: ${(this.stats.total / elapsed).toFixed(1)}件/秒`);
    console.log();
    console.log(`📚 データベース内容:`);
    console.log(`  法令数: ${lawCount}件`);
    console.log(`  条文数: ${articleCount}件`);
    console.log();
    console.log('✨ 全法令のインポートが完了しました！');
  }
}

// メイン実行
async function main() {
  const importer = new FastLawImporter();
  
  try {
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
  main().catch(console.error);
}