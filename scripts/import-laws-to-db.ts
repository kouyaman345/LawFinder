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
    
    const parsedLaw = this.parseXML(xmlContent, lawId);
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

    // 条文を保存
    const savedArticles = new Map<string, any>();
    for (const article of parsedLaw.articles) {
      // 重複チェック
      if (savedArticles.has(article.articleNumber)) {
        console.warn(`重複する条番号: ${parsedLaw.lawTitle} 第${article.articleNumber}条`);
        continue;
      }
      
      const savedArticle = await prisma.article.create({
        data: {
          lawId: law.id,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle,
          content: this.getArticleFullText(article),
        },
      });
      savedArticles.set(article.articleNumber, savedArticle);

      // 項を保存
      const savedParagraphs = new Map<number, any>();
      for (const paragraph of article.paragraphs) {
        // 重複チェック
        if (savedParagraphs.has(paragraph.paragraphNum)) {
          console.warn(`重複する項番号: 第${article.articleNumber}条 第${paragraph.paragraphNum}項`);
          continue;
        }
        
        const savedParagraph = await prisma.paragraph.create({
          data: {
            articleId: savedArticle.id,
            paragraphNumber: paragraph.paragraphNum,
            content: paragraph.paragraphSentence,
          },
        });
        savedParagraphs.set(paragraph.paragraphNum, savedParagraph);

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
  }

  private parseXML(xmlContent: string, lawId: string): ParsedLaw | null {
    // Ruby タグの処理
    const cleanXml = xmlContent.replace(/<Ruby>[\s\S]*?<\/Ruby>/g, (match) => {
      const rtMatch = match.match(/<Rt>([^<]+)<\/Rt>/);
      const baseMatch = match.match(/>([^<>]+)<Rt>/);
      if (rtMatch && baseMatch) {
        return baseMatch[1];
      }
      return match.replace(/<[^>]+>/g, '');
    });
    
    // 法令名
    const titleMatch = cleanXml.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : `法令${lawId}`;
    
    // メタデータ
    const metadata = this.extractMetadata(cleanXml);
    
    // 制定文
    const enactStatements = this.extractEnactStatements(cleanXml);
    
    // MainProvisionから条文を抽出
    const articles = this.extractMainProvisionArticles(cleanXml);
    
    // 改正履歴
    const amendmentHistory = this.extractAmendmentHistory(cleanXml);
    
    return {
      lawId,
      lawTitle,
      metadata,
      enactStatements,
      articles,
      amendmentHistory
    };
  }

  private extractMetadata(xmlContent: string): any {
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    const promulgationMatch = xmlContent.match(/<PromulgateDate>([^<]+)<\/PromulgateDate>/);
    
    return {
      lawNumber: lawNumMatch ? lawNumMatch[1] : null,
      promulgationDate: promulgationMatch ? promulgationMatch[1] : null,
    };
  }

  private extractEnactStatements(xmlContent: string): any {
    const enactMatch = xmlContent.match(/<EnactStatement>([\s\S]*?)<\/EnactStatement>/);
    if (!enactMatch) return null;
    
    const enactContent = enactMatch[1];
    return {
      text: enactContent.replace(/<[^>]+>/g, '').trim()
    };
  }

  private extractMainProvisionArticles(xmlContent: string): ParsedArticle[] {
    const articles: ParsedArticle[] = [];
    const mainProvisionMatch = xmlContent.match(/<MainProvision>([\s\S]*?)<\/MainProvision>/);
    if (!mainProvisionMatch) return articles;
    
    const mainProvisionContent = mainProvisionMatch[1];
    const articleRegex = /<Article[^>]*>([\s\S]*?)<\/Article>/g;
    let articleMatch;
    
    while ((articleMatch = articleRegex.exec(mainProvisionContent)) !== null) {
      const articleContent = articleMatch[1];
      const article = this.parseArticle(articleContent);
      if (article) {
        articles.push(article);
      }
    }
    
    return articles;
  }

  private parseArticle(articleContent: string): ParsedArticle | null {
    const articleNumMatch = articleContent.match(/<ArticleTitle[^>]*>第([^条]+)条/);
    if (!articleNumMatch) return null;
    
    const articleNumber = articleNumMatch[1];
    const articleTitleMatch = articleContent.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
    const articleTitle = articleTitleMatch ? articleTitleMatch[1].replace(/^第[^条]+条/, '').trim() : undefined;
    
    const articleCaptionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
    const articleCaption = articleCaptionMatch ? articleCaptionMatch[1] : undefined;
    
    const paragraphs = this.parseParagraphs(articleContent);
    
    return {
      articleNumber,
      articleTitle: articleTitle || articleCaption,
      articleCaption,
      paragraphs
    };
  }

  private parseParagraphs(articleContent: string): ParsedParagraph[] {
    const paragraphs: ParsedParagraph[] = [];
    const paragraphRegex = /<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g;
    let paragraphMatch;
    let paragraphNum = 1;
    
    while ((paragraphMatch = paragraphRegex.exec(articleContent)) !== null) {
      const paragraphContent = paragraphMatch[1];
      const paragraphNumMatch = paragraphContent.match(/Num="(\d+)"/);
      if (paragraphNumMatch) {
        paragraphNum = parseInt(paragraphNumMatch[1]);
      }
      
      const sentenceMatch = paragraphContent.match(/<ParagraphSentence[^>]*>([\s\S]*?)<\/ParagraphSentence>/);
      if (sentenceMatch) {
        const sentence = sentenceMatch[1].replace(/<[^>]+>/g, '').trim();
        const items = this.parseItems(paragraphContent);
        
        paragraphs.push({
          paragraphNum,
          paragraphSentence: sentence,
          items: items.length > 0 ? items : undefined
        });
        
        paragraphNum++;
      }
    }
    
    return paragraphs;
  }

  private parseItems(paragraphContent: string): ParsedItem[] {
    const items: ParsedItem[] = [];
    const itemRegex = /<Item[^>]*>([\s\S]*?)<\/Item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(paragraphContent)) !== null) {
      const itemContent = itemMatch[1];
      const itemNumMatch = itemContent.match(/<ItemTitle>([^<]+)<\/ItemTitle>/);
      const itemSentenceMatch = itemContent.match(/<ItemSentence[^>]*>([\s\S]*?)<\/ItemSentence>/);
      
      if (itemNumMatch && itemSentenceMatch) {
        items.push({
          itemNumber: itemNumMatch[1],
          itemSentence: itemSentenceMatch[1].replace(/<[^>]+>/g, '').trim()
        });
      }
    }
    
    return items;
  }

  private extractAmendmentHistory(xmlContent: string): any {
    const amendmentMatch = xmlContent.match(/<AmendProvision>([\s\S]*?)<\/AmendProvision>/);
    if (!amendmentMatch) return null;
    
    return {
      text: amendmentMatch[1].replace(/<[^>]+>/g, '').trim()
    };
  }

  private getArticleFullText(article: ParsedArticle): string {
    let fullText = `第${article.articleNumber}条`;
    if (article.articleTitle) {
      fullText += `（${article.articleTitle}）`;
    }
    fullText += '\n';
    
    for (const paragraph of article.paragraphs) {
      if (article.paragraphs.length > 1) {
        fullText += `${paragraph.paragraphNum} `;
      }
      fullText += paragraph.paragraphSentence + '\n';
      
      if (paragraph.items) {
        for (const item of paragraph.items) {
          fullText += `  ${item.itemNumber} ${item.itemSentence}\n`;
        }
      }
    }
    
    return fullText.trim();
  }

  private async detectAndSaveReferences() {
    console.log('\n参照関係を検出しています...');
    
    const laws = await prisma.law.findMany({
      include: {
        articles: true,
      },
    });

    for (const law of laws) {
      for (const article of law.articles) {
        const references = this.referenceDetector.detectReferences(article.content, law.id);
        
        for (const ref of references) {
          // 内部参照の場合、対象条文を探す
          if (ref.type === 'internal' && ref.targetArticle) {
            const targetArticle = await prisma.article.findFirst({
              where: {
                lawId: law.id,
                articleNumber: ref.targetArticle,
              },
            });

            if (targetArticle) {
              await prisma.reference.create({
                data: {
                  fromArticleId: article.id,
                  toArticleId: targetArticle.id,
                  referenceText: ref.text,
                  referenceType: 'internal',
                  confidence: ref.confidence,
                },
              });
            }
          } else if (ref.type === 'external' && ref.targetLaw) {
            // 外部参照の場合
            await prisma.reference.create({
              data: {
                fromArticleId: article.id,
                toLawId: ref.targetLaw,
                referenceText: ref.text,
                referenceType: 'external',
                confidence: ref.confidence,
              },
            });
          }
        }
      }
    }
  }
}

