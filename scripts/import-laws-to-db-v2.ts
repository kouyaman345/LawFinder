import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

interface ParsedLaw {
  lawId: string;
  lawTitle: string;
  metadata: any;
  enactStatements: any;
  articles: ParsedArticle[];
  amendmentHistory: any;
}

interface ParsedArticle {
  articleNumber: string;
  articleTitle?: string;
  articleCaption?: string;
  paragraphs: ParsedParagraph[];
  part?: string;
  chapter?: string;
  section?: string;
  subsection?: string;
  division?: string;
}

interface ParsedParagraph {
  paragraphNum: number;
  paragraphSentence: string;
  items?: ParsedItem[];
}

interface ParsedItem {
  itemNumber: string;
  itemSentence: string;
}

class LawImporter {
  private lawsDataPath: string;
  private referenceDetector: ReferenceDetector;

  constructor(lawsDataPath: string = '../laws_data/sample') {
    this.lawsDataPath = path.join(__dirname, lawsDataPath);
    this.referenceDetector = new ReferenceDetector();
  }

  async importAll() {
    try {
      console.log('法令データのインポートを開始します...\n');

      // 既存データをクリア
      await this.clearDatabase();

      // XMLファイルを読み込み
      const files = await fs.readdir(this.lawsDataPath);
      const xmlFiles = files.filter(f => f.endsWith('.xml'));

      console.log(`${xmlFiles.length}件の法令を処理します\n`);

      // 各法令を処理
      for (const file of xmlFiles) {
        const lawId = file.replace('.xml', '');
        await this.importLaw(lawId);
      }

      // 参照関係を検出して保存
      await this.detectAndSaveReferences();

      console.log('\n✅ インポートが完了しました！');
    } catch (error) {
      console.error('エラーが発生しました:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async clearDatabase() {
    console.log('既存データをクリアしています...');
    await prisma.$executeRaw`DELETE FROM Reference`;
    await prisma.$executeRaw`DELETE FROM Item`;
    await prisma.$executeRaw`DELETE FROM Paragraph`;
    await prisma.$executeRaw`DELETE FROM Article`;
    await prisma.$executeRaw`DELETE FROM Law`;
  }

  private async importLaw(lawId: string) {
    const xmlPath = path.join(this.lawsDataPath, `${lawId}.xml`);
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    
    const parsedLaw = this.parseXMLWithHierarchy(xmlContent, lawId);
    if (!parsedLaw) return;

    console.log(`${parsedLaw.lawTitle} をインポート中...`);

    // 法令を保存
    const law = await prisma.law.create({
      data: {
        id: lawId,
        title: parsedLaw.lawTitle,
        metadata: parsedLaw.metadata,
        enactStatements: parsedLaw.enactStatements,
        amendmentHistory: parsedLaw.amendmentHistory,
      },
    });

    // 条文を保存（重複チェック付き）
    const savedArticles = new Set<string>();
    
    for (const article of parsedLaw.articles) {
      // 重複チェック
      if (savedArticles.has(article.articleNumber)) {
        console.warn(`重複する条番号: ${parsedLaw.lawTitle} 第${article.articleNumber}条`);
        continue;
      }
      savedArticles.add(article.articleNumber);

      const savedArticle = await prisma.article.create({
        data: {
          lawId: lawId,
          articleNumber: article.articleNumber,
          articleTitle: article.articleCaption || null,
          content: article.paragraphs[0]?.paragraphSentence || '',
          part: article.part || null,
          chapter: article.chapter || null,
          section: article.section || null,
          subsection: article.subsection || null,
          division: article.division || null,
        },
      });

      // 項を保存（重複チェック付き）
      const savedParagraphs = new Set<number>();
      
      for (const paragraph of article.paragraphs) {
        // 重複チェック
        if (savedParagraphs.has(paragraph.paragraphNum)) {
          console.warn(`重複する項番号: ${parsedLaw.lawTitle} 第${article.articleNumber}条 第${paragraph.paragraphNum}項`);
          continue;
        }
        savedParagraphs.add(paragraph.paragraphNum);

        const savedParagraph = await prisma.paragraph.create({
          data: {
            articleId: savedArticle.id,
            paragraphNumber: paragraph.paragraphNum,
            content: paragraph.paragraphSentence,
          },
        });

        // 号を保存
        if (paragraph.items) {
          for (const item of paragraph.items) {
            await prisma.item.create({
              data: {
                paragraphId: savedParagraph.id,
                itemNumber: item.itemNumber,
                content: item.itemSentence,
              },
            });
          }
        }
      }
    }

    console.log(`✓ ${parsedLaw.lawTitle} のインポートが完了`);
  }

  private parseXMLWithHierarchy(xmlContent: string, lawId: string): ParsedLaw | null {
    // 法令タイトルを取得
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    if (!titleMatch) return null;

    const lawTitle = titleMatch[1];

    // メタデータを取得
    const metadata = {
      lawNumber: this.extractContent(xmlContent, 'LawNum'),
    };

    // 制定文を取得
    const enactStatements = {
      text: this.extractContent(xmlContent, 'EnactStatement'),
    };

    // 改正履歴を取得
    const amendmentHistory = this.extractAmendmentHistory(xmlContent);

    // MainProvision（本則）部分を抽出
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    if (!mainProvisionMatch) return null;

    const mainProvision = mainProvisionMatch[1];
    const articles = this.parseArticlesWithHierarchy(mainProvision);

    return {
      lawId,
      lawTitle,
      metadata,
      enactStatements,
      articles,
      amendmentHistory,
    };
  }

  private parseArticlesWithHierarchy(mainProvision: string): ParsedArticle[] {
    const articles: ParsedArticle[] = [];
    let currentPart: string | undefined;
    let currentChapter: string | undefined;
    let currentSection: string | undefined;
    let currentSubsection: string | undefined;
    let currentDivision: string | undefined;

    // 階層情報をトラッキングしながら条文を解析
    const lines = mainProvision.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 編（Part）の検出
      const partMatch = line.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      if (partMatch) {
        currentPart = partMatch[1];
        currentChapter = undefined;
        currentSection = undefined;
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      // 章（Chapter）の検出
      const chapterMatch = line.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      if (chapterMatch) {
        currentChapter = chapterMatch[1];
        currentSection = undefined;
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      // 節（Section）の検出
      const sectionMatch = line.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      // 款（Subsection）の検出
      const subsectionMatch = line.match(/<SubsectionTitle>([^<]+)<\/SubsectionTitle>/);
      if (subsectionMatch) {
        currentSubsection = subsectionMatch[1];
        currentDivision = undefined;
      }

      // 目（Division）の検出
      const divisionMatch = line.match(/<DivisionTitle>([^<]+)<\/DivisionTitle>/);
      if (divisionMatch) {
        currentDivision = divisionMatch[1];
      }

      // 条（Article）の検出
      if (line.includes('<Article')) {
        const articleBlock = this.extractArticleBlock(lines, i);
        const article = this.parseArticleBlock(articleBlock);
        if (article) {
          // 階層情報を追加
          article.part = currentPart;
          article.chapter = currentChapter;
          article.section = currentSection;
          article.subsection = currentSubsection;
          article.division = currentDivision;
          articles.push(article);
        }
        // 条文ブロックの終わりまでスキップ
        while (i < lines.length && !lines[i].includes('</Article>')) {
          i++;
        }
      }

      i++;
    }

    return articles;
  }

  private extractArticleBlock(lines: string[], startIndex: number): string {
    let block = '';
    let i = startIndex;
    let depth = 0;

    while (i < lines.length) {
      const line = lines[i];
      block += line + '\n';

      if (line.includes('<Article')) depth++;
      if (line.includes('</Article>')) {
        depth--;
        if (depth === 0) break;
      }

      i++;
    }

    return block;
  }

  private parseArticleBlock(articleBlock: string): ParsedArticle | null {
    // 条番号を取得
    const numMatch = articleBlock.match(/<Article[^>]*Num="([^"]+)"/);
    if (!numMatch) return null;

    // 漢数字変換
    const articleNumber = this.convertToKanji(numMatch[1]);

    // 条見出しを取得
    const captionMatch = articleBlock.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
    const articleCaption = captionMatch ? captionMatch[1] : undefined;

    // 項を解析
    const paragraphs = this.parseParagraphs(articleBlock);

    return {
      articleNumber,
      articleCaption,
      paragraphs,
    };
  }

  private parseParagraphs(articleBlock: string): ParsedParagraph[] {
    const paragraphs: ParsedParagraph[] = [];
    const paragraphRegex = /<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g;
    let match;

    while ((match = paragraphRegex.exec(articleBlock)) !== null) {
      const paragraphBlock = match[1];
      
      // 項番号を取得
      const numMatch = match[0].match(/Num="([^"]+)"/);
      const paragraphNum = numMatch ? parseInt(numMatch[1]) : 1;

      // 項の文を取得
      const sentenceMatch = paragraphBlock.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);
      const paragraphSentence = sentenceMatch ? sentenceMatch[1] : '';

      // 号を解析
      const items = this.parseItems(paragraphBlock);

      paragraphs.push({
        paragraphNum,
        paragraphSentence,
        items: items.length > 0 ? items : undefined,
      });
    }

    return paragraphs;
  }

