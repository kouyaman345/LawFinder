import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LawXMLParser } from '../src/lib/xml-parser';
import { ReferenceDetector } from '../src/utils/reference-detector';

const prisma = new PrismaClient();

interface ImportOptions {
  batchSize: number;
  skipExisting: boolean;
  lawsDataPath: string;
  verbose: boolean;
}

class LawImporter {
  private options: ImportOptions;
  private parser: LawXMLParser;
  private referenceDetector: ReferenceDetector;
  private processedCount = 0;
  private errorCount = 0;
  private skippedCount = 0;
  private startTime: number = 0;

  constructor(options: Partial<ImportOptions> = {}) {
    this.options = {
      batchSize: 100,
      skipExisting: false,
      lawsDataPath: path.join(process.cwd(), 'laws_data'),
      verbose: false,
      ...options
    };
    this.parser = new LawXMLParser();
    this.referenceDetector = new ReferenceDetector();
  }

  async importAll() {
    try {
      console.log('🚀 法令データのインポートを開始します\n');
      this.startTime = Date.now();

      // XMLファイルを検索
      const xmlFiles = await this.findAllXMLFiles();
      console.log(`📊 対象ファイル数: ${xmlFiles.length}件\n`);

      // バッチ処理
      const batches = this.createBatches(xmlFiles, this.options.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        console.log(`\n🔄 バッチ ${i + 1}/${batches.length} を処理中...`);
        await this.processBatch(batches[i]);
        
        // 進捗表示
        this.showProgress(xmlFiles.length);
      }

      console.log('\n✅ インポート完了！\n');
      this.showFinalStatistics();

    } catch (error) {
      console.error('\n❌ エラーが発生しました:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async findAllXMLFiles(): Promise<string[]> {
    const xmlFiles: string[] = [];
    
    async function scanDirectory(dirPath: string) {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.name.endsWith('.xml')) {
          xmlFiles.push(fullPath);
        }
      }
    }
    
    await scanDirectory(this.options.lawsDataPath);
    return xmlFiles;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(xmlFiles: string[]) {
    // 順次処理に変更（データベースへの負荷を軽減）
    for (const file of xmlFiles) {
      await this.processFile(file);
    }
  }

  private async processFile(xmlPath: string) {
    try {
      // ファイル名から法令IDを抽出
      const fileName = path.basename(xmlPath, '.xml');
      const lawId = fileName.split('_')[0]; // 例: 129AC0000000089_20230401_503AC0000000061.xml → 129AC0000000089

      // 既存チェック
      if (this.options.skipExisting) {
        const existing = await prisma.law.findUnique({ where: { id: lawId } });
        if (existing) {
          this.skippedCount++;
          if (this.options.verbose) {
            console.log(`⏭️  スキップ: ${lawId}`);
          }
          return;
        }
      }

      // XMLを読み込んでパース
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');
      const lawData = this.parser.parseLawXML(xmlContent, fileName);

      // トランザクションで保存
      await prisma.$transaction(async (tx) => {
        // 法令を保存
        await tx.law.upsert({
          where: { id: lawData.lawId },
          update: {
            title: lawData.lawTitle,
            lawNumber: lawData.lawNum,
            lawType: lawData.lawType,
            promulgationDate: lawData.promulgateDate,
            updatedAt: new Date()
          },
          create: {
            id: lawData.lawId,
            title: lawData.lawTitle,
            lawNumber: lawData.lawNum,
            lawType: lawData.lawType,
            promulgationDate: lawData.promulgateDate,
            metadata: {
              structure: lawData.structure
            }
          }
        });

        // 既存の条文を削除（更新の場合）
        await tx.article.deleteMany({ where: { lawId: lawData.lawId } });

        // 条文を保存
        for (const article of lawData.articles) {
          const savedArticle = await tx.article.create({
            data: {
              lawId: lawData.lawId,
              articleNumber: article.articleNum,
              articleTitle: article.articleTitle,
              content: article.paragraphs[0]?.content || '',
              part: this.findStructureInfo(article.articleNum, lawData.structure, 'part'),
              chapter: this.findStructureInfo(article.articleNum, lawData.structure, 'chapter'),
              section: this.findStructureInfo(article.articleNum, lawData.structure, 'section')
            }
          });

          // 項を保存
          for (let i = 0; i < article.paragraphs.length; i++) {
            const paragraph = article.paragraphs[i];
            const savedParagraph = await tx.paragraph.create({
              data: {
                articleId: savedArticle.id,
                paragraphNumber: i + 1,
                content: paragraph.content
              }
            });

            // 号を保存
            if (paragraph.items) {
              for (const item of paragraph.items) {
                await tx.item.create({
                  data: {
                    paragraphId: savedParagraph.id,
                    itemNumber: item.title,
                    content: item.content
                  }
                });
              }
            }
          }

          // 参照関係を検出して保存
          const articleText = this.getArticleFullText(article);
          const references = this.referenceDetector.detectReferences(articleText, article.articleNum);
          
          for (const ref of references) {
            await tx.reference.create({
              data: {
                fromArticleId: savedArticle.id,
                referenceText: ref.sourceText,
                referenceType: ref.type,
                referenceSubType: ref.subType || null,
                targetArticleNumber: ref.targetArticleNumber || null,
                targetArticleNumberEnd: ref.targetArticleNumberEnd || null,
                targetParagraphNumber: ref.targetParagraphNumber || null,
                targetItemNumber: ref.targetItemNumber || null,
                targetLawName: ref.targetLawName || null,
                relativeDirection: ref.relativeDirection || null,
                relativeCount: ref.relativeCount || null,
                structureType: ref.structureType || null,
                confidence: ref.confidence || 0.8
              }
            });
          }
        }
      });

      this.processedCount++;
      if (this.options.verbose) {
        console.log(`✅ 完了: ${lawData.lawTitle} (${lawId})`);
      }

    } catch (error) {
      this.errorCount++;
      console.error(`❌ エラー: ${xmlPath}`, error instanceof Error ? error.message : error);
    }
  }

  private findStructureInfo(articleNum: string, structure: any, type: 'part' | 'chapter' | 'section'): string | null {
    // 構造情報から該当する編・章・節を検索
    switch (type) {
      case 'part':
        for (const part of structure.parts || []) {
          // TODO: 条文番号から所属する編を判定するロジック
          return null;
        }
        break;
      case 'chapter':
        for (const chapter of structure.chapters || []) {
          if (chapter.articles?.includes(articleNum)) {
            return chapter.num;
          }
        }
        break;
      case 'section':
        for (const section of structure.sections || []) {
          if (section.articles?.includes(articleNum)) {
            return section.num;
          }
        }
        break;
    }
    return null;
  }

  private getArticleFullText(article: any): string {
    let text = '';
    if (article.articleTitle) {
      text += article.articleTitle + ' ';
    }
    for (const para of article.paragraphs) {
      if (para.content) {
        text += para.content + ' ';
      }
      if (para.items) {
        for (const item of para.items) {
          if (item.content) {
            text += item.content + ' ';
          }
        }
      }
    }
    return text;
  }

  private showProgress(total: number) {
    const elapsed = Date.now() - this.startTime;
    const processed = this.processedCount + this.errorCount + this.skippedCount;
    const percentage = Math.round((processed / total) * 100);
    const estimatedTotal = (elapsed / processed) * total;
    const remaining = estimatedTotal - elapsed;
    
    console.log(`📊 進捗: ${percentage}% (${processed}/${total})`);
    console.log(`⏱️  経過時間: ${this.formatTime(elapsed)}`);
    console.log(`⏳ 推定残り時間: ${this.formatTime(remaining)}`);
  }

  private showFinalStatistics() {
    const elapsed = Date.now() - this.startTime;
    console.log('📈 最終統計:');
    console.log(`  ✅ 処理成功: ${this.processedCount}件`);
    console.log(`  ⏭️  スキップ: ${this.skippedCount}件`);
    console.log(`  ❌ エラー: ${this.errorCount}件`);
    console.log(`  ⏱️  総処理時間: ${this.formatTime(elapsed)}`);
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}時間${minutes % 60}分`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }
}

// CLIとして実行
if (require.main === module) {
  const importer = new LawImporter({
    batchSize: parseInt(process.env.BATCH_SIZE || '100'),
    skipExisting: process.env.SKIP_EXISTING === 'true',
    verbose: process.env.VERBOSE === 'true'
  });
  
  importer.importAll().catch(console.error);
}

export { LawImporter };