#!/usr/bin/env tsx

/**
 * 改善版：全法令データをPostgreSQLに投入するスクリプト
 * 10,573法令すべてを確実にインポート
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const prisma = new PrismaClient();

class ImprovedPostgreSQLImporter {
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  private batchSize = 20; // より小さいバッチサイズ
  private totalProcessed = 0;
  private totalArticles = 0;
  private totalParagraphs = 0;
  private failedLaws: { lawId: string; error: string }[] = [];
  private successfulLaws: string[] = [];
  
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    removeNSPrefix: true
  });
  
  async importAll(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🚀 PostgreSQL全法令データ投入開始（改善版）');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    try {
      // 既存データをクリア
      console.log('既存データをクリア中...');
      await this.clearDatabase();
      console.log('✅ 既存データをクリアしました');
      console.log();
      
      // 法令ディレクトリ一覧を取得
      const lawDirs = this.getLawDirectories();
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
        this.showProgress(lawDirs.length, startTime);
        
        // メモリ管理
        if (batchNum % 10 === 0) {
          if (global.gc) {
            global.gc();
            console.log('  メモリをクリーンアップしました');
          }
        }
      }
      
      await this.showFinalReport(startTime);
      
    } catch (error) {
      console.error('致命的エラー:', error);
    } finally {
      await prisma.$disconnect();
    }
  }
  
  private async clearDatabase(): Promise<void> {
    await prisma.$transaction([
      prisma.item.deleteMany(),
      prisma.paragraph.deleteMany(),
      prisma.article.deleteMany(),
      prisma.law.deleteMany()
    ]);
  }
  
  private getLawDirectories(): string[] {
    return readdirSync(this.lawsDataPath)
      .filter(dir => {
        if (dir === 'sample' || dir === 'all_law_list.csv') return false;
        const dirPath = join(this.lawsDataPath, dir);
        const xmlPath = join(dirPath, `${dir}.xml`);
        return existsSync(xmlPath);
      })
      .sort();
  }
  
  private async processBatch(lawDirs: string[]): Promise<void> {
    for (const lawDir of lawDirs) {
      try {
        await this.processLaw(lawDir);
        this.successfulLaws.push(lawDir);
        this.totalProcessed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ⚠️ ${lawDir}の処理失敗`);
        this.failedLaws.push({ lawId: lawDir, error: errorMessage });
      }
    }
  }
  
  private async processLaw(lawDir: string): Promise<void> {
    const xmlPath = join(this.lawsDataPath, lawDir, `${lawDir}.xml`);
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    
    // XMLをパース
    const parsed = this.xmlParser.parse(xmlContent);
    const lawData = parsed.Law || parsed.RepealedLaw || parsed.Act;
    
    if (!lawData) {
      throw new Error('Invalid XML structure');
    }
    
    // 法令基本情報を抽出
    const lawId = lawDir.split('_')[0];
    const lawTitle = this.extractText(lawData.LawTitle) || lawData['@_LawTitle'] || '';
    const lawNumber = lawData['@_LawNum'] || lawId;
    const promulgationDate = this.parseDate(lawData['@_PromulgateDate']);
    const lawType = lawData['@_LawType'] || 'Act';
    
    // 既存の法令を確認（重複回避）
    const existingLaw = await prisma.law.findUnique({
      where: { id: lawId }
    });
    
    if (existingLaw) {
      console.log(`  ℹ️ ${lawId}は既に存在します（スキップ）`);
      return;
    }
    
    // 法令をDBに保存
    const law = await prisma.law.create({
      data: {
        id: lawId,
        title: lawTitle,
        lawNumber: lawNumber,
        promulgationDate: promulgationDate,
        lawType: lawType,
        xmlContent: xmlContent.substring(0, 1000000) // 1MBに制限
      }
    });
    
    // 条文を処理
    await this.processLawContent(lawData, law.id);
  }
  
  private async processLawContent(lawData: any, lawId: string): Promise<void> {
    let sortOrder = 1;
    
    // 本則の処理
    const lawBody = lawData.LawBody;
    if (lawBody) {
      const mainProvision = lawBody.MainProvision;
      if (mainProvision) {
        sortOrder = await this.processProvision(mainProvision, lawId, sortOrder, '本則');
      }
    }
    
    // 附則の処理
    const supProvisions = lawData.SupplementaryProvision;
    if (supProvisions) {
      const provisions = Array.isArray(supProvisions) ? supProvisions : [supProvisions];
      for (const provision of provisions) {
        const label = provision['@_AmendLawNum'] ? 
          `附則（${provision['@_AmendLawNum']}）` : '附則';
        sortOrder = await this.processProvision(provision, lawId, sortOrder, label);
      }
    }
  }
  
  private async processProvision(provision: any, lawId: string, startOrder: number, division: string): Promise<number> {
    let sortOrder = startOrder;
    
    // 編→章→節→条の順で処理
    const parts = provision.Part ? (Array.isArray(provision.Part) ? provision.Part : [provision.Part]) : [];
    const chapters = provision.Chapter ? (Array.isArray(provision.Chapter) ? provision.Chapter : [provision.Chapter]) : [];
    const sections = provision.Section ? (Array.isArray(provision.Section) ? provision.Section : [provision.Section]) : [];
    const articles = provision.Article ? (Array.isArray(provision.Article) ? provision.Article : [provision.Article]) : [];
    
    // 編の処理
    for (const part of parts) {
      const partTitle = this.extractText(part.PartTitle) || '';
      const partChapters = part.Chapter ? (Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter]) : [];
      const partArticles = part.Article ? (Array.isArray(part.Article) ? part.Article : [part.Article]) : [];
      
      for (const chapter of partChapters) {
        sortOrder = await this.processChapter(chapter, lawId, sortOrder, partTitle, division);
      }
      
      for (const article of partArticles) {
        await this.processArticle(article, lawId, sortOrder++, partTitle, null, null, division);
      }
    }
    
    // 章の処理
    for (const chapter of chapters) {
      sortOrder = await this.processChapter(chapter, lawId, sortOrder, null, division);
    }
    
    // 節の処理
    for (const section of sections) {
      sortOrder = await this.processSection(section, lawId, sortOrder, null, null, division);
    }
    
    // 直接条文の処理
    for (const article of articles) {
      await this.processArticle(article, lawId, sortOrder++, null, null, null, division);
    }
    
    return sortOrder;
  }
  
  private async processChapter(chapter: any, lawId: string, startOrder: number, part: string | null, division: string): Promise<number> {
    let sortOrder = startOrder;
    const chapterTitle = this.extractText(chapter.ChapterTitle) || '';
    
    const sections = chapter.Section ? (Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section]) : [];
    const articles = chapter.Article ? (Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article]) : [];
    
    for (const section of sections) {
      sortOrder = await this.processSection(section, lawId, sortOrder, part, chapterTitle, division);
    }
    
    for (const article of articles) {
      await this.processArticle(article, lawId, sortOrder++, part, chapterTitle, null, division);
    }
    
    return sortOrder;
  }
  
  private async processSection(section: any, lawId: string, startOrder: number, part: string | null, chapter: string | null, division: string): Promise<number> {
    let sortOrder = startOrder;
    const sectionTitle = this.extractText(section.SectionTitle) || '';
    
    const articles = section.Article ? (Array.isArray(section.Article) ? section.Article : [section.Article]) : [];
    
    for (const article of articles) {
      await this.processArticle(article, lawId, sortOrder++, part, chapter, sectionTitle, division);
    }
    
    return sortOrder;
  }
  
  private async processArticle(
    article: any,
    lawId: string,
    sortOrder: number,
    part: string | null,
    chapter: string | null,
    section: string | null,
    division: string
  ): Promise<void> {
    const articleNumber = article['@_Num'] || '';
    const articleTitle = this.extractText(article.ArticleTitle || article.ArticleCaption) || '';
    const isDeleted = article['@_Delete'] === 'true';
    
    // 条文内容を抽出
    let articleContent = articleTitle;
    const paragraphs = article.Paragraph ? (Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph]) : [];
    
    if (paragraphs.length > 0) {
      const paragraphTexts = paragraphs.map((p: any) => {
        if (p.ParagraphSentence?.Sentence) {
          return this.extractText(p.ParagraphSentence.Sentence);
        }
        return '';
      }).filter((t: string) => t);
      
      if (paragraphTexts.length > 0) {
        articleContent = paragraphTexts.join(' ');
      }
    }
    
    // 条文をDBに保存
    const savedArticle = await prisma.article.create({
      data: {
        lawId: lawId,
        articleNumber: articleNumber,
        articleTitle: articleTitle,
        content: articleContent || `第${articleNumber}条`,
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
    let paragraphOrder = 1;
    for (const paragraph of paragraphs) {
      await this.processParagraph(paragraph, savedArticle.id, paragraphOrder++);
    }
  }
  
  private async processParagraph(paragraph: any, articleId: string, order: number): Promise<void> {
    const paragraphNum = paragraph['@_Num'] || order.toString();
    let content = '';
    
    if (paragraph.ParagraphSentence?.Sentence) {
      content = this.extractText(paragraph.ParagraphSentence.Sentence);
    }
    
    // 項をDBに保存
    const savedParagraph = await prisma.paragraph.create({
      data: {
        articleId: articleId,
        paragraphNumber: parseInt(paragraphNum) || order,
        content: content || ''
      }
    });
    
    this.totalParagraphs++;
    
    // 号の処理
    const items = paragraph.Item ? (Array.isArray(paragraph.Item) ? paragraph.Item : [paragraph.Item]) : [];
    let itemOrder = 1;
    
    for (const item of items) {
      await this.processItem(item, savedParagraph.id, itemOrder++);
    }
  }
  
  private async processItem(item: any, paragraphId: string, order: number): Promise<void> {
    const itemNumber = item['@_Num'] || order.toString();
    let content = '';
    
    if (item.ItemSentence?.Sentence) {
      content = this.extractText(item.ItemSentence.Sentence);
    }
    
    // 号をDBに保存
    await prisma.item.create({
      data: {
        paragraphId: paragraphId,
        itemNumber: itemNumber,
        content: content || ''
      }
    });
  }
  
  private extractText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node['#text']) return node['#text'];
    if (Array.isArray(node)) {
      return node.map(n => this.extractText(n)).join('');
    }
    if (node.Ruby) {
      return this.extractText(node.Ruby['#text']);
    }
    return '';
  }
  
  private parseDate(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    
    const match = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      const actualYear = year < 100 ? 2018 + year : year;
      return new Date(actualYear, month - 1, day);
    }
    
    return new Date();
  }
  
  private showProgress(total: number, startTime: number): void {
    const progress = ((this.totalProcessed / total) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = this.totalProcessed / (elapsed as any) || 0;
    const remaining = ((total - this.totalProcessed) / rate).toFixed(1);
    
    console.log(`  進捗: ${progress}% (${this.totalProcessed}/${total})`);
    console.log(`  経過時間: ${elapsed}分 | 推定残り時間: ${remaining}分`);
    console.log(`  条文数: ${this.totalArticles.toLocaleString()} | 項数: ${this.totalParagraphs.toLocaleString()}`);
    console.log();
  }
  
  private async showFinalReport(startTime: number): Promise<void> {
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('='.repeat(80));
    console.log('✅ PostgreSQL全データ投入完了');
    console.log('='.repeat(80));
    console.log(`成功: ${this.successfulLaws.length.toLocaleString()}件`);
    console.log(`失敗: ${this.failedLaws.length}件`);
    console.log(`総条文数: ${this.totalArticles.toLocaleString()}件`);
    console.log(`総項数: ${this.totalParagraphs.toLocaleString()}件`);
    console.log(`処理時間: ${totalTime}分`);
    
    if (this.failedLaws.length > 0) {
      console.log();
      console.log('⚠️ 処理失敗法令:');
      this.failedLaws.slice(0, 10).forEach(f => {
        console.log(`  ${f.lawId}: ${f.error.substring(0, 100)}`);
      });
      if (this.failedLaws.length > 10) {
        console.log(`  ... 他${this.failedLaws.length - 10}件`);
      }
    }
    
    // データベース統計
    const stats = await prisma.$transaction([
      prisma.law.count(),
      prisma.article.count(),
      prisma.paragraph.count(),
      prisma.item.count()
    ]);
    
    console.log();
    console.log('📊 データベース統計:');
    console.log(`  法令数: ${stats[0].toLocaleString()}`);
    console.log(`  条文数: ${stats[1].toLocaleString()}`);
    console.log(`  項数: ${stats[2].toLocaleString()}`);
    console.log(`  号数: ${stats[3].toLocaleString()}`);
  }
}

// メイン実行
async function main() {
  console.log('⚠️ このスクリプトは全10,573法令をPostgreSQLに投入します。');
  console.log('既存のデータは削除されます。');
  console.log('推定処理時間: 30-60分');
  console.log();
  console.log('続行する場合は5秒後に開始します... (Ctrl+Cでキャンセル)');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const importer = new ImprovedPostgreSQLImporter();
  await importer.importAll();
}

main().catch(console.error);