  private parseItems(paragraphBlock: string): ParsedItem[] {
    const items: ParsedItem[] = [];
    const itemRegex = /<Item[^>]*>([\s\S]*?)<\/Item>/g;
    let match;

    while ((match = itemRegex.exec(paragraphBlock)) !== null) {
      const itemBlock = match[1];
      
      // 号番号を取得
      const numMatch = match[0].match(/Num="([^"]+)"/);
      if (!numMatch) continue;

      const itemNumber = this.convertToKanji(numMatch[1]);

      // 号の文を取得
      const sentenceMatch = itemBlock.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);
      const itemSentence = sentenceMatch ? sentenceMatch[1] : '';

      items.push({
        itemNumber,
        itemSentence,
      });
    }

    return items;
  }

  private convertToKanji(num: string): string {
    const kanjiMap: { [key: string]: string } = {
      '1': '一', '2': '二', '3': '三', '4': '四', '5': '五',
      '6': '六', '7': '七', '8': '八', '9': '九', '10': '十',
      '11': '十一', '12': '十二', '13': '十三', '14': '十四', '15': '十五',
      '16': '十六', '17': '十七', '18': '十八', '19': '十九', '20': '二十',
      '21': '二十一', '22': '二十二', '23': '二十三', '24': '二十四', '25': '二十五',
      '26': '二十六', '27': '二十七', '28': '二十八', '29': '二十九', '30': '三十',
      '31': '三十一', '32': '三十二', '33': '三十三', '34': '三十四', '35': '三十五',
      '36': '三十六', '37': '三十七', '38': '三十八', '39': '三十九', '40': '四十',
    };

    // 特殊な番号形式（例：3_2 → 三の二）
    if (num.includes('_')) {
      const parts = num.split('_');
      const main = kanjiMap[parts[0]] || parts[0];
      const sub = kanjiMap[parts[1]] || parts[1];
      return `${main}の${sub}`;
    }

    // 100以上の数値は元のままアラビア数字で返す
    const numInt = parseInt(num);
    if (numInt > 100) {
      return num;
    }

    // 41-50
    if (numInt >= 41 && numInt <= 50) {
      return '四十' + (numInt === 40 ? '' : kanjiMap[(numInt - 40).toString()]);
    }

    // 51-60
    if (numInt >= 51 && numInt <= 60) {
      return '五十' + (numInt === 50 ? '' : kanjiMap[(numInt - 50).toString()]);
    }

    // 61-70
    if (numInt >= 61 && numInt <= 70) {
      return '六十' + (numInt === 60 ? '' : kanjiMap[(numInt - 60).toString()]);
    }

    // 71-80
    if (numInt >= 71 && numInt <= 80) {
      return '七十' + (numInt === 70 ? '' : kanjiMap[(numInt - 70).toString()]);
    }

    // 81-90
    if (numInt >= 81 && numInt <= 90) {
      return '八十' + (numInt === 80 ? '' : kanjiMap[(numInt - 80).toString()]);
    }

    // 91-100
    if (numInt >= 91 && numInt <= 100) {
      return '九十' + (numInt === 90 ? '' : kanjiMap[(numInt - 90).toString()]);
    }

    return kanjiMap[num] || num;
  }

  private extractContent(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : '';
  }

  private extractAmendmentHistory(xml: string): any {
    const history: any[] = [];
    const amendmentRegex = /<AmendmentProvision[^>]*>([\s\S]*?)<\/AmendmentProvision>/g;
    let match;

    while ((match = amendmentRegex.exec(xml)) !== null) {
      const amendmentBlock = match[1];
      const lawNumMatch = amendmentBlock.match(/<LawNum>([^<]+)<\/LawNum>/);
      const sentenceMatch = amendmentBlock.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);

      if (lawNumMatch && sentenceMatch) {
        history.push({
          lawNumber: lawNumMatch[1],
          description: sentenceMatch[1],
        });
      }
    }

    return history.length > 0 ? history : null;
  }

  private async detectAndSaveReferences() {
    console.log('\n参照関係を検出しています...');

    const articles = await prisma.article.findMany({
      include: {
        paragraphs: {
          include: {
            items: true,
          },
        },
      },
    });

    let referenceCount = 0;

    for (const article of articles) {
      const fullText = this.getArticleFullText(article);
      const references = this.referenceDetector.detectReferences(fullText, article.lawId);

      for (const ref of references) {
        // 参照先の条文を探す
        let toArticleId: string | undefined;
        
        if (ref.lawId === article.lawId) {
          // 同じ法令内の参照
          const toArticle = await prisma.article.findFirst({
            where: {
              lawId: ref.lawId,
              articleNumber: ref.articleNumber,
            },
          });
          toArticleId = toArticle?.id;
        }

        await prisma.reference.create({
          data: {
            fromArticleId: article.id,
            toArticleId,
            toLawId: ref.lawId,
            referenceText: ref.text,
            referenceType: ref.type,
            confidence: ref.confidence,
          },
        });

        referenceCount++;
      }
    }

    console.log(`✓ ${referenceCount}件の参照関係を検出しました`);
  }

  private getArticleFullText(article: any): string {
    let text = article.content + '\n';
    
    for (const paragraph of article.paragraphs) {
      text += paragraph.content + '\n';
      
      if (paragraph.items) {
        for (const item of paragraph.items) {
          text += item.content + '\n';
        }
      }
    }

    return text;
  }
}

// 参照検出クラス
class ReferenceDetector {
  detectReferences(text: string, currentLawId: string): any[] {
    const references: any[] = [];
    
    // 内部参照パターン（例：第二条、前条、次条など）
    const internalPatterns = [
      /第([一二三四五六七八九十百千万]+)条/g,
      /前条/g,
      /次条/g,
      /同条/g,
    ];

    for (const pattern of internalPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        references.push({
          text: match[0],
          type: 'internal',
          lawId: currentLawId,
          articleNumber: match[1] || '',
          confidence: 0.9,
        });
      }
    }

    return references;
  }
}

// メイン処理
const importer = new LawImporter();
importer.importAll().catch(console.error);