class ReferenceDetector {
  detectReferences(content: string, currentLawId: string): any[] {
    const references: any[] = [];
    
    // 内部参照パターン
    const internalPatterns = [
      /第(\d+)条/g,
      /前条/g,
      /次条/g,
      /同条第(\d+)項/g,
      /第(\d+)項/g,
      /前項/g,
      /次項/g,
      /同項第(\d+)号/g,
      /第(\d+)号/g,
    ];

    // 外部参照パターン
    const externalPatterns = [
      /([^（）]+法).*第(\d+)条/g,
      /([^（）]+法律第\d+号)/g,
    ];

    // 内部参照を検出
    for (const pattern of internalPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let targetArticle: string | null = null;
        
        if (match[0].includes('条')) {
          if (match[1]) {
            targetArticle = match[1];
          } else if (match[0] === '前条') {
            // 前条の場合は特別な処理が必要
            targetArticle = 'prev';
          } else if (match[0] === '次条') {
            targetArticle = 'next';
          }
        }

        if (targetArticle) {
          references.push({
            type: 'internal',
            text: match[0],
            targetArticle,
            confidence: 0.9,
          });
        }
      }
    }

    // 外部参照を検出
    for (const pattern of externalPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: match[1],
          targetArticle: match[2] || null,
          confidence: 0.8,
        });
      }
    }

    return references;
  }
}

// 実行
if (require.main === module) {
  const importer = new LawImporter();
  importer.importAll().catch(console.error);
}