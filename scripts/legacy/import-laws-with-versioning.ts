#!/usr/bin/env tsx

/**
 * バージョニング対応の法令データインポートスクリプト
 * 同一法令の複数バージョンを管理し、最新版を自動判定
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const prisma = new PrismaClient();

interface LawVersionInfo {
  lawId: string;           // 法令番号
  versionDate: string;     // 施行日（YYYYMMDD）
  directoryName: string;   // ディレクトリ名
  xmlPath: string;         // XMLファイルパス
}

class VersionedLawImporter {
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
    console.log('🚀 バージョニング対応 法令データ投入開始');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    try {
      // 既存データをクリア
      console.log('既存データをクリア中...');
      await prisma.$executeRaw`TRUNCATE TABLE "Item" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "Paragraph" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "Article" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "Reference" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "AmendmentRelation" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "LawVersion" CASCADE`;
      await prisma.$executeRaw`TRUNCATE TABLE "LawMaster" CASCADE`;
      console.log('✅ 既存データをクリアしました');
      console.log();
      
      // 法令バージョン情報を収集
      const lawVersions = this.collectLawVersions();
      const lawGroups = this.groupByLawId(lawVersions);
      
      console.log(`📊 処理対象: ${lawGroups.size}法令, ${lawVersions.length}バージョン`);
      console.log(`📊 複数バージョン法令: ${Array.from(lawGroups.values()).filter(v => v.length > 1).length}件`);
      console.log();
      
      // 法令ごとに処理
      let processedLaws = 0;
      for (const [lawId, versions] of lawGroups) {
        try {
          await this.processLawGroup(lawId, versions);
          processedLaws++;
          
          if (processedLaws % 100 === 0) {
            console.log(`処理済み: ${processedLaws}/${lawGroups.size}法令`);
          }
        } catch (error) {
          console.error(`  ⚠️ ${lawId}の処理失敗:`, error);
          this.failedLaws.push(lawId);
        }
      }
      
      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000 / 60);
      
      console.log();
      console.log('='.repeat(80));
      console.log(`✅ インポート完了`);
      console.log(`処理法令数: ${processedLaws}/${lawGroups.size}`);
      console.log(`総バージョン数: ${lawVersions.length}`);
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
    
    const lawMaster = await prisma.$executeRawUnsafe(`
      INSERT INTO "LawMaster" (id, title, "lawType", "lawNumber", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id
    `, lawId, lawTitle, lawType, lawNumber);
    
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
      await prisma.$executeRawUnsafe(`
        UPDATE "LawVersion" 
        SET "isLatest" = true 
        WHERE id = $1
      `, versionId);
      
      await prisma.$executeRawUnsafe(`
        UPDATE "LawMaster" 
        SET "currentVersionId" = $1, "updatedAt" = NOW()
        WHERE id = $2
      `, versionId, lawId);
    }
  }
  
  private async processLawVersion(lawId: string, version: LawVersionInfo, isLatest: boolean): Promise<void> {
    const xmlContent = readFileSync(version.xmlPath, 'utf-8');
    const parsed = this.xmlParser.parse(xmlContent);
    const lawData = parsed.Law || parsed.RepealedLaw;
    
    const versionId = `${lawId}_${version.versionDate}`;
    const versionDate = this.parseVersionDate(version.versionDate);
    const promulgationDate = this.parseDate(lawData['@_PromulgateDate']);
    const status = lawData['@_Status'] || '現行';
    
    // バージョンを作成
    await prisma.$executeRawUnsafe(`
      INSERT INTO "LawVersion" (
        id, "lawId", "versionDate", "promulgationDate", 
        "xmlContent", status, "isLatest", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `, versionId, lawId, versionDate, promulgationDate, xmlContent, status, isLatest);
    
    // 条文を処理
    const lawBody = lawData.LawBody;
    if (lawBody) {
      await this.processLawBody(lawBody, versionId);
    }
    
    this.totalProcessed++;
  }
  
  private async processLawBody(lawBody: any, versionId: string): Promise<void> {
    let sortOrder = 0;
    
    // 本則を処理
    if (lawBody.MainProvision) {
      await this.processProvision(lawBody.MainProvision, versionId, '本則', sortOrder);
    }
    
    // 附則を処理
    if (lawBody.SupplProvision) {
      const supplProvisions = Array.isArray(lawBody.SupplProvision) 
        ? lawBody.SupplProvision 
        : [lawBody.SupplProvision];
      
      for (const supplProvision of supplProvisions) {
        sortOrder = await this.processProvision(supplProvision, versionId, '附則', sortOrder + 10000);
      }
    }
  }
  
  private async processProvision(provision: any, versionId: string, division: string, startOrder: number): Promise<number> {
    let sortOrder = startOrder;
    
    // 条を直接処理
    if (provision.Article) {
      const articles = Array.isArray(provision.Article) ? provision.Article : [provision.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, null, null, null, null, sortOrder++);
      }
    }
    
    // 章を処理
    if (provision.Chapter) {
      const chapters = Array.isArray(provision.Chapter) ? provision.Chapter : [provision.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(chapter, versionId, division, null, sortOrder);
      }
    }
    
    // 編を処理
    if (provision.Part) {
      const parts = Array.isArray(provision.Part) ? provision.Part : [provision.Part];
      for (const part of parts) {
        sortOrder = await this.processPart(part, versionId, division, sortOrder);
      }
    }
    
    return sortOrder;
  }
  
  private async processPart(part: any, versionId: string, division: string, startOrder: number): Promise<number> {
    let sortOrder = startOrder;
    const partTitle = part.PartTitle || '';
    
    if (part.Chapter) {
      const chapters = Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(chapter, versionId, division, partTitle, sortOrder);
      }
    }
    
    return sortOrder;
  }
  
  private async processChapter(chapter: any, versionId: string, division: string, part: string | null, startOrder: number): Promise<number> {
    let sortOrder = startOrder;
    const chapterTitle = chapter.ChapterTitle || '';
    
    // 節を処理
    if (chapter.Section) {
      const sections = Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section];
      for (const section of sections) {
        sortOrder = await this.processSection(section, versionId, division, part, chapterTitle, sortOrder);
      }
    }
    
    // 章直下の条を処理
    if (chapter.Article) {
      const articles = Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapterTitle, null, null, sortOrder++);
      }
    }
    
    return sortOrder;
  }
  
  private async processSection(section: any, versionId: string, division: string, part: string | null, chapter: string, startOrder: number): Promise<number> {
    let sortOrder = startOrder;
    const sectionTitle = section.SectionTitle || '';
    
    // 款を処理
    if (section.Subsection) {
      const subsections = Array.isArray(section.Subsection) ? section.Subsection : [section.Subsection];
      for (const subsection of subsections) {
        sortOrder = await this.processSubsection(subsection, versionId, division, part, chapter, sectionTitle, sortOrder);
      }
    }
    
    // 節直下の条を処理
    if (section.Article) {
      const articles = Array.isArray(section.Article) ? section.Article : [section.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapter, sectionTitle, null, sortOrder++);
      }
    }
    
    return sortOrder;
  }
  
  private async processSubsection(subsection: any, versionId: string, division: string, part: string | null, chapter: string, section: string, startOrder: number): Promise<number> {
    let sortOrder = startOrder;
    const subsectionTitle = subsection.SubsectionTitle || '';
    
    if (subsection.Article) {
      const articles = Array.isArray(subsection.Article) ? subsection.Article : [subsection.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapter, section, subsectionTitle, sortOrder++);
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
    sortOrder: number
  ): Promise<void> {
    const articleNumber = article['@_Num'] || '';
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
    
    // 条を保存
    const result = await prisma.$queryRawUnsafe<{id: string}[]>(`
      INSERT INTO "Article" (
        id, "versionId", "articleNumber", "articleTitle", 
        content, part, chapter, section, subsection, 
        division, "sortOrder", "isDeleted"
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, versionId, articleNumber, articleTitle, content, part, chapter, section, subsection, division, sortOrder, isDeleted);
    
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
  
  private async processParagraph(paragraph: any, articleId: string, paragraphNumber: number): Promise<void> {
    const content = this.extractText(paragraph);
    
    const result = await prisma.$queryRawUnsafe<{id: string}[]>(`
      INSERT INTO "Paragraph" (id, "articleId", "paragraphNumber", content)
      VALUES (gen_random_uuid(), $1, $2, $3)
      RETURNING id
    `, articleId, paragraphNumber, content);
    
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
  
  private async processItem(item: any, paragraphId: string): Promise<void> {
    const itemNumber = item['@_Num'] || '';
    const content = this.extractText(item);
    
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Item" (id, "paragraphId", "itemNumber", content)
      VALUES (gen_random_uuid(), $1, $2, $3)
    `, paragraphId, itemNumber, content);
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
      return null; // 簡略化のため
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
    
    const lawMasterCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "LawMaster"`;
    const versionCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "LawVersion"`;
    const latestCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "LawVersion" WHERE "isLatest" = true`;
    const multiVersionCount = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT "lawId") as count 
      FROM "LawVersion" 
      GROUP BY "lawId" 
      HAVING COUNT(*) > 1
    `;
    const articleCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Article"`;
    const paragraphCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Paragraph"`;
    
    console.log(`  法令マスター: ${(lawMasterCount as any)[0].count}件`);
    console.log(`  総バージョン数: ${(versionCount as any)[0].count}件`);
    console.log(`  最新バージョン: ${(latestCount as any)[0].count}件`);
    console.log(`  複数バージョン法令: ${Array.isArray(multiVersionCount) ? multiVersionCount.length : 0}件`);
    console.log(`  条文: ${(articleCount as any)[0].count}件`);
    console.log(`  項: ${(paragraphCount as any)[0].count}件`);
  }
}

// メイン処理
async function main() {
  console.log('⚠️ このスクリプトは全法令データをバージョニング対応でPostgreSQLに投入します。');
  console.log('既存のデータは削除されます。続行しますか？');
  console.log('続行する場合は3秒後に開始します... (Ctrl+Cでキャンセル)');
  console.log();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const importer = new VersionedLawImporter();
  await importer.importAll();
}

main().catch(console.error);