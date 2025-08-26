#!/usr/bin/env npx tsx

/**
 * e-Gov参照データをNeo4jに投入
 * 
 * パース済みの参照データをNeo4jグラフデータベースに投入する
 */

import neo4j, { Driver } from 'neo4j-driver';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parse } from 'csv-parse/sync';

interface ParsedReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external' | 'structural';
  confidence: number;
  sourcePosition?: {
    start: number;
    end: number;
    line?: number;
  };
}

interface ParseResult {
  lawId: string;
  lawTitle: string;
  references: ParsedReference[];
  parseDate: string;
  articleCount: number;
  linkCount: number;
}

interface LawData {
  lawId: string;
  lawTitle: string;
  lawNumber: string;
  enactDate: string;
}

export class EGovNeo4jImporter {
  private driver: Driver;
  private parsedDir: string;
  private lawDataMap: Map<string, LawData> = new Map();
  
  constructor() {
    // Neo4j接続
    this.driver = neo4j.driver(
      'bolt://localhost:7687',
      neo4j.auth.basic('neo4j', 'lawfinder123')
    );
    
    this.parsedDir = path.join(process.cwd(), 'egov_parsed_references');
    
    // 法令CSVを読み込み
    this.loadLawData();
  }
  
  /**
   * 法令CSVデータを読み込み
   */
  private loadLawData(): void {
    const csvPath = path.join(process.cwd(), 'laws_data', 'all_law_list.csv');
    
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      });
      
      records.forEach((record: any) => {
        const lawId = record['法令ID'];
        if (lawId && lawId !== '法令ID') {
          this.lawDataMap.set(lawId, {
            lawId,
            lawTitle: record['法令名'] || '',
            lawNumber: record['法令番号'] || '',
            enactDate: record['公布日'] || ''
          });
        }
      });
      
      console.log(chalk.green(`✓ ${this.lawDataMap.size}件の法令データを読み込み`));
    }
  }
  
  /**
   * Neo4jを初期化（既存データをクリア）
   */
  async clearDatabase(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log(chalk.yellow('⚠️ 既存データを削除中...'));
      
      // すべてのノードと関係を削除
      await session.run('MATCH (n) DETACH DELETE n');
      
      // インデックスを作成
      await session.run('CREATE INDEX law_id IF NOT EXISTS FOR (l:Law) ON (l.lawId)');
      await session.run('CREATE INDEX article_id IF NOT EXISTS FOR (a:Article) ON (a.articleId)');
      
      console.log(chalk.green('✓ データベースをクリアしました'));
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * 法令ノードを作成または取得
   */
  private async ensureLawNode(session: any, lawId: string): Promise<void> {
    const lawData = this.lawDataMap.get(lawId);
    
    if (!lawData) {
      // CSVにない法令の場合はIDのみで作成
      await session.run(
        `MERGE (l:Law {lawId: $lawId})
         ON CREATE SET l.title = $lawId, l.source = 'egov'`,
        { lawId }
      );
    } else {
      await session.run(
        `MERGE (l:Law {lawId: $lawId})
         ON CREATE SET 
           l.title = $title,
           l.lawNumber = $lawNumber,
           l.enactDate = $enactDate,
           l.source = 'egov'`,
        {
          lawId,
          title: lawData.lawTitle,
          lawNumber: lawData.lawNumber,
          enactDate: lawData.enactDate
        }
      );
    }
  }
  
  /**
   * 条文ノードを作成または取得
   */
  private async ensureArticleNode(
    session: any, 
    lawId: string, 
    articleNumber: string
  ): Promise<void> {
    const articleId = `${lawId}_Article_${articleNumber}`;
    
    await session.run(
      `MATCH (l:Law {lawId: $lawId})
       MERGE (a:Article {articleId: $articleId})
       ON CREATE SET 
         a.number = $articleNumber,
         a.lawId = $lawId
       MERGE (l)-[:CONTAINS]->(a)`,
      { lawId, articleId, articleNumber }
    );
  }
  
  /**
   * 参照データを投入
   */
  async importReferences(lawId: string): Promise<number> {
    const filePath = path.join(this.parsedDir, `${lawId}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️ ファイルが見つかりません: ${lawId}`));
      return 0;
    }
    
    const session = this.driver.session();
    let count = 0;
    
    try {
      const data: ParseResult = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // 法令ノードを作成
      await this.ensureLawNode(session, lawId);
      
      // タイトルを更新（HTMLから取得したものがあれば）
      if (data.lawTitle) {
        await session.run(
          `MATCH (l:Law {lawId: $lawId})
           SET l.htmlTitle = $title`,
          { lawId, title: data.lawTitle }
        );
      }
      
      // 参照を処理
      for (const ref of data.references) {
        try {
          if (ref.referenceType === 'internal') {
            // 内部参照
            if (ref.sourceArticle && ref.targetArticle) {
              await this.ensureArticleNode(session, lawId, ref.sourceArticle);
              await this.ensureArticleNode(session, lawId, ref.targetArticle);
              
              await session.run(
                `MATCH (source:Article {articleId: $sourceId})
                 MATCH (target:Article {articleId: $targetId})
                 MERGE (source)-[r:REFERENCES]->(target)
                 SET r.text = $text,
                     r.type = 'internal',
                     r.source = 'egov',
                     r.confidence = $confidence,
                     r.sourceStartPos = $startPos,
                     r.sourceEndPos = $endPos`,
                {
                  sourceId: `${lawId}_Article_${ref.sourceArticle}`,
                  targetId: `${lawId}_Article_${ref.targetArticle}`,
                  text: ref.referenceText,
                  confidence: ref.confidence,
                  startPos: ref.sourcePosition?.start,
                  endPos: ref.sourcePosition?.end
                }
              );
            } else {
              // 法令レベルの内部参照
              await session.run(
                `MATCH (l:Law {lawId: $lawId})
                 MERGE (l)-[r:SELF_REFERENCE]->(l)
                 SET r.text = $text,
                     r.source = 'egov',
                     r.confidence = $confidence`,
                {
                  lawId,
                  text: ref.referenceText,
                  confidence: ref.confidence
                }
              );
            }
            
          } else if (ref.referenceType === 'external' && ref.targetLawId) {
            // 外部参照
            await this.ensureLawNode(session, ref.targetLawId);
            
            if (ref.sourceArticle && ref.targetArticle) {
              // 条文間参照
              await this.ensureArticleNode(session, lawId, ref.sourceArticle);
              await this.ensureArticleNode(session, ref.targetLawId, ref.targetArticle);
              
              await session.run(
                `MATCH (source:Article {articleId: $sourceId})
                 MATCH (target:Article {articleId: $targetId})
                 MERGE (source)-[r:REFERENCES]->(target)
                 SET r.text = $text,
                     r.type = 'external',
                     r.source = 'egov',
                     r.confidence = $confidence,
                     r.sourceStartPos = $startPos,
                     r.sourceEndPos = $endPos`,
                {
                  sourceId: ref.sourceArticle ? `${lawId}_Article_${ref.sourceArticle}` : null,
                  targetId: ref.targetArticle ? `${ref.targetLawId}_Article_${ref.targetArticle}` : null,
                  text: ref.referenceText,
                  confidence: ref.confidence,
                  startPos: ref.sourcePosition?.start,
                  endPos: ref.sourcePosition?.end
                }
              );
            } else if (ref.sourceArticle) {
              // 条文から法令への参照
              await this.ensureArticleNode(session, lawId, ref.sourceArticle);
              
              await session.run(
                `MATCH (source:Article {articleId: $sourceId})
                 MATCH (target:Law {lawId: $targetLawId})
                 MERGE (source)-[r:REFERENCES]->(target)
                 SET r.text = $text,
                     r.type = 'external',
                     r.source = 'egov',
                     r.confidence = $confidence,
                     r.sourceStartPos = $startPos,
                     r.sourceEndPos = $endPos`,
                {
                  sourceId: `${lawId}_Article_${ref.sourceArticle}`,
                  targetLawId: ref.targetLawId,
                  text: ref.referenceText,
                  confidence: ref.confidence,
                  startPos: ref.sourcePosition?.start,
                  endPos: ref.sourcePosition?.end
                }
              );
            } else {
              // 法令間参照
              await session.run(
                `MATCH (source:Law {lawId: $sourceId})
                 MATCH (target:Law {lawId: $targetId})
                 MERGE (source)-[r:REFERENCES]->(target)
                 SET r.text = $text,
                     r.type = 'external',
                     r.source = 'egov',
                     r.confidence = $confidence`,
                {
                  sourceId: lawId,
                  targetId: ref.targetLawId,
                  text: ref.referenceText,
                  confidence: ref.confidence
                }
              );
            }
          }
          
          count++;
          
        } catch (error: any) {
          console.error(chalk.red(`  参照投入エラー: ${error.message}`));
        }
      }
      
      // 統計情報を更新
      await session.run(
        `MATCH (l:Law {lawId: $lawId})
         SET l.referenceCount = $count,
             l.articleCount = $articleCount,
             l.linkCount = $linkCount,
             l.importDate = datetime()`,
        {
          lawId,
          count: data.references.length,
          articleCount: data.articleCount,
          linkCount: data.linkCount
        }
      );
      
    } finally {
      await session.close();
    }
    
    return count;
  }
  
  /**
   * すべての参照データを投入
   */
  async importAll(options: {
    clear?: boolean;
    limit?: number;
  } = {}): Promise<void> {
    const { clear = false, limit } = options;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🚀 Neo4j参照データ投入開始'));
    console.log(chalk.cyan('='.repeat(60)));
    
    // データベースをクリア
    if (clear) {
      await this.clearDatabase();
    }
    
    // パース済みファイル一覧を取得
    const files = fs.readdirSync(this.parsedDir)
      .filter(f => f.endsWith('.json') && f !== 'parse_progress.json')
      .map(f => f.replace('.json', ''));
    
    let targetFiles = files;
    if (limit) {
      targetFiles = files.slice(0, limit);
    }
    
    console.log(chalk.blue('\n📊 処理状況:'));
    console.log(`  パース済みファイル: ${files.length}件`);
    console.log(`  処理対象: ${targetFiles.length}件`);
    
    const startTime = Date.now();
    let totalReferences = 0;
    let processedLaws = 0;
    let errors = 0;
    
    for (let i = 0; i < targetFiles.length; i++) {
      const lawId = targetFiles[i];
      
      console.log(chalk.blue(`\n[${i + 1}/${targetFiles.length}] 投入中: ${lawId}`));
      
      try {
        const count = await this.importReferences(lawId);
        totalReferences += count;
        processedLaws++;
        
        console.log(chalk.green(`  ✓ ${count}件の参照を投入`));
        
      } catch (error: any) {
        console.error(chalk.red(`  ✗ エラー: ${error.message}`));
        errors++;
      }
    }
    
    // 統計を取得
    const session = this.driver.session();
    try {
      const stats = await session.run(`
        MATCH (l:Law)
        OPTIONAL MATCH (l)-[r:REFERENCES]->()
        RETURN 
          count(DISTINCT l) as lawCount,
          count(r) as referenceCount
      `);
      
      const record = stats.records[0];
      const dbLaws = record.get('lawCount').toNumber();
      const dbRefs = record.get('referenceCount').toNumber();
      
      const articleStats = await session.run(`
        MATCH (a:Article)
        OPTIONAL MATCH (a)-[r:REFERENCES]->()
        RETURN 
          count(DISTINCT a) as articleCount,
          count(r) as articleRefCount
      `);
      
      const articleRecord = articleStats.records[0];
      const dbArticles = articleRecord.get('articleCount').toNumber();
      const dbArticleRefs = articleRecord.get('articleRefCount').toNumber();
      
      const totalTime = (Date.now() - startTime) / 1000 / 60;
      
      console.log(chalk.cyan('\n' + '='.repeat(60)));
      console.log(chalk.cyan('📊 投入完了'));
      console.log(chalk.cyan('='.repeat(60)));
      console.log(chalk.green(`✅ 処理済み: ${processedLaws}件`));
      console.log(chalk.red(`✗ エラー: ${errors}件`));
      console.log(chalk.blue(`\nNeo4j統計:`));
      console.log(`  法令ノード: ${dbLaws}件`);
      console.log(`  条文ノード: ${dbArticles}件`);
      console.log(`  法令間参照: ${dbRefs}件`);
      console.log(`  条文間参照: ${dbArticleRefs}件`);
      console.log(`  総参照数: ${dbRefs + dbArticleRefs}件`);
      console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * クリーンアップ
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const importer = new EGovNeo4jImporter();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'import':
          await importer.importAll({
            clear: process.argv.includes('--clear'),
            limit: process.argv.includes('--limit') ?
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined
          });
          break;
          
        case 'test':
          // テスト（5件のみ、クリアなし）
          await importer.importAll({ limit: 5 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-to-neo4j-import.ts import [オプション]');
          console.log('  npx tsx scripts/egov-to-neo4j-import.ts test');
          console.log('\nオプション:');
          console.log('  --clear     既存データをクリア');
          console.log('  --limit N   投入数を制限');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer.close();
    }
  })();
}

export default EGovNeo4jImporter;