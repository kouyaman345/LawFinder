#!/usr/bin/env tsx

/**
 * バージョニング対応の法令データインポートスクリプト（修正版）
 * 重複エラーを回避しながら全法令データを投入
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const prisma = new PrismaClient();

interface LawVersionInfo {
  lawId: string;
  versionDate: string;
  directoryName: string;
  xmlPath: string;
}

class FixedVersionedLawImporter {
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  private batchSize = 100;
  private totalProcessed = 0;
  private totalArticles = 0;
  private totalParagraphs = 0;
  private failedLaws: string[] = [];
  private skipExisting = true; // 既存データをスキップ
  
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false
  });
  
  async importAll(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🚀 修正版バージョニング対応 法令データ投入開始');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    try {
      // 法令バージョン情報を収集
      const lawVersions = this.collectLawVersions();
      const lawGroups = this.groupByLawId(lawVersions);
      
      console.log(`📊 処理対象: ${lawGroups.size}法令, ${lawVersions.length}バージョン`);
      console.log(`📊 複数バージョン法令: ${Array.from(lawGroups.values()).filter(v => v.length > 1).length}件`);
      console.log();
      
      // 既存データを確認
      const existingLaws = await prisma.lawMaster.findMany({
        select: { id: true }
      });
      const existingLawIds = new Set(existingLaws.map(l => l.id));
      console.log(`📊 既存法令: ${existingLawIds.size}件`);
      
      // 法令ごとに処理
      let processedLaws = 0;
      let skippedLaws = 0;
      
      for (const [lawId, versions] of lawGroups) {
        // 既存データをスキップ
        if (this.skipExisting && existingLawIds.has(lawId)) {
          skippedLaws++;
          continue;
        }
        
        try {
          await this.processLawGroup(lawId, versions);
          processedLaws++;
          
          if (processedLaws % 100 === 0) {
            console.log(`処理済み: ${processedLaws}件, スキップ: ${skippedLaws}件`);
          }
        } catch (error: any) {
          // エラーログを簡潔に
          if (!error.message?.includes('already exists')) {
            console.error(`  ⚠️ ${lawId}: ${error.message?.substring(0, 50)}`);
          }
          this.failedLaws.push(lawId);
        }
      }
      
      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000 / 60);
      
      console.log();
      console.log('='.repeat(80));
      console.log(`✅ インポート完了`);
      console.log(`処理法令数: ${processedLaws}/${lawGroups.size}`);
      console.log(`スキップ: ${skippedLaws}件`);
      console.log(`失敗: ${this.failedLaws.length}件`);
      console.log(`処理時間: ${totalTime}分`);
      
      // 統計情報を表示
      await this.showStatistics();
      
    } catch (error) {
      console.error('エラー:', error);
    } finally {
      await prisma.$disconnect();
    }
  }
  
  private collectLawVersions(): LawVersionInfo[] {
    const versions: LawVersionInfo[] = [];
    
    const lawDirs = readdirSync(this.lawsDataPath).filter(dir => {
      const dirPath = join(this.lawsDataPath, dir);
      return dir !== 'sample' && 
             dir !== 'all_law_list.csv' && 
             existsSync(dirPath);
    });
    
    for (const dir of lawDirs) {
      const parts = dir.split('_');
      if (parts.length >= 2) {
        const lawId = parts[0];
        const versionDate = parts[1];
        const xmlPath = join(this.lawsDataPath, dir, `${dir}.xml`);
        
        if (existsSync(xmlPath)) {
          versions.push({
            lawId,
            versionDate,
            directoryName: dir,
            xmlPath
          });
        }
      }
    }
    
    return versions;
  }
  
  private groupByLawId(versions: LawVersionInfo[]): Map<string, LawVersionInfo[]> {
    const groups = new Map<string, LawVersionInfo[]>();
    
    for (const version of versions) {
      if (!groups.has(version.lawId)) {
        groups.set(version.lawId, []);
      }
      groups.get(version.lawId)!.push(version);
    }
    
    // 各グループ内でバージョン日付でソート
    for (const versions of groups.values()) {
      versions.sort((a, b) => a.versionDate.localeCompare(b.versionDate));
    }
    
    return groups;
  }
  
  private async processLawGroup(lawId: string, versions: LawVersionInfo[]): Promise<void> {
    // 最初のバージョンから法令基本情報を取得
    const firstVersion = versions[0];
    const xmlContent = readFileSync(firstVersion.xmlPath, 'utf-8');
    const parsed = this.xmlParser.parse(xmlContent);
    const lawData = parsed.Law || parsed.RepealedLaw;
    
    if (!lawData) {
      throw new Error('Invalid XML structure');
    }
    
    // 法令マスターを作成
    const lawTitle = lawData.LawTitle || lawData['@_LawTitle'] || '';
    const lawNumber = lawData['@_LawNum'] || lawId;
    const lawType = lawData['@_LawType'] || 'Act';
    
    // upsertを使用して重複を回避
    const lawMaster = await prisma.lawMaster.upsert({
      where: { id: lawId },
      update: { 
        title: lawTitle,
        updatedAt: new Date() 
      },
      create: {
        id: lawId,
        title: lawTitle,
        lawType: lawType,
        lawNumber: lawNumber
      }
    });
    
    // 各バージョンを処理
    let latestEffectiveVersion: LawVersionInfo | null = null;
    const now = new Date();
    
    for (const version of versions) {
      const versionDate = this.parseVersionDate(version.versionDate);
      
      // 施行済みの最新バージョンを判定
      if (versionDate <= now) {
        latestEffectiveVersion = version;
      }
      
      await this.processLawVersion(lawId, version, false);
    }
    
    // 最新バージョンフラグを設定
    if (latestEffectiveVersion) {
      const versionId = `${lawId}_${latestEffectiveVersion.versionDate}`;
      
      await prisma.lawVersion.update({
        where: { id: versionId },
        data: { isLatest: true }
      });
      
      await prisma.lawMaster.update({
        where: { id: lawId },
        data: { currentVersionId: versionId }
      });
    }
  }
  
  private async processLawVersion(lawId: string, version: LawVersionInfo, isLatest: boolean): Promise<void> {
    const versionId = `${lawId}_${version.versionDate}`;
    
    // 既存バージョンをチェック
    const existingVersion = await prisma.lawVersion.findUnique({
      where: { id: versionId }
    });
    
    if (existingVersion) {
      return; // 既存バージョンはスキップ
    }
    
    const xmlContent = readFileSync(version.xmlPath, 'utf-8');
    const parsed = this.xmlParser.parse(xmlContent);
    const lawData = parsed.Law || parsed.RepealedLaw;
    
    const versionDate = this.parseVersionDate(version.versionDate);
    const promulgationDate = this.parseDate(lawData['@_PromulgateDate']);
    const status = lawData['@_Status'] || '現行';
    
    // バージョンを作成
    await prisma.lawVersion.create({
      data: {
        id: versionId,
        lawId: lawId,
        versionDate: versionDate,
        promulgationDate: promulgationDate,
        xmlContent: xmlContent,
        status: status,
        isLatest: isLatest
      }
    });
    
    // 条文を処理
    const lawBody = lawData.LawBody;
    if (lawBody) {
      await this.processLawBody(lawBody, versionId);
    }
    
    this.totalProcessed++;
  }
  
  private async processLawBody(lawBody: any, versionId: string): Promise<void> {
    let sortOrder = 0;
    const processedArticles = new Set<string>(); // 処理済み条番号を記録
    
    // 本則を処理
    if (lawBody.MainProvision) {
      sortOrder = await this.processProvision(
        lawBody.MainProvision, 
        versionId, 
        '本則', 
        sortOrder, 
        processedArticles
      );
    }
    
    // 附則を処理
    if (lawBody.SupplProvision) {
      const supplProvisions = Array.isArray(lawBody.SupplProvision) 
        ? lawBody.SupplProvision 
        : [lawBody.SupplProvision];
      
      for (let i = 0; i < supplProvisions.length; i++) {
        sortOrder = await this.processProvision(
          supplProvisions[i], 
          versionId, 
          `附則${i > 0 ? i + 1 : ''}`, 
          sortOrder + 10000 * (i + 1),
          processedArticles
        );
      }
    }
  }
  
  private async processProvision(
    provision: any, 
    versionId: string, 
    division: string, 
    startOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    let sortOrder = startOrder;
    
    // 条を直接処理
    if (provision.Article) {
      const articles = Array.isArray(provision.Article) ? provision.Article : [provision.Article];
      for (const article of articles) {
        sortOrder = await this.processArticle(
          article, versionId, division, null, null, null, null, sortOrder, processedArticles
        );
        sortOrder++;
      }
    }
    
    // 章を処理
    if (provision.Chapter) {
      const chapters = Array.isArray(provision.Chapter) ? provision.Chapter : [provision.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(
          chapter, versionId, division, null, sortOrder, processedArticles
        );
      }
    }
    
    // 編を処理
    if (provision.Part) {
      const parts = Array.isArray(provision.Part) ? provision.Part : [provision.Part];
      for (const part of parts) {
        sortOrder = await this.processPart(
          part, versionId, division, sortOrder, processedArticles
        );
      }
    }
    
    return sortOrder;
  }
  
  private async processPart(
    part: any, 
    versionId: string, 
    division: string, 
    startOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    let sortOrder = startOrder;
    const partTitle = part.PartTitle || '';
    
    if (part.Chapter) {
      const chapters = Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(
          chapter, versionId, division, partTitle, sortOrder, processedArticles
        );
      }
    }
    
    return sortOrder;
  }
  
  private async processChapter(
    chapter: any, 
    versionId: string, 
    division: string, 
    part: string | null, 
    startOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    let sortOrder = startOrder;
    const chapterTitle = chapter.ChapterTitle || '';
    
    // 節を処理
    if (chapter.Section) {
      const sections = Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section];
      for (const section of sections) {
        sortOrder = await this.processSection(
          section, versionId, division, part, chapterTitle, sortOrder, processedArticles
        );
      }
    }
    
    // 章直下の条を処理
    if (chapter.Article) {
      const articles = Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article];
      for (const article of articles) {
        sortOrder = await this.processArticle(
          article, versionId, division, part, chapterTitle, null, null, sortOrder, processedArticles
        );
        sortOrder++;
      }
    }
    
    return sortOrder;
  }
  
  private async processSection(
    section: any, 
    versionId: string, 
    division: string, 
    part: string | null, 
    chapter: string, 
    startOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    let sortOrder = startOrder;
    const sectionTitle = section.SectionTitle || '';
    
    // 款を処理
    if (section.Subsection) {
      const subsections = Array.isArray(section.Subsection) ? section.Subsection : [section.Subsection];
      for (const subsection of subsections) {
        sortOrder = await this.processSubsection(
          subsection, versionId, division, part, chapter, sectionTitle, sortOrder, processedArticles
        );
      }
    }
    
    // 節直下の条を処理
    if (section.Article) {
      const articles = Array.isArray(section.Article) ? section.Article : [section.Article];
      for (const article of articles) {
        sortOrder = await this.processArticle(
          article, versionId, division, part, chapter, sectionTitle, null, sortOrder, processedArticles
        );
        sortOrder++;
      }
    }
    
    return sortOrder;
  }
  
  private async processSubsection(
    subsection: any, 
    versionId: string, 
    division: string, 
    part: string | null, 
    chapter: string, 
    section: string, 
    startOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    let sortOrder = startOrder;
    const subsectionTitle = subsection.SubsectionTitle || '';
    
    if (subsection.Article) {
      const articles = Array.isArray(subsection.Article) ? subsection.Article : [subsection.Article];
      for (const article of articles) {
        sortOrder = await this.processArticle(
          article, versionId, division, part, chapter, section, subsectionTitle, sortOrder, processedArticles
        );
        sortOrder++;
      }
    }
    
    return sortOrder;
  }
  
  private async processArticle(
    article: any,
    versionId: string,
    division: string,
    part: string | null,
    chapter: string | null,
    section: string | null,
    subsection: string | null,
    sortOrder: number,
    processedArticles: Set<string>
  ): Promise<number> {
    const articleNumber = article['@_Num'] || '';
    
    // 重複チェック（附則の場合は区分を含めてユニークキーとする）
    const uniqueKey = `${division}_${articleNumber}`;
    if (processedArticles.has(uniqueKey)) {
      return sortOrder; // 既に処理済みならスキップ
    }
    processedArticles.add(uniqueKey);
    
    const articleTitle = article.ArticleTitle || null;
    const articleCaption = article.ArticleCaption || '';
    const isDeleted = article['@_Delete'] === 'true';
    
    // 条文内容を構築
    let content = articleCaption;
    if (article.Paragraph) {
      const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
      const paragraphTexts = paragraphs.map((p: any) => this.extractText(p));
      if (content) {
        content += '\n' + paragraphTexts.join('\n');
      } else {
        content = paragraphTexts.join('\n');
      }
    }
    
    try {
      // 条を保存（divisionを含めたユニーク制約に対応）
      const result = await prisma.$queryRawUnsafe<{id: string}[]>(`
        INSERT INTO "Article" (
          id, "versionId", "articleNumber", "articleTitle", 
          content, part, chapter, section, subsection, 
          division, "sortOrder", "isDeleted"
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ("versionId", "articleNumber") DO UPDATE
        SET division = COALESCE("Article".division, '') || ' / ' || $9
        RETURNING id
      `, versionId, articleNumber, articleTitle, content, part, chapter, section, subsection, division, sortOrder, isDeleted);
      
      if (result.length > 0) {
        const articleId = result[0].id;
        this.totalArticles++;
        
        // 項を処理
        if (article.Paragraph) {
          const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
          for (let i = 0; i < paragraphs.length; i++) {
            await this.processParagraph(paragraphs[i], articleId, i + 1);
          }
        }
      }
    } catch (error: any) {
      // エラーを静かに処理
      if (!error.message?.includes('already exists')) {
        console.error(`Article error: ${error.message?.substring(0, 50)}`);
      }
    }
    
    return sortOrder;
  }
  
  private async processParagraph(paragraph: any, articleId: string, paragraphNumber: number): Promise<void> {
    const content = this.extractText(paragraph);
    
    try {
      const result = await prisma.$queryRawUnsafe<{id: string}[]>(`
        INSERT INTO "Paragraph" (id, "articleId", "paragraphNumber", content)
        VALUES (gen_random_uuid(), $1, $2, $3)
        ON CONFLICT ("articleId", "paragraphNumber") DO NOTHING
        RETURNING id
      `, articleId, paragraphNumber, content);
      
      if (result.length > 0) {
        const paragraphId = result[0].id;
        this.totalParagraphs++;
        
        // 号を処理
        if (paragraph.Item) {
          const items = Array.isArray(paragraph.Item) ? paragraph.Item : [paragraph.Item];
          for (const item of items) {
            await this.processItem(item, paragraphId);
          }
        }
      }
    } catch (error: any) {
      // エラーを静かに処理
      if (!error.message?.includes('already exists')) {
        console.error(`Paragraph error: ${error.message?.substring(0, 50)}`);
      }
    }
  }
  
  private async processItem(item: any, paragraphId: string): Promise<void> {
    const itemNumber = item['@_Num'] || '';
    const content = this.extractText(item);
    
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Item" (id, "paragraphId", "itemNumber", content)
        VALUES (gen_random_uuid(), $1, $2, $3)
        ON CONFLICT ("paragraphId", "itemNumber") DO NOTHING
      `, paragraphId, itemNumber, content);
    } catch (error: any) {
      // エラーを静かに処理
      if (!error.message?.includes('already exists')) {
        console.error(`Item error: ${error.message?.substring(0, 50)}`);
      }
    }
  }
  
  private extractText(node: any): string {
    if (typeof node === 'string') return node;
    if (!node) return '';
    
    let text = '';
    
    if (node.ParagraphNum) text += node.ParagraphNum + ' ';
    if (node.ItemTitle) text += node.ItemTitle + ' ';
    if (node.Sentence) {
      const sentences = Array.isArray(node.Sentence) ? node.Sentence : [node.Sentence];
      text += sentences.map((s: any) => this.extractSentenceText(s)).join('');
    }
    if (node['#text']) text += node['#text'];
    
    return text.trim();
  }
  
  private extractSentenceText(sentence: any): string {
    if (typeof sentence === 'string') return sentence;
    if (!sentence) return '';
    
    let text = '';
    if (sentence['#text']) text = sentence['#text'];
    
    // Ruby要素を処理
    if (sentence.Ruby) {
      const rubies = Array.isArray(sentence.Ruby) ? sentence.Ruby : [sentence.Ruby];
      for (const ruby of rubies) {
        if (ruby.Rb) text = text.replace(ruby.Rb, ruby.Rb);
      }
    }
    
    return text;
  }
  
  private parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    
    // 平成や昭和の形式を処理
    if (dateStr.includes('平成') || dateStr.includes('昭和')) {
      return null;
    }
    
    // YYYY-MM-DD or YYYY/MM/DD形式
    const match = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    
    return null;
  }
  
  private parseVersionDate(versionDate: string): Date {
    // YYYYMMDD形式をDateに変換
    const year = parseInt(versionDate.substring(0, 4));
    const month = parseInt(versionDate.substring(4, 6)) - 1;
    const day = parseInt(versionDate.substring(6, 8));
    return new Date(year, month, day);
  }
  
  private async showStatistics(): Promise<void> {
    console.log();
    console.log('📊 データベース統計情報:');
    
    const lawMasterCount = await prisma.lawMaster.count();
    const versionCount = await prisma.lawVersion.count();
    const latestCount = await prisma.lawVersion.count({ where: { isLatest: true } });
    const articleCount = await prisma.article.count();
    const paragraphCount = await prisma.paragraph.count();
    
    console.log(`  法令マスター: ${lawMasterCount}件`);
    console.log(`  総バージョン数: ${versionCount}件`);
    console.log(`  最新バージョン: ${latestCount}件`);
    console.log(`  条文: ${articleCount}件`);
    console.log(`  項: ${paragraphCount}件`);
  }
}

// メイン処理
async function main() {
  const importer = new FixedVersionedLawImporter();
  await importer.importAll();
}

main().catch(console.error);