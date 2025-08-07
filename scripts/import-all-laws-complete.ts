#!/usr/bin/env npx tsx
/**
 * 全法令データをPostgreSQLに完全インポート
 * 重複エラーを適切に処理し、全10,576件の法令をインポート
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Map<string, number>;
  startTime: number;
}

class CompleteLawImporter {
  private stats: ImportStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: new Map(),
    startTime: 0
  };

  /**
   * XMLファイルから基本情報を抽出（改善版）
   */
  private extractLawInfo(content: string, dirName: string): any {
    // 法令IDの抽出（ディレクトリ名から）
    const lawId = dirName.split('_')[0];
    
    // 法令名の抽出
    const titleMatch = content.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const title = titleMatch ? titleMatch[1] : `法令${lawId}`;
    
    // 法令番号の抽出
    const lawNumMatch = content.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNumber = lawNumMatch ? lawNumMatch[1] : null;
    
    // 法令種別の判定
    let lawType = '法律';
    if (lawNumber) {
      if (lawNumber.includes('政令')) lawType = '政令';
      else if (lawNumber.includes('省令')) lawType = '省令';
      else if (lawNumber.includes('規則')) lawType = '規則';
      else if (lawNumber.includes('条約')) lawType = '条約';
      else if (lawNumber.includes('憲法')) lawType = '憲法';
    }
    
    // 条文の抽出（シンプル版）
    const articles: any[] = [];
    const articleMatches = content.matchAll(/<Article[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g);
    const processedArticles = new Set<string>();
    
    for (const match of articleMatches) {
      const articleNumber = match[1];
      
      // 重複チェック
      if (processedArticles.has(articleNumber)) {
        continue;
      }
      processedArticles.add(articleNumber);
      
      const articleContent = match[2];
      
      // 条文タイトル
      const titleMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = titleMatch ? titleMatch[1] : null;
      
      // 第1項の内容を抽出
      const paragraphMatch = articleContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
      const content = paragraphMatch ? 
        paragraphMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      
      if (content) {
        articles.push({
          articleNumber: articleNumber,
          articleTitle: articleTitle,
          content: content,
        });
      }
    }
    
    return {
      id: lawId,
      title: title,
      lawNumber: lawNumber,
      lawType: lawType,
      xmlContent: content,
      status: '現行',
      articles: articles
    };
  }

  /**
   * 単一の法令をインポート（エラーハンドリング改善）
   */
  private async importLaw(xmlPath: string): Promise<void> {
    try {
      const dirName = path.basename(path.dirname(xmlPath));
      const content = await fs.readFile(xmlPath, 'utf-8');
      const lawData = this.extractLawInfo(content, dirName);
      
      // 既存チェック
      const existing = await prisma.law.findUnique({
        where: { id: lawData.id }
      });
      
      if (existing) {
        this.stats.skipped++;
        return;
      }
      
      // トランザクション内で法令と条文を作成
      await prisma.$transaction(async (tx) => {
        // 法令を作成
        await tx.law.create({
          data: {
            id: lawData.id,
            title: lawData.title,
            lawNumber: lawData.lawNumber,
            lawType: lawData.lawType,
            xmlContent: lawData.xmlContent,
            status: lawData.status,
          }
        });
        
        // 条文を個別に作成（エラーを個別処理）
        for (const article of lawData.articles) {
          try {
            await tx.article.create({
              data: {
                lawId: lawData.id,
                articleNumber: article.articleNumber,
                articleTitle: article.articleTitle,
                content: article.content,
              }
            });
          } catch (articleError: any) {
            // 条文の重複エラーは無視
            if (articleError.code !== 'P2002') {
              throw articleError;
            }
          }
        }
      });
      
      this.stats.success++;
    } catch (error: any) {
      // エラーの種類をカウント
      const errorType = error.code || 'UNKNOWN';
      this.stats.errors.set(errorType, (this.stats.errors.get(errorType) || 0) + 1);
      
      // 重複エラー以外は詳細を出力
      if (error.code !== 'P2002') {
        console.error(`❌ エラー (${path.basename(xmlPath)}): ${error.message?.substring(0, 100)}`);
      }
      
      this.stats.failed++;
    }
  }

  /**
   * データベースをクリーンアップ
   */
  async cleanDatabase(): Promise<void> {
    console.log('🧹 データベースをクリーンアップしています...');
    
    await prisma.$transaction([
      prisma.item.deleteMany(),
      prisma.paragraph.deleteMany(),
      prisma.article.deleteMany(),
      prisma.law.deleteMany(),
    ]);
    
    console.log('✅ データベースをクリーンアップしました\n');
  }

  /**
   * 全法令をインポート（バッチ処理改善）
   */
  async importAll(cleanFirst: boolean = false): Promise<void> {
    console.log('📚 全法令データの完全インポートを開始します...\n');
    this.stats.startTime = performance.now();
    
    if (cleanFirst) {
      await this.cleanDatabase();
    }
    
    // XMLファイルを検索
    const lawsDir = path.join(process.cwd(), 'laws_data');
    const dirs = await fs.readdir(lawsDir);
    
    const xmlFiles: string[] = [];
    for (const dir of dirs) {
      // CSVファイルとsampleディレクトリをスキップ
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
        // ディレクトリアクセスエラーは無視
      }
    }
    
    this.stats.total = xmlFiles.length;
    console.log(`📁 ${this.stats.total}件の法令XMLファイルを検出\n`);
    
    // 小さめのバッチサイズで処理（エラー時の影響を最小化）
    const BATCH_SIZE = 50;
    for (let i = 0; i < xmlFiles.length; i += BATCH_SIZE) {
      const batch = xmlFiles.slice(i, i + BATCH_SIZE);
      
      // 並列処理（エラーがあっても継続）
      await Promise.allSettled(batch.map(file => this.importLaw(file)));
      
      // 進捗表示（10バッチごと）
      if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= xmlFiles.length) {
        const processed = Math.min(i + BATCH_SIZE, xmlFiles.length);
        const percentage = Math.round((processed / xmlFiles.length) * 100);
        const elapsed = (performance.now() - this.stats.startTime) / 1000;
        const rate = processed / elapsed;
        const eta = (xmlFiles.length - processed) / rate;
        
        console.log(`📊 進捗: ${processed}/${xmlFiles.length} (${percentage}%)`);
        console.log(`  ✅ 成功: ${this.stats.success}`);
        console.log(`  ⏭️  スキップ: ${this.stats.skipped}`);
        console.log(`  ❌ 失敗: ${this.stats.failed}`);
        console.log(`  ⏱️  処理速度: ${rate.toFixed(1)}件/秒`);
        console.log(`  ⏳ 残り時間: 約${Math.ceil(eta / 60)}分\n`);
      }
    }
    
    // 最終統計表示
    this.printFinalStats();
  }

  /**
   * 最終統計情報の表示
   */
  private printFinalStats(): void {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    console.log('='.repeat(60));
    console.log('🎉 インポート完了！');
    console.log('='.repeat(60));
    console.log(`📊 最終統計:`);
    console.log(`  総ファイル数: ${this.stats.total}`);
    console.log(`  ✅ 成功: ${this.stats.success}`);
    console.log(`  ⏭️  スキップ（既存）: ${this.stats.skipped}`);
    console.log(`  ❌ 失敗: ${this.stats.failed}`);
    console.log(`  ⏱️  総処理時間: ${(elapsed / 60).toFixed(1)}分`);
    console.log(`  📈 平均処理速度: ${(this.stats.total / elapsed).toFixed(1)}件/秒`);
    
    if (this.stats.errors.size > 0) {
      console.log(`\n📋 エラー内訳:`);
      for (const [errorType, count] of this.stats.errors) {
        console.log(`  ${errorType}: ${count}件`);
      }
    }
    
    console.log('\n✨ データベースへのインポートが完了しました！');
  }
}

// メイン実行
async function main() {
  const importer = new CompleteLawImporter();
  
  try {
    // クリーンインポート（既存データを削除してから全件インポート）
    await importer.importAll(true);
    
    // 最終的なデータ数を確認
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    
    console.log('\n📚 データベース内容:');
    console.log(`  法令数: ${lawCount}`);
    console.log(`  条文数: ${articleCount}`);
    
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