import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReferenceDetector, ReferenceType } from '../src/utils/reference-detector';

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

class ImprovedLawImporter {
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

      // Phase 1: 法令と条文をインポート
      console.log('Phase 1: 法令データのインポート');
      for (const file of xmlFiles) {
        const lawId = file.replace('.xml', '');
        await this.importLaw(lawId);
      }

      // Phase 2: 参照関係を検出して保存
      console.log('\nPhase 2: 参照関係の検出と保存');
      await this.detectAndSaveReferences();

      console.log('\n✅ インポートが完了しました！');
      
      // 統計情報を表示
      await this.showStatistics();
    } catch (error) {
      console.error('エラーが発生しました:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async clearDatabase() {
    console.log('既存データをクリアしています...');
    // 正しい順序で削除（外部キー制約を考慮）
    await prisma.item.deleteMany({});
    await prisma.paragraph.deleteMany({});
    await prisma.article.deleteMany({});
    await prisma.law.deleteMany({});
    console.log('データベースをクリアしました');
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
        xmlContent: xmlContent,  // XMLコンテンツを追加
        lawNumber: parsedLaw.metadata?.lawNumber || null,
      },
    });

    // 条文を保存（重複チェック付き）
    const savedArticles = new Set<string>();
    
    for (const article of parsedLaw.articles) {
      // 重複チェック
      if (savedArticles.has(article.articleNumber)) {
        console.warn(`  警告: 重複する条番号をスキップ: 第${article.articleNumber}条`);
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
          console.warn(`  警告: 重複する項番号をスキップ: 第${article.articleNumber}条第${paragraph.paragraphNum}項`);
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

        // 号を保存（重複チェック付き）
        const savedItems = new Set<string>();
        
        if (paragraph.items) {
          for (const item of paragraph.items) {
            // 重複チェック
            if (savedItems.has(item.itemNumber)) {
              console.warn(`  警告: 重複する号番号をスキップ: 第${article.articleNumber}条第${paragraph.paragraphNum}項第${item.itemNumber}号`);
              continue;
            }
            savedItems.add(item.itemNumber);

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

  private async detectAndSaveReferences() {
    console.log('\n参照関係を検出しています...');

    const articles = await prisma.article.findMany({
      include: {
        paragraphs: {
          include: {
            items: true,
          },
        },
        law: true,
      },
    });

    let totalReferences = 0;
    const referenceStats = new Map<string, number>();

    for (const article of articles) {
      const detectedReferences = [];
      
      // 条文本体から参照を検出
      if (article.content) {
        const refs = this.referenceDetector.detectReferences(
          article.content,
          article.articleNumber
        );
        detectedReferences.push(...refs);
      }

      // 各項から参照を検出
      for (const paragraph of article.paragraphs) {
        const refs = this.referenceDetector.detectReferences(
          paragraph.content,
          article.articleNumber,
          { paragraphNumber: paragraph.paragraphNumber }
        );
        detectedReferences.push(...refs);

        // 各号から参照を検出
        for (const item of paragraph.items) {
          const itemRefs = this.referenceDetector.detectReferences(
            item.content,
            article.articleNumber,
            { 
              paragraphNumber: paragraph.paragraphNumber,
              itemNumber: item.itemNumber
            }
          );
          detectedReferences.push(...itemRefs);
        }
      }

      // 参照をデータベースに保存
      for (const ref of detectedReferences) {
        // 参照先の条文を解決
        let toArticleId: string | undefined;
        
        if (ref.type === ReferenceType.INTERNAL && ref.targetArticleNumber) {
          const toArticle = await prisma.article.findFirst({
            where: {
              lawId: article.lawId,
              articleNumber: ref.targetArticleNumber,
            },
          });
          toArticleId = toArticle?.id;
        } else if (ref.type === ReferenceType.EXTERNAL && ref.targetLawId && ref.targetArticleNumber) {
          const toArticle = await prisma.article.findFirst({
            where: {
              lawId: ref.targetLawId,
              articleNumber: ref.targetArticleNumber,
            },
          });
          toArticleId = toArticle?.id;
        } else if (ref.type === ReferenceType.RELATIVE) {
          // 相対参照の解決
          toArticleId = await this.resolveRelativeReference(article, ref);
        }

        // 参照を保存
        await prisma.reference.create({
          data: {
            fromArticleId: article.id,
            toArticleId,
            toLawId: ref.targetLawId,
            referenceText: ref.sourceText,
            referenceType: ref.type,
            referenceSubType: ref.subType || null,
            targetArticleNumber: ref.targetArticleNumber,
            targetArticleNumberEnd: ref.targetArticleNumberEnd,
            targetParagraphNumber: ref.targetParagraphNumber,
            targetItemNumber: ref.targetItemNumber,
            targetLawName: ref.targetLawName,
            relativeDirection: ref.relativeDirection,
            relativeCount: ref.relativeCount,
            structureType: ref.structureType,
            sourceParagraphNumber: ref.context?.paragraphNumber,
            sourceItemNumber: ref.context?.itemNumber,
            confidence: ref.confidence,
          },
        });

        // 統計情報を更新
        const key = `${ref.type}:${ref.subType || 'default'}`;
        referenceStats.set(key, (referenceStats.get(key) || 0) + 1);
        totalReferences++;
      }
    }

    console.log(`\n✓ ${totalReferences}件の参照関係を検出しました`);
    console.log('\n参照タイプ別統計:');
    for (const [type, count] of referenceStats.entries()) {
      console.log(`  ${type}: ${count}件`);
    }
  }

  private async resolveRelativeReference(article: any, ref: any): Promise<string | undefined> {
    const direction = ref.relativeDirection;
    const articleNum = parseInt(this.convertToArabic(article.articleNumber));

    if (!direction || isNaN(articleNum)) return undefined;

    let targetNum: number;
    if (direction === 'previous') {
      targetNum = articleNum - (ref.relativeCount || 1);
    } else if (direction === 'next') {
      targetNum = articleNum + (ref.relativeCount || 1);
    } else {
      return undefined;
    }

    const targetArticle = await prisma.article.findFirst({
      where: {
        lawId: article.lawId,
        articleNumber: this.convertToKanji(String(targetNum)),
      },
    });

    return targetArticle?.id;
  }

  private async showStatistics() {
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    const paragraphCount = await prisma.paragraph.count();
    const itemCount = await prisma.item.count();
    const referenceCount = await prisma.reference.count();

    console.log('\n=== インポート統計 ===');
    console.log(`法令数: ${lawCount}`);
    console.log(`条文数: ${articleCount}`);
    console.log(`項数: ${paragraphCount}`);
    console.log(`号数: ${itemCount}`);
    console.log(`参照関係数: ${referenceCount}`);

    // 参照タイプ別統計
    const referenceTypes = await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true,
    });

    console.log('\n参照タイプ別:');
    for (const type of referenceTypes) {
      console.log(`  ${type.referenceType}: ${type._count}件`);
    }
  }

  // XMLパース関連のメソッド（前のバージョンと同じ）
  private parseXMLWithHierarchy(xmlContent: string, lawId: string): ParsedLaw | null {
    // 実装は import-laws-to-db-v2.ts と同じ
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    if (!titleMatch) return null;

    const lawTitle = titleMatch[1];
    const metadata = {
      lawNumber: this.extractContent(xmlContent, 'LawNum'),
    };
    const enactStatements = {
      text: this.extractContent(xmlContent, 'EnactStatement'),
    };
    const amendmentHistory = this.extractAmendmentHistory(xmlContent);

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

  // 以下、XMLパース関連のヘルパーメソッド
  private parseArticlesWithHierarchy(mainProvision: string): ParsedArticle[] {
    // import-laws-to-db-v2.ts の実装をそのまま使用
    const articles: ParsedArticle[] = [];
    let currentPart: string | undefined;
    let currentChapter: string | undefined;
    let currentSection: string | undefined;
    let currentSubsection: string | undefined;
    let currentDivision: string | undefined;

    const lines = mainProvision.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 階層情報の検出
      const partMatch = line.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      if (partMatch) {
        currentPart = partMatch[1];
        currentChapter = undefined;
        currentSection = undefined;
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      const chapterMatch = line.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      if (chapterMatch) {
        currentChapter = chapterMatch[1];
        currentSection = undefined;
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      const sectionMatch = line.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        currentSubsection = undefined;
        currentDivision = undefined;
      }

      if (line.includes('<Article')) {
        const articleBlock = this.extractArticleBlock(lines, i);
        const article = this.parseArticleBlock(articleBlock);
        if (article) {
          article.part = currentPart;
          article.chapter = currentChapter;
          article.section = currentSection;
          article.subsection = currentSubsection;
          article.division = currentDivision;
          articles.push(article);
        }
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
    const numMatch = articleBlock.match(/<Article[^>]*Num="([^"]+)"/);
    if (!numMatch) return null;

    const articleNumber = this.convertToKanji(numMatch[1]);
    const captionMatch = articleBlock.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
    const articleCaption = captionMatch ? captionMatch[1] : undefined;

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
      const numMatch = match[0].match(/Num="([^"]+)"/);
      const paragraphNum = numMatch ? parseInt(numMatch[1]) : 1;

      const sentenceMatch = paragraphBlock.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);
      const paragraphSentence = sentenceMatch ? sentenceMatch[1] : '';

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
      const numMatch = match[0].match(/Num="([^"]+)"/);
      if (!numMatch) continue;

      const itemNumber = this.convertToKanji(numMatch[1]);
      const sentenceMatch = itemBlock.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);
      const itemSentence = sentenceMatch ? sentenceMatch[1] : '';

      items.push({
        itemNumber,
        itemSentence,
      });
    }

    return items;
  }

  // 数字変換メソッド
  private convertToKanji(num: string): string {
    // reference-detector.ts の実装を使用
    const kanjiMap: { [key: string]: string } = {
      '1': '一', '2': '二', '3': '三', '4': '四', '5': '五',
      '6': '六', '7': '七', '8': '八', '9': '九', '10': '十',
      '11': '十一', '12': '十二', '13': '十三', '14': '十四', '15': '十五',
      '16': '十六', '17': '十七', '18': '十八', '19': '十九', '20': '二十',
      '21': '二十一', '22': '二十二', '23': '二十三', '24': '二十四', '25': '二十五',
      '26': '二十六', '27': '二十七', '28': '二十八', '29': '二十九', '30': '三十',
    };

    if (num.includes('_')) {
      const parts = num.split('_');
      const main = kanjiMap[parts[0]] || parts[0];
      const sub = kanjiMap[parts[1]] || parts[1];
      return `${main}の${sub}`;
    }

    const numInt = parseInt(num);
    if (numInt > 100) {
      return num;
    }

    if (numInt >= 31 && numInt <= 100) {
      const tens = Math.floor(numInt / 10);
      const ones = numInt % 10;
      const tensKanji = ['', '', '', '三', '四', '五', '六', '七', '八', '九'][tens];
      const onesKanji = ones > 0 ? kanjiMap[String(ones)] : '';
      return `${tensKanji}十${onesKanji}`;
    }

    return kanjiMap[num] || num;
  }

  private convertToArabic(kanjiNum: string): string {
    const kanjiToArabicMap: { [key: string]: string } = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
      '十一': '11', '十二': '12', '十三': '13', '十四': '14', '十五': '15',
      '十六': '16', '十七': '17', '十八': '18', '十九': '19', '二十': '20',
    };

    return kanjiToArabicMap[kanjiNum] || kanjiNum;
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
}

// メイン処理
const importer = new ImprovedLawImporter();
importer.importAll().catch(console.error);
