#!/usr/bin/env npx tsx
/**
 * PostgreSQL法令データベースセットアップスクリプト
 * 法令XMLデータをPostgreSQLにインポートする
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { XMLParser } from '../src/infrastructure/parser/XMLParser';
import { performance } from 'perf_hooks';

dotenv.config();

// PostgreSQL用のPrismaクライアント設定
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.POSTGRESQL_URL || 'postgresql://postgres:postgres@localhost:5432/lawfinder'
    }
  }
});

interface ImportStats {
  totalLaws: number;
  successfulLaws: number;
  failedLaws: number;
  totalArticles: number;
  totalParagraphs: number;
  totalItems: number;
  startTime: number;
  errors: string[];
}

class LawDatabaseSetup {
  private xmlParser: XMLParser;
  private stats: ImportStats;
  private BATCH_SIZE = 10;

  constructor() {
    this.xmlParser = new XMLParser();
    this.stats = {
      totalLaws: 0,
      successfulLaws: 0,
      failedLaws: 0,
      totalArticles: 0,
      totalParagraphs: 0,
      totalItems: 0,
      startTime: 0,
      errors: []
    };
  }

  /**
   * メインセットアップ処理
   */
  async setup(): Promise<void> {
    console.log('🚀 PostgreSQL法令データベースのセットアップを開始します...\n');
    this.stats.startTime = performance.now();

    try {
      // 1. データベース接続確認
      await this.checkConnection();

      // 2. 既存データのクリア（オプション）
      const clearExisting = process.argv.includes('--clear');
      if (clearExisting) {
        await this.clearDatabase();
      }

      // 3. サンプル法令のインポート
      await this.importSampleLaws();

      // 4. 統計情報の表示
      this.printStats();

    } catch (error) {
      console.error('❌ セットアップエラー:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * データベース接続確認
   */
  private async checkConnection(): Promise<void> {
    try {
      await prisma.$connect();
      console.log('✅ PostgreSQLに接続しました\n');
    } catch (error) {
      console.error('❌ PostgreSQL接続エラー。以下を確認してください:');
      console.error('   1. PostgreSQLが起動しているか');
      console.error('   2. .envのPOSTGRESQL_URLが正しいか');
      console.error('   3. データベース"lawfinder"が存在するか\n');
      throw error;
    }
  }

  /**
   * データベースクリア
   */
  private async clearDatabase(): Promise<void> {
    console.log('🗑️  既存データをクリアしています...');
    
    // 依存関係の順序でテーブルをクリア
    await prisma.item.deleteMany();
    await prisma.paragraph.deleteMany();
    await prisma.article.deleteMany();
    await prisma.law.deleteMany();
    
    console.log('✅ データベースをクリアしました\n');
  }

  /**
   * サンプル法令のインポート
   */
  private async importSampleLaws(): Promise<void> {
    const sampleLawIds = [
      '129AC0000000089', // 民法
      '140AC0000000045', // 刑法
      '322AC0000000049', // 労働基準法
      '417AC0000000086', // 会社法
      '132AC0000000048', // 商法
    ];

    console.log(`📚 ${sampleLawIds.length}件のサンプル法令をインポートします...\n`);

    for (const lawId of sampleLawIds) {
      await this.importLaw(lawId);
    }
  }

  /**
   * 個別法令のインポート
   */
  private async importLaw(lawId: string): Promise<void> {
    this.stats.totalLaws++;
    
    try {
      console.log(`📖 ${lawId} をインポート中...`);
      
      // XMLファイルの検索
      const xmlPath = this.findXmlFile(lawId);
      if (!xmlPath) {
        throw new Error(`XMLファイルが見つかりません: ${lawId}`);
      }

      // XMLの読み込みとパース
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const lawData = this.xmlParser.parse(xmlContent);

      // トランザクションでデータベースに保存
      await prisma.$transaction(async (tx) => {
        // 1. 法令マスター作成
        const law = await tx.law.create({
          data: {
            id: lawId,
            title: lawData.title || `法令 ${lawId}`,
            lawType: this.detectLawType(lawData.title),
            lawNumber: lawData.lawNumber,
            promulgationDate: lawData.promulgationDate ? new Date(lawData.promulgationDate) : null,
            effectiveDate: lawData.effectiveDate ? new Date(lawData.effectiveDate) : null,
            xmlContent: xmlContent,
            status: '現行',
            metadata: lawData.metadata || {}
          }
        });

        // 2. 条文データ作成
        let articleSort = 0;
        for (const articleData of lawData.articles || []) {
          const article = await tx.article.create({
            data: {
              lawId: law.id,
              articleNumber: articleData.number,
              articleTitle: articleData.title,
              content: articleData.content || '',
              part: articleData.part,
              chapter: articleData.chapter,
              section: articleData.section,
              sortOrder: articleSort++,
              depth: this.calculateDepth(articleData),
              path: this.buildPath(articleData),
              isDeleted: articleData.isDeleted || false
            }
          });
          this.stats.totalArticles++;

          // 3. 項データ作成
          let paragraphNum = 1;
          for (const paragraphData of articleData.paragraphs || []) {
            const paragraph = await tx.paragraph.create({
              data: {
                articleId: article.id,
                paragraphNumber: paragraphNum++,
                content: paragraphData.content || '',
                sentenceCount: this.countSentences(paragraphData.content)
              }
            });
            this.stats.totalParagraphs++;

            // 4. 号データ作成
            let itemSort = 0;
            for (const itemData of paragraphData.items || []) {
              await tx.item.create({
                data: {
                  paragraphId: paragraph.id,
                  itemNumber: itemData.number,
                  itemType: itemData.type || '号',
                  content: itemData.content || '',
                  sortOrder: itemSort++
                }
              });
              this.stats.totalItems++;
            }
          }
        }
      });

      this.stats.successfulLaws++;
      console.log(`✅ ${lawId} のインポート完了\n`);

    } catch (error) {
      this.stats.failedLaws++;
      const errorMsg = `${lawId}: ${error.message}`;
      this.stats.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}\n`);
    }
  }

  /**
   * XMLファイルの検索
   */
  private findXmlFile(lawId: string): string | null {
    const lawsDataPath = process.env.XML_DATA_PATH || './laws_data';
    
    // 直接パスを試す
    const directPath = path.join(lawsDataPath, `${lawId}.xml`);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // サブディレクトリを検索
    try {
      const dirs = fs.readdirSync(lawsDataPath);
      for (const dir of dirs) {
        if (dir.startsWith(lawId)) {
          const dirPath = path.join(lawsDataPath, dir);
          if (fs.statSync(dirPath).isDirectory()) {
            const files = fs.readdirSync(dirPath);
            const xmlFile = files.find(f => f.endsWith('.xml'));
            if (xmlFile) {
              return path.join(dirPath, xmlFile);
            }
          }
        }
      }
    } catch (error) {
      // エラーは無視
    }

    return null;
  }

  /**
   * 法令種別の判定
   */
  private detectLawType(title: string): string {
    if (title.includes('法律')) return '法律';
    if (title.includes('政令')) return '政令';
    if (title.includes('省令')) return '省令';
    if (title.includes('規則')) return '規則';
    if (title.includes('条例')) return '条例';
    return '法律';
  }

  /**
   * 階層の深さ計算
   */
  private calculateDepth(article: any): number {
    let depth = 0;
    if (article.part) depth++;
    if (article.chapter) depth++;
    if (article.section) depth++;
    if (article.subsection) depth++;
    if (article.division) depth++;
    return depth;
  }

  /**
   * 階層パスの構築
   */
  private buildPath(article: any): string {
    const parts = [];
    if (article.part) parts.push(article.part);
    if (article.chapter) parts.push(article.chapter);
    if (article.section) parts.push(article.section);
    if (article.subsection) parts.push(article.subsection);
    if (article.division) parts.push(article.division);
    return parts.join('/');
  }

  /**
   * 文の数をカウント
   */
  private countSentences(text: string): number {
    if (!text) return 0;
    return (text.match(/。/g) || []).length || 1;
  }

  /**
   * 統計情報の表示
   */
  private printStats(): void {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 インポート統計');
    console.log('='.repeat(60));
    console.log(`✅ 成功した法令: ${this.stats.successfulLaws}/${this.stats.totalLaws}`);
    console.log(`📄 インポート条文数: ${this.stats.totalArticles}`);
    console.log(`📝 インポート項数: ${this.stats.totalParagraphs}`);
    console.log(`📌 インポート号数: ${this.stats.totalItems}`);
    
    if (this.stats.failedLaws > 0) {
      console.log(`\n❌ 失敗した法令: ${this.stats.failedLaws}`);
      this.stats.errors.forEach(err => console.log(`   - ${err}`));
    }
    
    console.log(`\n⏱️  処理時間: ${elapsed.toFixed(2)}秒`);
    console.log('='.repeat(60));
  }
}

// 実行
if (require.main === module) {
  const setup = new LawDatabaseSetup();
  
  setup.setup()
    .then(() => {
      console.log('\n✅ 法令データベースのセットアップが完了しました！');
      console.log('   次のステップ: npm run build:graph で参照関係グラフを構築してください');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ セットアップに失敗しました:', error);
      process.exit(1);
    });
}