#!/usr/bin/env tsx

/**
 * 単一法令の再インポート（条文内容を正しく抽出）
 */

import { PrismaClient } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

class SingleLawImporter {
  private xmlParser: XMLParser;
  
  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
      processEntities: true
    });
  }
  
  async importLaw(lawId: string) {
    console.log('='.repeat(80));
    console.log(`📚 ${lawId} の再インポート開始`);
    console.log('='.repeat(80));
    
    // 既存データをクリア
    console.log('\n🗑️ 既存データをクリア...');
    await prisma.article.deleteMany({
      where: { versionId: { startsWith: lawId } }
    });
    
    // XMLファイルを探す
    const baseDir = '/home/coffee/projects/LawFinder/laws_data';
    const dirs = readdirSync(baseDir);
    const lawDir = dirs.find(d => d.startsWith(lawId));
    
    if (!lawDir) {
      console.error(`❌ ${lawId} のディレクトリが見つかりません`);
      return;
    }
    
    const xmlPath = path.join(baseDir, lawDir, `${lawDir}.xml`);
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const parsed = this.xmlParser.parse(xmlContent);
    
    const lawData = parsed.Law || parsed.RepealedLaw;
    const lawBody = lawData.LawBody;
    
    // 既存のバージョンIDを使用
    const version = await prisma.lawVersion.findFirst({
      where: { lawId },
      orderBy: { versionDate: 'desc' }
    });
    
    if (!version) {
      console.error(`❌ ${lawId} のバージョンが見つかりません`);
      return;
    }
    
    const versionId = version.id;
    const lawTitle = lawBody.LawTitle || '不明';
    
    console.log(`📝 処理中: ${lawTitle}`);
    
    let totalArticles = 0;
    let sortOrder = 0;
    
    // MainProvisionを処理
    if (lawBody.MainProvision) {
      sortOrder = await this.processProvision(
        lawBody.MainProvision,
        versionId,
        '本則',
        sortOrder
      );
      
      totalArticles = await prisma.article.count({
        where: { versionId }
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`✅ インポート完了`);
    console.log(`  条文数: ${totalArticles}`);
    
    // サンプル確認
    const samples = await prisma.article.findMany({
      where: { versionId },
      take: 3,
      orderBy: { sortOrder: 'asc' }
    });
    
    console.log('\n📋 サンプル条文:');
    for (const article of samples) {
      console.log(`\n【${article.articleNumber}】${article.articleTitle || ''}`);
      console.log('内容:', article.content.substring(0, 100) + '...');
      
      // 参照が含まれているか確認
      if (article.content.includes('民法')) {
        console.log('  → 民法への参照あり');
      }
      if (article.content.includes('会社法')) {
        console.log('  → 会社法への参照あり');
      }
    }
    
    console.log('='.repeat(80));
  }
  
  private async processProvision(
    provision: any,
    versionId: string,
    division: string,
    startOrder: number
  ): Promise<number> {
    let sortOrder = startOrder;
    
    // Part -> Chapter -> Section -> Article の順で処理
    if (provision.Part) {
      const parts = Array.isArray(provision.Part) ? provision.Part : [provision.Part];
      for (const part of parts) {
        sortOrder = await this.processPart(part, versionId, division, sortOrder);
      }
    } else if (provision.Chapter) {
      const chapters = Array.isArray(provision.Chapter) ? provision.Chapter : [provision.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(chapter, versionId, division, null, sortOrder);
      }
    } else if (provision.Article) {
      const articles = Array.isArray(provision.Article) ? provision.Article : [provision.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, null, null, null, sortOrder);
        sortOrder++;
      }
    }
    
    return sortOrder;
  }
  
  private async processPart(
    part: any,
    versionId: string,
    division: string,
    startOrder: number
  ): Promise<number> {
    let sortOrder = startOrder;
    const partTitle = typeof part.PartTitle === 'string' ? 
      part.PartTitle : 
      (part.PartTitle?.['#text'] || '');
    
    if (part.Chapter) {
      const chapters = Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter];
      for (const chapter of chapters) {
        sortOrder = await this.processChapter(chapter, versionId, division, partTitle, sortOrder);
      }
    }
    
    return sortOrder;
  }
  
  private async processChapter(
    chapter: any,
    versionId: string,
    division: string,
    part: string | null,
    startOrder: number
  ): Promise<number> {
    let sortOrder = startOrder;
    const chapterTitle = typeof chapter.ChapterTitle === 'string' ? 
      chapter.ChapterTitle : 
      (chapter.ChapterTitle?.['#text'] || '');
    
    if (chapter.Section) {
      const sections = Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section];
      for (const section of sections) {
        sortOrder = await this.processSection(section, versionId, division, part, chapterTitle, sortOrder);
      }
    }
    
    if (chapter.Article) {
      const articles = Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapterTitle, null, sortOrder);
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
    startOrder: number
  ): Promise<number> {
    let sortOrder = startOrder;
    // SectionTitleがオブジェクトの場合はテキストを抽出
    const sectionTitle = typeof section.SectionTitle === 'string' ? 
      section.SectionTitle : 
      (section.SectionTitle?.['#text'] || '');
    
    if (section.Article) {
      const articles = Array.isArray(section.Article) ? section.Article : [section.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapter, sectionTitle, sortOrder);
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
    sortOrder: number
  ): Promise<void> {
    const articleNumber = String(article['@_Num'] || '');
    const articleTitle = article.ArticleTitle || null;
    const articleCaption = article.ArticleCaption || '';
    
    // 条文内容を構築（修正版）
    let content = articleCaption ? articleCaption + '\n' : '';
    
    if (article.Paragraph) {
      const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
      const paragraphTexts = paragraphs.map((p: any, i: number) => {
        const text = this.extractParagraphText(p);
        if (p.ParagraphNum) {
          return `${p.ParagraphNum} ${text}`;
        } else if (i === 0) {
          return text; // 第1項は番号なし
        } else {
          return `${i + 1} ${text}`;
        }
      });
      content += paragraphTexts.join('\n');
    }
    
    // 条を保存
    await prisma.article.create({
      data: {
        versionId,
        articleNumber,
        articleTitle,
        content,
        part,
        chapter,
        section,
        division,
        sortOrder,
        isDeleted: false
      }
    });
  }
  
  private extractParagraphText(paragraph: any): string {
    let text = '';
    
    // ParagraphSentenceから文章を抽出（最重要）
    if (paragraph.ParagraphSentence?.Sentence) {
      const sentences = Array.isArray(paragraph.ParagraphSentence.Sentence) ? 
        paragraph.ParagraphSentence.Sentence : [paragraph.ParagraphSentence.Sentence];
      
      text = sentences.map((s: any) => {
        if (typeof s === 'string') return s;
        return s['#text'] || '';
      }).join('');
    }
    
    // Itemがある場合は号として追加
    if (paragraph.Item) {
      const items = Array.isArray(paragraph.Item) ? paragraph.Item : [paragraph.Item];
      const itemTexts = items.map((item: any) => {
        let itemText = item.ItemTitle || '';
        if (item.ItemSentence?.Sentence) {
          const sentences = Array.isArray(item.ItemSentence.Sentence) ? 
            item.ItemSentence.Sentence : [item.ItemSentence.Sentence];
          
          const sentenceText = sentences.map((s: any) => {
            if (typeof s === 'string') return s;
            return s['#text'] || '';
          }).join('');
          
          itemText += ' ' + sentenceText;
        }
        return itemText;
      });
      
      if (itemTexts.length > 0) {
        text += '\n' + itemTexts.map((t, i) => `  ${i + 1}. ${t}`).join('\n');
      }
    }
    
    return text.trim();
  }
}

// メイン処理
async function main() {
  const lawId = process.argv[2] || '132AC0000000048'; // デフォルトは商法
  
  const importer = new SingleLawImporter();
  await importer.importLaw(lawId);
  
  await prisma.$disconnect();
}

main().catch(console.error);