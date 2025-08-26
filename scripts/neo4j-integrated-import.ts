#!/usr/bin/env npx tsx

/**
 * e-Gov参照データとXMLデータを統合してNeo4jに投入
 * 
 * 完全な法令参照グラフデータベースを構築
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface LawData {
  lawId: string;
  lawNumber: string;
  lawTitle: string;
  xmlPath: string;
  era?: string;
  year?: number;
  num?: number;
  promulgationDate?: string;
  articles: ArticleData[];
}

interface ArticleData {
  articleNumber: string;
  articleCaption?: string;
  articleTitle?: string;
  content: string;
  partNumber?: string;
  chapterNumber?: string;
  sectionNumber?: string;
}

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external';
}

class Neo4jIntegratedImport {
  private driver: any;
  private parser: XMLParser;
  private sampleMode: boolean;
  
  constructor(sampleMode: boolean = false) {
    this.driver = initNeo4jDriver();
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      trimValues: true
    });
    this.sampleMode = sampleMode;
  }

  /**
   * XMLファイルから法令データを抽出
   */
  private extractLawDataFromXml(xmlPath: string): LawData | null {
    if (!fs.existsSync(xmlPath)) {
      console.log(chalk.yellow(`  XMLファイルなし: ${xmlPath}`));
      return null;
    }

    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = this.parser.parse(xmlContent);
      
      const law = parsed.Law || {};
      const lawBody = law.LawBody || {};
      
      // 法令IDを抽出（ファイル名から）
      const lawId = path.basename(xmlPath, '.xml');
      
      const lawData: LawData = {
        lawId,
        lawNumber: law.LawNum || law['@_Num'] || '',
        lawTitle: this.extractText(lawBody.LawTitle) || '',
        xmlPath,
        era: law['@_Era'],
        year: law['@_Year'] ? parseInt(law['@_Year']) : undefined,
        num: law['@_Num'] ? parseInt(law['@_Num']) : undefined,
        promulgationDate: `${law['@_Era']}${law['@_Year']}年${law['@_PromulgateMonth']}月${law['@_PromulgateDay']}日`,
        articles: []
      };
      
      // 条文を抽出
      this.extractArticles(lawBody, lawData.articles);
      
      return lawData;
      
    } catch (error) {
      console.error(chalk.red(`XMLパースエラー: ${xmlPath}`), error.message);
      return null;
    }
  }

  /**
   * テキストノードを抽出
   */
  private extractText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node['#text']) return node['#text'];
    if (node.Sentence) return this.extractText(node.Sentence);
    return '';
  }

  /**
   * 条文を再帰的に抽出
   */
  private extractArticles(node: any, articles: ArticleData[], context: any = {}): void {
    if (!node) return;
    
    // 現在のコンテキストを更新
    if (node['@_Num']) {
      if (node.PartTitle) context.partNumber = node['@_Num'];
      if (node.ChapterTitle) context.chapterNumber = node['@_Num'];
      if (node.SectionTitle) context.sectionNumber = node['@_Num'];
    }
    
    // Article要素を処理
    if (node.Article) {
      const articleNodes = Array.isArray(node.Article) ? node.Article : [node.Article];
      
      for (const article of articleNodes) {
        const articleData: ArticleData = {
          articleNumber: article['@_Num'] || '',
          articleCaption: this.extractText(article.ArticleCaption),
          articleTitle: this.extractText(article.ArticleTitle),
          content: this.extractArticleContent(article),
          ...context
        };
        
        articles.push(articleData);
      }
    }
    
    // 子要素を再帰的に探索
    const childKeys = ['Part', 'Chapter', 'Section', 'MainProvision'];
    for (const key of childKeys) {
      if (node[key]) {
        const children = Array.isArray(node[key]) ? node[key] : [node[key]];
        children.forEach(child => this.extractArticles(child, articles, { ...context }));
      }
    }
  }

  /**
   * 条文の内容を抽出
   */
  private extractArticleContent(article: any): string {
    const parts: string[] = [];
    
    // ArticleCaption
    if (article.ArticleCaption) {
      parts.push(this.extractText(article.ArticleCaption));
    }
    
    // Paragraphs
    if (article.Paragraph) {
      const paragraphs = Array.isArray(article.Paragraph) ? article.Paragraph : [article.Paragraph];
      paragraphs.forEach((para, idx) => {
        const paraNum = para['@_Num'] || (idx + 1);
        const paraText = this.extractParagraphContent(para);
        parts.push(`${paraNum}　${paraText}`);
      });
    }
    
    return parts.join('\n');
  }

  /**
   * 項の内容を抽出
   */
  private extractParagraphContent(paragraph: any): string {
    const parts: string[] = [];
    
    if (paragraph.ParagraphSentence) {
      parts.push(this.extractText(paragraph.ParagraphSentence));
    }
    
    if (paragraph.Item) {
      const items = Array.isArray(paragraph.Item) ? paragraph.Item : [paragraph.Item];
      items.forEach(item => {
        const itemNum = item['@_Num'];
        const itemText = this.extractText(item.ItemSentence);
        parts.push(`　${itemNum}　${itemText}`);
      });
    }
    
    return parts.join('\n');
  }

  /**
   * 単一法令をNeo4jに投入
   */
  async importLaw(lawId: string): Promise<void> {
    const spinner = ora(`${lawId}を処理中...`).start();
    const session = this.driver.session();
    
    try {
      // 1. XMLデータを読み込み
      const xmlPath = this.sampleMode ? 
        path.join(process.cwd(), 'laws_data', 'sample', `${lawId}.xml`) :
        await this.findXmlPath(lawId);
      
      const lawData = xmlPath ? this.extractLawDataFromXml(xmlPath) : null;
      
      // 2. e-Gov参照データを読み込み
      const referencePath = path.join(process.cwd(), 'egov_cache_v2', 'references', `${lawId}.json`);
      const references: EGovReference[] = fs.existsSync(referencePath) ? 
        JSON.parse(fs.readFileSync(referencePath, 'utf-8')) : [];
      
      // 3. トランザクションで投入
      await session.executeWrite(async (tx: any) => {
        // 法令ノードを作成
        await tx.run(`
          MERGE (l:Law {lawId: $lawId})
          SET l.lawNumber = $lawNumber,
              l.lawTitle = $lawTitle,
              l.xmlPath = $xmlPath,
              l.hasXml = $hasXml,
              l.era = $era,
              l.year = $year,
              l.num = $num,
              l.promulgationDate = $promulgationDate,
              l.totalArticles = $totalArticles,
              l.totalReferences = $totalReferences,
              l.source = $source,
              l.updated = datetime()
        `, {
          lawId,
          lawNumber: lawData?.lawNumber || '',
          lawTitle: lawData?.lawTitle || '',
          xmlPath: xmlPath || '',
          hasXml: !!lawData,
          era: lawData?.era || '',
          year: lawData?.year || 0,
          num: lawData?.num || 0,
          promulgationDate: lawData?.promulgationDate || '',
          totalArticles: lawData?.articles.length || 0,
          totalReferences: references.length,
          source: lawData && references.length > 0 ? 'both' : 
                  lawData ? 'xml' : 
                  references.length > 0 ? 'egov' : 'none'
        });
        
        // 条文ノードを作成
        if (lawData) {
          for (const article of lawData.articles) {
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
              SET a.articleCaption = $articleCaption,
                  a.articleTitle = $articleTitle,
                  a.content = $content,
                  a.partNumber = $partNumber,
                  a.chapterNumber = $chapterNumber,
                  a.sectionNumber = $sectionNumber,
                  a.source = 'xml',
                  a.updated = datetime()
            `, {
              lawId,
              articleNumber: article.articleNumber,
              articleCaption: article.articleCaption || '',
              articleTitle: article.articleTitle || '',
              content: article.content,
              partNumber: article.partNumber || '',
              chapterNumber: article.chapterNumber || '',
              sectionNumber: article.sectionNumber || ''
            });
            
            // CONTAINSリレーション
            await tx.run(`
              MATCH (l:Law {lawId: $lawId})
              MATCH (a:Article {lawId: $lawId, articleNumber: $articleNumber})
              MERGE (l)-[:CONTAINS]->(a)
            `, {
              lawId,
              articleNumber: article.articleNumber
            });
          }
        }
        
        // 参照関係を作成
        for (const ref of references) {
          // 内部参照の修正
          if (!ref.targetLawId || ref.targetLawId === ref.sourceLawId) {
            ref.targetLawId = ref.sourceLawId;
            ref.referenceType = 'internal';
          }
          
          if (ref.sourceArticle && ref.targetArticle) {
            // 対象条文が存在することを確認
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            `, {
              lawId: ref.targetLawId,
              articleNumber: ref.targetArticle
            });
            
            // 参照関係を作成
            await tx.run(`
              MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
              MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
              MERGE (s)-[r:REFERENCES]->(t)
              SET r.text = $text,
                  r.type = $type,
                  r.source = 'egov',
                  r.confidence = 1.0,
                  r.updated = datetime()
            `, {
              sourceLawId: ref.sourceLawId,
              sourceArticle: ref.sourceArticle,
              targetLawId: ref.targetLawId,
              targetArticle: ref.targetArticle,
              text: ref.referenceText,
              type: ref.referenceType
            });
          }
        }
      });
      
      spinner.succeed(`${lawId}: XML条文${lawData?.articles.length || 0}件, 参照${references.length}件を投入`);
      
    } catch (error) {
      spinner.fail(`${lawId}: エラー`);
      console.error(error);
    } finally {
      await session.close();
    }
  }

  /**
   * XMLパスを検索
   */
  private async findXmlPath(lawId: string): Promise<string | null> {
    const lawsDataPath = path.join(process.cwd(), 'laws_data');
    const dirs = fs.readdirSync(lawsDataPath);
    
    for (const dir of dirs) {
      if (dir.startsWith(lawId)) {
        const dirPath = path.join(lawsDataPath, dir);
        const xmlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.xml'));
        if (xmlFiles.length > 0) {
          return path.join(dirPath, xmlFiles[0]);
        }
      }
    }
    
    return null;
  }

  /**
   * サンプル法令を全て投入
   */
  async importSamples(): Promise<void> {
    const samplePath = path.join(process.cwd(), 'laws_data', 'sample');
    const xmlFiles = fs.readdirSync(samplePath).filter(f => f.endsWith('.xml'));
    
    console.log(chalk.cyan(`\n📊 ${xmlFiles.length}件のサンプル法令を投入`));
    console.log(chalk.gray('='.repeat(50)));
    
    for (const file of xmlFiles) {
      const lawId = path.basename(file, '.xml');
      await this.importLaw(lawId);
    }
    
    console.log(chalk.gray('='.repeat(50)));
    console.log(chalk.green('✅ サンプル投入完了'));
  }

  /**
   * 統計情報を表示
   */
  async showStatistics(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log(chalk.cyan('\n📊 Neo4j統計情報'));
      console.log(chalk.gray('='.repeat(50)));
      
      // 法令統計
      const lawStats = await session.run(`
        MATCH (l:Law)
        RETURN 
          count(l) as total,
          count(CASE WHEN l.hasXml THEN 1 END) as withXml,
          count(CASE WHEN l.totalReferences > 0 THEN 1 END) as withRefs
      `);
      
      const lawRecord = lawStats.records[0];
      console.log(chalk.blue('法令:'));
      console.log(`  総数: ${lawRecord.get('total')}`);
      console.log(`  XML有り: ${lawRecord.get('withXml')}`);
      console.log(`  参照有り: ${lawRecord.get('withRefs')}`);
      
      // 条文統計
      const articleStats = await session.run(`
        MATCH (a:Article)
        RETURN count(a) as total
      `);
      
      console.log(chalk.blue('\n条文:'));
      console.log(`  総数: ${articleStats.records[0].get('total')}`);
      
      // 参照統計
      const refStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN 
          count(r) as total,
          count(CASE WHEN r.type = 'internal' THEN 1 END) as internal,
          count(CASE WHEN r.type = 'external' THEN 1 END) as external
      `);
      
      const refRecord = refStats.records[0];
      console.log(chalk.blue('\n参照:'));
      console.log(`  総数: ${refRecord.get('total')}`);
      console.log(`  内部参照: ${refRecord.get('internal')}`);
      console.log(`  外部参照: ${refRecord.get('external')}`);
      
    } finally {
      await session.close();
    }
    
    console.log(chalk.gray('='.repeat(50)));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const importer = new Neo4jIntegratedImport(true); // サンプルモード
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'import':
          const lawId = process.argv[3];
          if (lawId) {
            await importer.importLaw(lawId);
          } else {
            await importer.importSamples();
          }
          await importer.showStatistics();
          break;
          
        case 'stats':
          await importer.showStatistics();
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/neo4j-integrated-import.ts import [法令ID]');
          console.log('  npx tsx scripts/neo4j-integrated-import.ts stats');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer.close();
    }
  })();
}