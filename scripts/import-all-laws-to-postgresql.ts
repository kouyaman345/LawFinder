#!/usr/bin/env tsx

/**
 * 全法令データをPostgreSQLに投入するスクリプト
 * laws_data/内の10,575法令すべてをデータベースに格納
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const prisma = new PrismaClient();

class PostgreSQLImporter {
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  private batchSize = 50;
  private totalProcessed = 0;
  private totalArticles = 0;
  private totalParagraphs = 0;
  private failedLaws: string[] = [];
  
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false
  });
  
  async importAll(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🚀 PostgreSQL全法令データ投入開始');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    try {
      // 既存データをクリア
      console.log('既存データをクリア中...');
      await prisma.item.deleteMany();
      await prisma.paragraph.deleteMany();
      await prisma.article.deleteMany();
      await prisma.law.deleteMany();
      console.log('✅ 既存データをクリアしました');
      console.log();
      
      // 法令ディレクトリ一覧を取得
      const lawDirs = readdirSync(this.lawsDataPath).filter(dir => {
        const dirPath = join(this.lawsDataPath, dir);
        return dir !== 'sample' && 
               dir !== 'all_law_list.csv' && 
               existsSync(join(dirPath, `${dir}.xml`));
      });
      
      console.log(`📊 処理対象: ${lawDirs.length}法令`);
      console.log();
      
      // バッチ処理
      for (let i = 0; i < lawDirs.length; i += this.batchSize) {
        const batch = lawDirs.slice(i, i + this.batchSize);
        const batchNum = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(lawDirs.length / this.batchSize);
        
        console.log(`バッチ ${batchNum}/${totalBatches} 処理中 (${batch.length}法令)...`);
        
        await this.processBatch(batch);
        
        // 進捗表示
        const progress = ((this.totalProcessed / lawDirs.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`  進捗: ${progress}% (${this.totalProcessed}/${lawDirs.length}) | ${elapsed}分経過`);
        console.log(`  条文数: ${this.totalArticles.toLocaleString()} | 項数: ${this.totalParagraphs.toLocaleString()}`);
        console.log();
        
        // メモリ管理
        if (batchNum % 5 === 0) {
          if (global.gc) {
            global.gc();
            console.log('  メモリをクリーンアップしました');
          }
        }
      }
      
      const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      
      console.log('='.repeat(80));
      console.log('✅ PostgreSQL全データ投入完了');
      console.log('='.repeat(80));
      console.log(`処理法令数: ${this.totalProcessed.toLocaleString()}件`);
      console.log(`総条文数: ${this.totalArticles.toLocaleString()}件`);
      console.log(`総項数: ${this.totalParagraphs.toLocaleString()}件`);
      console.log(`処理時間: ${totalTime}分`);
      
      if (this.failedLaws.length > 0) {
        console.log();
        console.log(`⚠️ 処理失敗: ${this.failedLaws.length}件`);
        console.log(this.failedLaws.slice(0, 10).join(', '));
        if (this.failedLaws.length > 10) {
          console.log(`... 他${this.failedLaws.length - 10}件`);
        }
      }
      
      // 統計情報を表示
      await this.showStatistics();
      
    } catch (error) {
      console.error('エラー:', error);
    } finally {
      await prisma.$disconnect();
    }
  }
  
  private async processBatch(lawDirs: string[]): Promise<void> {
    for (const lawDir of lawDirs) {
      try {
        await this.processLaw(lawDir);
        this.totalProcessed++;
      } catch (error) {
        console.error(`  ⚠️ ${lawDir}の処理失敗:`, error);
        this.failedLaws.push(lawDir);
      }
    }
  }
  
  private async processLaw(lawDir: string): Promise<void> {
    const xmlPath = join(this.lawsDataPath, lawDir, `${lawDir}.xml`);
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    
    // XMLをパース
    const parsed = this.xmlParser.parse(xmlContent);
    const lawData = parsed.Law || parsed.RepealedLaw;
    
    if (!lawData) {
      throw new Error('Invalid XML structure');
    }
    
    // 法令基本情報を抽出
    const lawId = lawDir.split('_')[0]; // 法令番号
    const lawTitle = lawData.LawTitle || lawData['@_LawTitle'] || '';
    const lawNumber = lawData['@_LawNum'] || lawId;
    const promulgationDate = this.parseDate(lawData['@_PromulgateDate']);
    const lawType = lawData['@_LawType'] || 'Act';
    
    // 法令をDBに保存
    const law = await prisma.law.create({
      data: {
        id: lawId,
        title: lawTitle,
        lawNumber: lawNumber,
        promulgationDate: promulgationDate,
        lawType: lawType,
        xmlContent: xmlContent
      }
    });
    
    // 条文を処理
    const lawBody = lawData.LawBody;
    if (lawBody) {
      await this.processLawBody(lawBody, law.id);
    }
    
    // 附則を処理
    const supProvisions = lawData.SupplementaryProvision;
    if (supProvisions) {
      const provisions = Array.isArray(supProvisions) ? supProvisions : [supProvisions];
      for (const provision of provisions) {
        await this.processSupplementaryProvision(provision, law.id);
      }
    }
  }
  
  private async processLawBody(lawBody: any, lawId: string): Promise<void> {
    let sortOrder = 1;
    
    // 本則の処理
    const mainProvision = lawBody.MainProvision;
    if (mainProvision) {
      // 編の処理
      if (mainProvision.Part) {
        const parts = Array.isArray(mainProvision.Part) ? mainProvision.Part : [mainProvision.Part];
        for (const part of parts) {
          sortOrder = await this.processPart(part, lawId, sortOrder);
        }
      }
      
      // 章の処理
      if (mainProvision.Chapter) {
        const chapters = Array.isArray(mainProvision.Chapter) ? mainProvision.Chapter : [mainProvision.Chapter];
        for (const chapter of chapters) {
          sortOrder = await this.processChapter(chapter, lawId, sortOrder, null);
        }
      }
      
      // 直接条文の処理
      if (mainProvision.Article) {
        const articles = Array.isArray(mainProvision.Article) ? mainProvision.Article : [mainProvision.Article];
        for (const article of articles) {
          await this.processArticle(article, lawId, sortOrder++);
        }
      }
    }
  }
  
  private async processPart(part: any, lawId: string, sortOrder: number): Promise<number> {
    const partTitle = part.PartTitle || '';
    
    // 章の処理
    if (part.Chapter) {
      const chapters = Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(chapter, lawId, sortOrder, partTitle);
      }
    }
    
    return sortOrder;
  }
  
  private async processChapter(chapter: any, lawId: string, sortOrder: number, part: string | null): Promise<number> {
    const chapterTitle = chapter.ChapterTitle || '';
    
    // 節の処理
    if (chapter.Section) {
      const sections = Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section];
      for (const section of sections) {
        sortOrder = await this.processSection(section, lawId, sortOrder, part, chapterTitle);
      }
    }
    
    // 直接条文の処理
    if (chapter.Article) {
      const articles = Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article];
      for (const article of articles) {
        await this.processArticle(article, lawId, sortOrder++, part, chapterTitle);
      }
    }
    
    return sortOrder;
  }
  
  private async processSection(section: any, lawId: string, sortOrder: number, part: string | null, chapter: string): Promise<number> {
    const sectionTitle = section.SectionTitle || '';
    
    // 条文の処理
    if (section.Article) {
      const articles = Array.isArray(section.Article) ? section.Article : [section.Article];
      for (const article of articles) {
        await this.processArticle(article, lawId, sortOrder++, part, chapter, sectionTitle);
      }
    }
    
    return sortOrder;
  }
  
  private async processArticle(
    article: any, 
    lawId: string, 
    sortOrder: number,
    part?: string | null,
    chapter?: string,
    section?: string,
    division: string = '本則'
  ): Promise<void> {
    const articleNumber = article['@_Num'] || '';
    const articleTitle = article.ArticleTitle || article.ArticleCaption || '';
    const isDeleted = article['@_Delete'] === 'true';
    
    // 条文の内容を抽出
    let articleContent = '';
    if (article.Paragraph) {
      const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
      articleContent = paragraphs.map((p: any) => {
        if (p.ParagraphSentence?.Sentence) {
          return this.extractText(p.ParagraphSentence.Sentence);
        }
        return '';
      }).join(' ');
    }
    
    // 条文をDBに保存
    const savedArticle = await prisma.article.create({
      data: {
        lawId: lawId,
        articleNumber: articleNumber,
        articleTitle: articleTitle,
        content: articleContent || articleTitle || `第${articleNumber}条`,
        isDeleted: isDeleted,
        sortOrder: sortOrder,
        part: part,
        chapter: chapter,
        section: section,
        division: division
      }
    });
    
    this.totalArticles++;
    
    // 項の処理
    if (article.Paragraph) {
      const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
      let paragraphOrder = 1;
      
      for (const paragraph of paragraphs) {
        await this.processParagraph(paragraph, savedArticle.id, paragraphOrder++);
      }
    }
  }
  
  private async processParagraph(paragraph: any, articleId: string, order: number): Promise<void> {
    const paragraphNum = paragraph['@_Num'] || order.toString();
    let content = '';
    
    // 文の処理
    if (paragraph.ParagraphSentence) {
      const sentence = paragraph.ParagraphSentence.Sentence;
      if (sentence) {
        content = this.extractText(sentence);
      }
    }
    
    // 項をDBに保存
    const savedParagraph = await prisma.paragraph.create({
      data: {
        articleId: articleId,
        paragraphNumber: parseInt(paragraphNum) || order,
        content: content
      }
    });
    
    this.totalParagraphs++;
    
    // 号の処理
    if (paragraph.Item) {
      const items = Array.isArray(paragraph.Item) ? paragraph.Item : [paragraph.Item];
      let itemOrder = 1;
      
      for (const item of items) {
        await this.processItem(item, savedParagraph.id, itemOrder++);
      }
    }
  }
  
  private async processItem(item: any, paragraphId: string, order: number): Promise<void> {
    const itemNumber = item['@_Num'] || order.toString();
    let content = '';
    
    // 文の処理
    if (item.ItemSentence) {
      const sentence = item.ItemSentence.Sentence;
      if (sentence) {
        content = this.extractText(sentence);
      }
    }
    
    // 号をDBに保存
    await prisma.item.create({
      data: {
        paragraphId: paragraphId,
        itemNumber: itemNumber,
        content: content
      }
    });
  }
  
  private async processSupplementaryProvision(provision: any, lawId: string): Promise<void> {
    const provisionLabel = provision['@_AmendLawNum'] ? 
      `附則（${provision['@_AmendLawNum']}）` : '附則';
    
    let sortOrder = 10000; // 附則は大きな番号から開始
    
    // 附則の条文処理
    if (provision.Article) {
      const articles = Array.isArray(provision.Article) ? provision.Article : [provision.Article];
      for (const article of articles) {
        await this.processArticle(article, lawId, sortOrder++, null, null, null, provisionLabel);
      }
    }
  }
  
  private extractText(node: any): string {
    if (typeof node === 'string') {
      return node;
    }
    if (node['#text']) {
      return node['#text'];
    }
    if (Array.isArray(node)) {
      return node.map(n => this.extractText(n)).join('');
    }
    return '';
  }
  
  private parseDate(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    
    // 令和1年5月1日 -> Date
    const match = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      
      // 令和元年を2019年として扱う（簡易版）
      const actualYear = year < 100 ? 2018 + year : year;
      return new Date(actualYear, month - 1, day);
    }
    
    return new Date();
  }
  
  private async showStatistics(): Promise<void> {
    console.log();
    console.log('📊 データベース統計:');
    
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    const paragraphCount = await prisma.paragraph.count();
    const itemCount = await prisma.item.count();
    
    console.log(`  法令数: ${lawCount.toLocaleString()}`);
    console.log(`  条文数: ${articleCount.toLocaleString()}`);
    console.log(`  項数: ${paragraphCount.toLocaleString()}`);
    console.log(`  号数: ${itemCount.toLocaleString()}`);
    
    // サンプル法令を表示
    const sampleLaws = await prisma.law.findMany({
      take: 5,
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    console.log();
    console.log('📖 サンプル法令:');
    sampleLaws.forEach(law => {
      console.log(`  - ${law.title} (${law._count.articles}条)`);
    });
  }
}

// メイン実行
async function main() {
  console.log('⚠️ このスクリプトは全法令データをPostgreSQLに投入します。');
  console.log('既存のデータは削除されます。続行しますか？');
  console.log('続行する場合は3秒後に開始します... (Ctrl+Cでキャンセル)');
  console.log();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const importer = new PostgreSQLImporter();
  await importer.importAll();
}

main().catch(console.error);