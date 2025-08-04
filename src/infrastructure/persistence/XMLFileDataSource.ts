import * as fs from 'fs/promises';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { LawDataSource, FetchOptions, LawListResult, LawListItem, LawData } from '@domain/repositories';

export class XMLFileDataSource implements LawDataSource {
  readonly type = 'xml' as const;
  private parser: xml2js.Parser;
  
  constructor(
    private readonly xmlDirectory: string
  ) {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      normalizeTags: true,
      trim: true
    });
  }
  
  async fetchLawList(options?: FetchOptions): Promise<LawListResult> {
    const files = await fs.readdir(this.xmlDirectory);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));
    
    const laws: LawListItem[] = [];
    for (const file of xmlFiles) {
      const filePath = path.join(this.xmlDirectory, file);
      const stat = await fs.stat(filePath);
      laws.push({
        lawId: this.extractLawId(file),
        lawTitle: await this.extractLawTitle(filePath),
        lastModified: stat.mtime.toISOString(),
        source: 'xml'
      });
    }
    
    // ページング処理
    const offset = options?.offset || 0;
    const limit = options?.limit || 1000;
    const paged = laws.slice(offset, offset + limit);
    
    return {
      laws: paged,
      hasMore: offset + limit < laws.length,
      nextOffset: offset + limit < laws.length ? offset + limit : undefined
    };
  }
  
  async fetchLawDetail(lawId: string): Promise<LawData> {
    const xmlPath = path.join(this.xmlDirectory, `${lawId}.xml`);
    const xmlData = await fs.readFile(xmlPath, 'utf-8');
    return this.parseLaw(xmlData);
  }
  
  async fetchUpdatedLaws(_since: Date): Promise<LawListResult> {
    // XMLファイルの場合は更新日時での差分取得は不可
    throw new Error('XML source does not support incremental updates');
  }
  
  private extractLawId(filename: string): string {
    // ファイル名から.xmlを除去してlawIdとする
    return path.basename(filename, '.xml');
  }
  
  private async extractLawTitle(xmlPath: string): Promise<string> {
    // 簡易的にファイルの最初の部分から法令名を抽出
    const xmlData = await fs.readFile(xmlPath, 'utf-8');
    const match = xmlData.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    return match ? match[1] : path.basename(xmlPath, '.xml');
  }

  private async parseLaw(xmlData: string): Promise<LawData> {
    const result = await this.parser.parseStringPromise(xmlData);
    const law = result.law;
    
    // 公布日の構築
    const year = parseInt(law.Year || '0');
    const month = parseInt(law.PromulgateMonth || '1');
    const day = parseInt(law.PromulgateDay || '1');
    const era = law.Era;
    
    // 和暦から西暦への変換（簡易版）
    let westernYear = year;
    if (era === 'Meiji') {
      westernYear = year + 1867;
    } else if (era === 'Taisho') {
      westernYear = year + 1911;
    } else if (era === 'Showa') {
      westernYear = year + 1925;
    } else if (era === 'Heisei') {
      westernYear = year + 1988;
    } else if (era === 'Reiwa') {
      westernYear = year + 2018;
    }
    
    // ファイル名から法令IDを推定（実際のパイプラインではfilePathを渡す必要がある）
    const lawId = this.generateLawId(law.Type, westernYear, parseInt(law.Num || '0'));
    
    return {
      lawId: lawId,
      lawType: this.mapLawType(law.Type),
      lawTitle: law.lawtitle?._ || law.lawtitle || '',
      lawTitleKana: law.lawtitle?.Kana || law.lawtitle?.kana || null,
      promulgateDate: new Date(westernYear, month - 1, day),
      enforceDate: null,
      articles: this.extractArticles(law.lawbody),
      source: 'xml',
      lastModified: new Date()
    };
  }
  
  private generateLawId(type: string, year: number, num: number): string {
    // 簡易的な法令ID生成（実際の形式に合わせて調整が必要）
    const typeCode = type === 'Act' ? 'AC' : 'XX';
    const yearStr = year.toString().slice(-3).padStart(3, '0');
    const numStr = num.toString().padStart(10, '0');
    return `${yearStr}${typeCode}${numStr}`;
  }

  private mapLawType(xmlType: string): string {
    const typeMap: Record<string, string> = {
      'Act': 'Act',
      'CabinetOrder': 'CabinetOrder',
      'MinisterialOrdinance': 'MinisterialOrdinance',
      'Rule': 'Rule',
      'Regulation': 'Regulation'
    };
    return typeMap[xmlType] || 'Act';
  }

  private extractArticles(lawBody: any): any[] {
    if (!lawBody) return [];
    
    const articles: any[] = [];
    const mainProvision = lawBody.mainprovision || lawBody;
    
    if (mainProvision.article) {
      const articleList = Array.isArray(mainProvision.article) 
        ? mainProvision.article 
        : [mainProvision.article];
      
      for (const article of articleList) {
        articles.push({
          articleNum: parseInt(article.Num || article.num || '0'),
          articleTitle: article.articlecaption || article.articletitle || null,
          paragraphs: this.extractParagraphs(article)
        });
      }
    }
    
    return articles;
  }

  private extractParagraphs(article: any): any[] {
    const paragraphs: any[] = [];
    
    if (article.paragraph) {
      const paragraphList = Array.isArray(article.paragraph)
        ? article.paragraph
        : [article.paragraph];
      
      for (let i = 0; i < paragraphList.length; i++) {
        const para = paragraphList[i];
        const sentenceNode = para.paragraphsentence || para.sentence;
        const content = sentenceNode?.sentence || sentenceNode?._ || sentenceNode || '';
        
        paragraphs.push({
          paragraphNum: parseInt(para.Num || para.num || (i + 1).toString()),
          content: content,
          items: this.extractItems(para)
        });
      }
    }
    
    return paragraphs;
  }

  private extractItems(paragraph: any): string[] {
    const items: string[] = [];
    
    if (paragraph.item) {
      const itemList = Array.isArray(paragraph.item)
        ? paragraph.item
        : [paragraph.item];
      
      for (const item of itemList) {
        items.push(item.itemsentence || item._ || '');
      }
    }
    
    return items;
  }
}