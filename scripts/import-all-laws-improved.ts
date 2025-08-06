#!/usr/bin/env npx tsx
/**
 * 改良版: 全法令データをPostgreSQLにインポート
 * 重複する法令IDは最新版のみを保持
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  updated: number;
  startTime: number;
}

class ImprovedLawImporter {
  private stats: ImportStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    updated: 0,
    startTime: 0
  };

  /**
   * XMLファイルから基本情報を抽出（改良版）
   */
  private async extractLawInfo(xmlPath: string): Promise<any> {
    const content = await fs.readFile(xmlPath, 'utf-8');
    
    // ディレクトリ名から法令IDと施行日を抽出
    const dirName = path.basename(path.dirname(xmlPath));
    const parts = dirName.split('_');
    const lawId = parts[0];
    
    // 施行日の正しい解析（YYYYMMDD形式）
    let effectiveDate = null;
    if (parts[1] && parts[1] !== '000000000000000') {
      const dateStr = parts[1];
      if (dateStr.length === 8) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6));
        const day = parseInt(dateStr.substring(6, 8));
        
        // 年月日が有効範囲内かチェック
        if (year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          effectiveDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
      }
    }
    
    // 法令名の抽出（複数パターン対応）
    let title = 'タイトル不明';
    const titlePatterns = [
      /<LawTitle>([^<]+)<\/LawTitle>/,
      /<LawName>([^<]+)<\/LawName>/,
      /<Title>([^<]+)<\/Title>/
    ];
    
    for (const pattern of titlePatterns) {
      const match = content.match(pattern);
      if (match) {
        title = match[1];
        break;
      }
    }
    
    // 法令番号の抽出
    const lawNumMatch = content.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNumber = lawNumMatch ? lawNumMatch[1] : null;
    
    // 法令種別の判定
    let lawType = '法律';
    if (lawNumber) {
      if (lawNumber.includes('政令')) lawType = '政令';
      else if (lawNumber.includes('省令')) lawType = '省令';
      else if (lawNumber.includes('規則')) lawType = '規則';
      else if (lawNumber.includes('条例')) lawType = '条例';
      else if (lawNumber.includes('告示')) lawType = '告示';
      else if (lawNumber.includes('訓令')) lawType = '訓令';
    }
    
    // 条文の抽出（改良版）
    const articles: any[] = [];
    const articleMatches = content.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    let sortOrder = 0;
    for (const match of articleMatches) {
      const articleNumber = match[1];
      const articleContent = match[2];
      
      // 条文タイトルの抽出
      const titleMatch = articleContent.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const articleTitle = titleMatch ? titleMatch[1].replace(/[（）]/g, '') : null;
      
      // 条文本文の抽出（改良版）
      let cleanContent = articleContent
        .replace(/<ArticleTitle>[^<]+<\/ArticleTitle>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // 空条文や削除条文の判定
      const isDeleted = cleanContent.includes('削除') || cleanContent.length < 5;
      
      if (cleanContent.length > 0) {
        articles.push({
          articleNumber,
          articleTitle,
          content: cleanContent,
          sortOrder: sortOrder++,
          isDeleted
        });
      }
    }
    
    return {
      id: lawId,
      title,
      lawNumber,
      lawType,
      xmlContent: content.substring(0, 1000000), // XMLが大きすぎる場合は切り詰め
      status: '現行',
      effectiveDate,
      articles
    };
  }

  /**
   * 単一の法令をインポート（upsert対応）
   */
  private async importLaw(xmlPath: string): Promise<void> {
    let lawData: any = null;
    try {
      lawData = await this.extractLawInfo(xmlPath);
      
      // 既存の法令をチェック
      const existing = await prisma.law.findUnique({
        where: { id: lawData.id },
        include: { articles: true }
      });
      
      if (existing) {
        // 既存の場合は、より新しいバージョンかチェック
        if (lawData.effectiveDate && existing.effectiveDate) {
          const newDate = new Date(lawData.effectiveDate);
          const existingDate = new Date(existing.effectiveDate);
          
          if (newDate <= existingDate) {
            this.stats.skipped++;
            return;
          }
        }
        
        // 既存のデータを削除して再作成
        await prisma.$transaction(async (tx) => {
          await tx.article.deleteMany({ where: { lawId: lawData.id } });
          await tx.law.delete({ where: { id: lawData.id } });
          
          await tx.law.create({
            data: {
              id: lawData.id,
              title: lawData.title,
              lawNumber: lawData.lawNumber,
              lawType: lawData.lawType,
              xmlContent: lawData.xmlContent,
              status: lawData.status,
              effectiveDate: lawData.effectiveDate ? new Date(lawData.effectiveDate) : null,
              articles: {
                create: lawData.articles
              }
            }
          });
        });
        
        this.stats.updated++;
      } else {
        // 新規作成
        await prisma.law.create({
          data: {
            id: lawData.id,
            title: lawData.title,
            lawNumber: lawData.lawNumber,
            lawType: lawData.lawType,
            xmlContent: lawData.xmlContent,
            status: lawData.status,
            effectiveDate: lawData.effectiveDate ? new Date(lawData.effectiveDate) : null,
            articles: {
              create: lawData.articles
            }
          }
        });
        
        this.stats.success++;
      }
    } catch (error: any) {
      // エラーログを詳細表示
      console.error(`❌ ${path.basename(xmlPath)}:`);
      console.error(`  エラー: ${error.message}`);
      if (error.stack) {
        console.error(`  スタック: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      console.error(`  法令ID: ${lawData?.id || 'unknown'}`);
      this.stats.failed++;
    }
  }

  /**
   * 全法令をインポート（改良版）
   */
  async importAll(limit?: number): Promise<void> {
    console.log('📚 全法令データのインポートを開始します...\n');
    this.stats.startTime = performance.now();
    
    // XMLファイルを検索（最新版を優先）
    const lawsDir = path.join(process.cwd(), 'laws_data');
    const dirs = await fs.readdir(lawsDir);
    
    // 法令IDごとに最新版のみを選択
    const lawMap = new Map<string, string>();
    
    for (const dir of dirs) {
      if (dir.startsWith('.') || dir === 'all_law_list.csv' || dir === 'sample') continue;
      
      const dirPath = path.join(lawsDir, dir);
      const stat = await fs.stat(dirPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        if (xmlFile) {
          const lawId = dir.split('_')[0];
          const existingPath = lawMap.get(lawId);
          
          // より新しいバージョンを選択
          if (!existingPath || dir > path.basename(path.dirname(existingPath))) {
            lawMap.set(lawId, path.join(dirPath, xmlFile));
          }
        }
      }
    }
    
    const xmlFiles = Array.from(lawMap.values());
    const targetFiles = limit ? xmlFiles.slice(0, limit) : xmlFiles;
    
    this.stats.total = targetFiles.length;
    console.log(`📁 ${this.stats.total}件の法令XMLファイルを処理します`);
    console.log(`（重複を除いた最新版のみ）\n`);
    
    // バッチ処理（小さめのバッチサイズ）
    const BATCH_SIZE = 10;
    for (let i = 0; i < targetFiles.length; i += BATCH_SIZE) {
      const batch = targetFiles.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(file => this.importLaw(file)));
      
      // 進捗表示
      const processed = Math.min(i + BATCH_SIZE, targetFiles.length);
      const percentage = Math.round((processed / targetFiles.length) * 100);
      
      if (processed % 100 === 0 || processed === targetFiles.length) {
        console.log(`進捗: ${processed}/${targetFiles.length} (${percentage}%)`);
        console.log(`  ✅ 新規: ${this.stats.success}`);
        console.log(`  🔄 更新: ${this.stats.updated}`);
        console.log(`  ⏭️  スキップ: ${this.stats.skipped}`);
        console.log(`  ❌ 失敗: ${this.stats.failed}\n`);
      }
    }
    
    // 統計表示
    this.printStats();
  }

  /**
   * 統計情報の表示
   */
  private printStats(): void {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    console.log('='.repeat(60));
    console.log('📊 インポート完了');
    console.log('='.repeat(60));
    console.log(`処理ファイル数: ${this.stats.total}`);
    console.log(`新規作成: ${this.stats.success}`);
    console.log(`更新: ${this.stats.updated}`);
    console.log(`スキップ: ${this.stats.skipped}`);
    console.log(`失敗: ${this.stats.failed}`);
    console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
    console.log(`平均処理速度: ${(this.stats.total / elapsed).toFixed(1)}件/秒`);
  }
}

// メイン実行
if (require.main === module) {
  const importer = new ImprovedLawImporter();
  const limit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  
  if (limit) {
    console.log(`🔢 最初の${limit}件のみ処理します\n`);
  }
  
  importer.importAll(limit)
    .then(async () => {
      const count = await prisma.law.count();
      console.log(`\n📊 データベース内の法令総数: ${count}件`);
      await prisma.$disconnect();
      console.log('✅ インポート処理が完了しました');
      process.exit(0);
    })
    .catch(async (error) => {
      await prisma.$disconnect();
      console.error('❌ エラー:', error);
      process.exit(1);
    });
}

export { ImprovedLawImporter };