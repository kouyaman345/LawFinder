#!/usr/bin/env tsx

/**
 * 主要法令の再インポート（条文内容を正しく抽出）
 */

import { PrismaClient } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

class MajorLawsImporter {
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
  
  async importMajorLaws() {
    const majorLaws = [
      { id: '129AC0000000089', name: '民法' },
      { id: '140AC0000000045', name: '刑法' },
      { id: '417AC0000000086', name: '会社法' },
      { id: '322AC0000000049', name: '労働基準法' },
      { id: '408AC0000000109', name: '民事訴訟法' },
      { id: '323AC0000000131', name: '刑事訴訟法' },
      { id: '345AC0000000048', name: '著作権法' },
      { id: '334AC0000000121', name: '特許法' },
      { id: '340AC0000000033', name: '所得税法' },
    ];
    
    console.log('='.repeat(80));
    console.log('📚 主要法令の再インポート');
    console.log('='.repeat(80));
    
    for (const law of majorLaws) {
      await this.importLaw(law.id, law.name);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ 全ての主要法令の再インポートが完了しました');
    console.log('='.repeat(80));
  }
  
  async importLaw(lawId: string, lawName: string) {
    console.log(`\n📝 ${lawName}（${lawId}）を処理中...`);
    
    // 既存データをクリア
    await prisma.article.deleteMany({
      where: { versionId: { startsWith: lawId } }
    });
    
    // XMLファイルを探す
    const baseDir = '/home/coffee/projects/LawFinder/laws_data';
    const dirs = readdirSync(baseDir);
    const lawDir = dirs.find(d => d.startsWith(lawId));
    
    if (!lawDir) {
      console.log(`  ⚠️ ディレクトリが見つかりません`);
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
      console.log(`  ⚠️ バージョンが見つかりません`);
      return;
    }
    
    const versionId = version.id;
    let sortOrder = 0;
    let articleCount = 0;
    
    // MainProvisionを処理
    if (lawBody.MainProvision) {
      const result = await this.processProvision(
        lawBody.MainProvision,
        versionId,
        '本則',
        sortOrder
      );
      sortOrder = result.sortOrder;
      articleCount = result.count;
    }
    
    console.log(`  ✅ ${articleCount}条文をインポート`);
    
    // サンプル確認
    const sample = await prisma.article.findFirst({
      where: { versionId },
      orderBy: { sortOrder: 'asc' }
    });
    
    if (sample && sample.content.length > 50) {
      console.log(`  📋 第1条: ${sample.content.substring(0, 80)}...`);
    }
  }
  
  private async processProvision(
    provision: any,
    versionId: string,
    division: string,
    startOrder: number
  ): Promise<{ sortOrder: number; count: number }> {
    let sortOrder = startOrder;
    let count = 0;
    
    // Part -> Chapter -> Section -> Article の順で処理
    if (provision.Part) {
      const parts = Array.isArray(provision.Part) ? provision.Part : [provision.Part];
      for (const part of parts) {
        const result = await this.processPart(part, versionId, division, sortOrder);
        sortOrder = result.sortOrder;
        count += result.count;
      }
    } else if (provision.Chapter) {
      const chapters = Array.isArray(provision.Chapter) ? provision.Chapter : [provision.Chapter];
      for (const chapter of chapters) {
        const result = await this.processChapter(chapter, versionId, division, null, sortOrder);
        sortOrder = result.sortOrder;
        count += result.count;
      }
    } else if (provision.Article) {
      const articles = Array.isArray(provision.Article) ? provision.Article : [provision.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, null, null, null, sortOrder);
        sortOrder++;
        count++;
      }
    }
    
    return { sortOrder, count };
  }
  
  private async processPart(
    part: any,
    versionId: string,
    division: string,
    startOrder: number
  ): Promise<{ sortOrder: number; count: number }> {
    let sortOrder = startOrder;
    let count = 0;
    const partTitle = this.extractText(part.PartTitle);
    
    if (part.Chapter) {
      const chapters = Array.isArray(part.Chapter) ? part.Chapter : [part.Chapter];
      for (const chapter of chapters) {
        const result = await this.processChapter(chapter, versionId, division, partTitle, sortOrder);
        sortOrder = result.sortOrder;
        count += result.count;
      }
    }
    
    return { sortOrder, count };
  }
  
  private async processChapter(
    chapter: any,
    versionId: string,
    division: string,
    part: string | null,
    startOrder: number
  ): Promise<{ sortOrder: number; count: number }> {
    let sortOrder = startOrder;
    let count = 0;
    const chapterTitle = this.extractText(chapter.ChapterTitle);
    
    if (chapter.Section) {
      const sections = Array.isArray(chapter.Section) ? chapter.Section : [chapter.Section];
      for (const section of sections) {
        const result = await this.processSection(section, versionId, division, part, chapterTitle, sortOrder);
        sortOrder = result.sortOrder;
        count += result.count;
      }
    }
    
    if (chapter.Article) {
      const articles = Array.isArray(chapter.Article) ? chapter.Article : [chapter.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapterTitle, null, sortOrder);
        sortOrder++;
        count++;
      }
    }
    
    return { sortOrder, count };
  }
  
  private async processSection(
    section: any,
    versionId: string,
    division: string,
    part: string | null,
    chapter: string,
    startOrder: number
  ): Promise<{ sortOrder: number; count: number }> {
    let sortOrder = startOrder;
    let count = 0;
    const sectionTitle = this.extractText(section.SectionTitle);
    
    if (section.Article) {
      const articles = Array.isArray(section.Article) ? section.Article : [section.Article];
      for (const article of articles) {
        await this.processArticle(article, versionId, division, part, chapter, sectionTitle, sortOrder);
        sortOrder++;
        count++;
      }
    }
    
    return { sortOrder, count };
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
    
    // 条文内容を構築（最重要：ParagraphSentenceを正しく抽出）
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
    try {
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
    } catch (error) {
      // 既存のレコードがある場合はスキップ
    }
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
      const itemTexts = items.map((item: any, i: number) => {
        let itemText = '';
        
        // ItemTitleがある場合
        if (item.ItemTitle) {
          itemText = this.extractText(item.ItemTitle) + ' ';
        }
        
        // ItemSentenceから文章を抽出
        if (item.ItemSentence?.Sentence) {
          const sentences = Array.isArray(item.ItemSentence.Sentence) ? 
            item.ItemSentence.Sentence : [item.ItemSentence.Sentence];
          
          const sentenceText = sentences.map((s: any) => {
            if (typeof s === 'string') return s;
            return s['#text'] || '';
          }).join('');
          
          itemText += sentenceText;
        }
        
        return `  ${i + 1}. ${itemText}`;
      });
      
      if (itemTexts.length > 0) {
        text += '\n' + itemTexts.join('\n');
      }
    }
    
    return text.trim();
  }
  
  private extractText(node: any): string {
    if (typeof node === 'string') return node;
    if (!node) return '';
    return node['#text'] || '';
  }
}

// メイン処理
async function main() {
  const importer = new MajorLawsImporter();
  await importer.importMajorLaws();
  await prisma.$disconnect();
}

main().catch(console.error);