#!/usr/bin/env npx tsx
/**
 * 全法令データをPostgreSQLにインポート
 * laws_dataディレクトリから全XMLファイルを読み込み
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
  startTime: number;
}

class LawImporter {
  private stats: ImportStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    startTime: 0
  };

  /**
   * XMLファイルから基本情報を抽出
   */
  private async extractLawInfo(xmlPath: string): Promise<any> {
    const content = await fs.readFile(xmlPath, 'utf-8');
    
    // 法令IDの抽出（ディレクトリ名から）
    const dirName = path.basename(path.dirname(xmlPath));
    const lawId = dirName.split('_')[0];
    
    // 法令名の抽出
    const titleMatch = content.match(/<LawTitle>([^<]+)<\/LawTitle>/);
    const title = titleMatch ? titleMatch[1] : 'タイトル不明';
    
    // 法令番号の抽出
    const lawNumMatch = content.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNumber = lawNumMatch ? lawNumMatch[1] : null;
    
    // 法令種別の抽出
    let lawType = '法律';
    if (title.includes('政令')) lawType = '政令';
    else if (title.includes('省令')) lawType = '省令';
    else if (title.includes('規則')) lawType = '規則';
    else if (title.includes('条例')) lawType = '条例';
    
    // 条文の抽出（簡易版）
    const articles: any[] = [];
    const articleMatches = content.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    let sortOrder = 0;
    for (const match of articleMatches) {
      const articleNumber = match[1];
      const articleContent = match[2];
      
      // 条文タイトルの抽出
      const titleMatch = articleContent.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const articleTitle = titleMatch ? titleMatch[1] : null;
      
      // 条文本文の抽出（タグを除去）
      const cleanContent = articleContent.replace(/<[^>]+>/g, ' ').trim();
      
      articles.push({
        articleNumber,
        articleTitle,
        content: cleanContent,
        sortOrder: sortOrder++,
        isDeleted: cleanContent.includes('削除')
      });
    }
    
    return {
      id: lawId,
      title,
      lawNumber,
      lawType,
      xmlContent: content,
      status: '現行',
      articles
    };
  }

  /**
   * 単一の法令をインポート
   */
  private async importLaw(xmlPath: string): Promise<void> {
    try {
      const lawData = await this.extractLawInfo(xmlPath);
      
      // 既存の法令をチェック
      const existing = await prisma.law.findUnique({
        where: { id: lawData.id }
      });
      
      if (existing) {
        this.stats.skipped++;
        return;
      }
      
      // 法令と条文を作成
      await prisma.law.create({
        data: {
          id: lawData.id,
          title: lawData.title,
          lawNumber: lawData.lawNumber,
          lawType: lawData.lawType,
          xmlContent: lawData.xmlContent,
          status: lawData.status,
          articles: {
            create: lawData.articles
          }
        }
      });
      
      this.stats.success++;
    } catch (error) {
      console.error(`❌ インポートエラー (${xmlPath}):`, error);
      this.stats.failed++;
    }
  }

  /**
   * 全法令をインポート
   */
  async importAll(): Promise<void> {
    console.log('📚 全法令データのインポートを開始します...\n');
    this.stats.startTime = performance.now();
    
    // XMLファイルを検索
    const lawsDir = path.join(process.cwd(), 'laws_data');
    const dirs = await fs.readdir(lawsDir);
    
    const xmlFiles: string[] = [];
    for (const dir of dirs) {
      const dirPath = path.join(lawsDir, dir);
      const stat = await fs.stat(dirPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        if (xmlFile) {
          xmlFiles.push(path.join(dirPath, xmlFile));
        }
      }
    }
    
    this.stats.total = xmlFiles.length;
    console.log(`📁 ${this.stats.total}件の法令XMLファイルを検出\n`);
    
    // バッチ処理
    const BATCH_SIZE = 100;
    for (let i = 0; i < xmlFiles.length; i += BATCH_SIZE) {
      const batch = xmlFiles.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(file => this.importLaw(file)));
      
      // 進捗表示
      const processed = Math.min(i + BATCH_SIZE, xmlFiles.length);
      const percentage = Math.round((processed / xmlFiles.length) * 100);
      console.log(`進捗: ${processed}/${xmlFiles.length} (${percentage}%)`);
      console.log(`  ✅ 成功: ${this.stats.success}`);
      console.log(`  ⏭️  スキップ: ${this.stats.skipped}`);
      console.log(`  ❌ 失敗: ${this.stats.failed}\n`);
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
    console.log(`総ファイル数: ${this.stats.total}`);
    console.log(`成功: ${this.stats.success}`);
    console.log(`スキップ（既存）: ${this.stats.skipped}`);
    console.log(`失敗: ${this.stats.failed}`);
    console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
    console.log(`平均処理速度: ${(this.stats.total / elapsed).toFixed(1)}件/秒`);
  }
}

// メイン実行
if (require.main === module) {
  const importer = new LawImporter();
  
  importer.importAll()
    .then(async () => {
      await prisma.$disconnect();
      console.log('\n✅ インポート処理が完了しました');
      process.exit(0);
    })
    .catch(async (error) => {
      await prisma.$disconnect();
      console.error('❌ エラー:', error);
      process.exit(1);
    });
}

export { LawImporter };