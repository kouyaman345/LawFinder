#!/usr/bin/env tsx

/**
 * 全10,573法令の参照を検出してNeo4jに投入するスクリプト
 * メモリ効率と処理速度を最適化
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';

const prisma = new PrismaClient();

class FullScaleNeo4jPopulator {
  private driver: neo4j.Driver;
  private detector: EnhancedReferenceDetectorV41;
  private batchSize = 5; // 小さいバッチサイズでメモリ管理
  private totalLaws = 0;
  private totalArticles = 0;
  private totalReferences = 0;
  private processedLaws = 0;
  private startTime = 0;
  
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'lawfinder123'
      ),
      {
        maxConnectionPoolSize: 10,
        connectionAcquisitionTimeout: 60000
      }
    );
    this.detector = new EnhancedReferenceDetectorV41({ enableCache: false });
  }
  
  async detectAndPopulate(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🚀 全法令参照検出とNeo4j投入開始');
    console.log('='.repeat(80));
    
    this.startTime = Date.now();
    const session = this.driver.session();
    
    try {
      // Neo4jを初期化
      await this.initializeNeo4j(session);
      
      // PostgreSQLから法令を取得
      const laws = await prisma.law.findMany({
        select: {
          id: true,
          title: true,
          lawNumber: true,
          _count: {
            select: { articles: true }
          }
        },
        orderBy: { id: 'asc' }
      });
      
      this.totalLaws = laws.length;
      console.log(`📊 処理対象: ${this.totalLaws.toLocaleString()}法令`);
      console.log(`📊 推定処理時間: ${Math.ceil(this.totalLaws / 100)}分`);
      console.log();
      
      // まず全法令ノードを作成（バッチ処理）
      console.log('法令ノードを作成中...');
      await this.createLawNodes(session, laws);
      console.log(`✅ ${laws.length.toLocaleString()}件の法令ノードを作成しました`);
      console.log();
      
      // 参照を検出・投入（バッチ処理）
      console.log('参照検出とエッジ作成を開始...');
      for (let i = 0; i < laws.length; i += this.batchSize) {
        const batch = laws.slice(i, i + this.batchSize);
        
        // バッチごとに新しいセッションを使用
        const batchSession = this.driver.session();
        try {
          await this.processBatch(batchSession, batch);
        } finally {
          await batchSession.close();
        }
        
        // 進捗表示
        this.showProgress();
        
        // 定期的にメモリをクリーンアップ
        if (i % 100 === 0 && i > 0) {
          if (global.gc) {
            global.gc();
          }
        }
      }
      
      await this.showFinalReport(session);
      
    } catch (error) {
      console.error('エラー:', error);
    } finally {
      await session.close();
      await this.driver.close();
      await prisma.$disconnect();
    }
  }
  
  private async initializeNeo4j(session: neo4j.Session): Promise<void> {
    console.log('Neo4jを初期化中...');
    
    // 既存データをクリア
    console.log('  既存データをクリア中...');
    await session.run('MATCH (n) DETACH DELETE n');
    
    // インデックスとConstraintを作成
    console.log('  インデックスを作成中...');
    const indexQueries = [
      'CREATE INDEX law_id IF NOT EXISTS FOR (l:Law) ON (l.lawId)',
      'CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title)',
      'CREATE INDEX ref_type IF NOT EXISTS FOR ()-[r:REFERENCES]->() ON (r.type)',
      'CREATE CONSTRAINT law_unique IF NOT EXISTS FOR (l:Law) REQUIRE l.lawId IS UNIQUE'
    ];
    
    for (const query of indexQueries) {
      await session.run(query).catch(() => {});
    }
    
    console.log('✅ Neo4j初期化完了');
    console.log();
  }
  
  private async createLawNodes(session: neo4j.Session, laws: any[]): Promise<void> {
    const nodesBatch = 100;
    
    for (let i = 0; i < laws.length; i += nodesBatch) {
      const batch = laws.slice(i, i + nodesBatch);
      
      // バッチでノードを作成
      const tx = session.beginTransaction();
      try {
        for (const law of batch) {
          await tx.run(
            'MERGE (l:Law {lawId: $lawId}) SET l.title = $title, l.lawNumber = $lawNumber, l.articleCount = $articleCount',
            {
              lawId: law.id,
              title: law.title || '',
              lawNumber: law.lawNumber || law.id,
              articleCount: law._count.articles
            }
          );
        }
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        console.error(`  ノード作成エラー (バッチ ${Math.floor(i/nodesBatch)+1}):`, error);
      }
      
      if (i % 1000 === 0 && i > 0) {
        console.log(`  ${i.toLocaleString()}件のノードを作成済み...`);
      }
    }
  }
  
  private async processBatch(session: neo4j.Session, laws: any[]): Promise<void> {
    for (const law of laws) {
      try {
        await this.processLaw(session, law.id);
        this.processedLaws++;
      } catch (error) {
        console.error(`  ⚠️ ${law.id}の処理でエラー`);
      }
    }
  }
  
  private async processLaw(session: neo4j.Session, lawId: string): Promise<void> {
    // 法令の条文を取得（メモリ効率のため分割取得）
    const articleCount = await prisma.article.count({
      where: { lawId: lawId }
    });
    
    const articlesPerBatch = 50;
    const tx = session.beginTransaction();
    
    try {
      for (let offset = 0; offset < articleCount; offset += articlesPerBatch) {
        const articles = await prisma.article.findMany({
          where: { lawId: lawId },
          include: {
            paragraphs: {
              select: {
                content: true,
                items: {
                  select: { content: true }
                }
              }
            }
          },
          skip: offset,
          take: articlesPerBatch,
          orderBy: { sortOrder: 'asc' }
        });
        
        this.totalArticles += articles.length;
        
        // 各条文から参照を検出
        for (const article of articles) {
          // 条文テキストを構築
          let articleText = article.content || '';
          
          for (const paragraph of article.paragraphs) {
            articleText += ' ' + paragraph.content;
            for (const item of paragraph.items) {
              articleText += ' ' + item.content;
            }
          }
          
          // 参照を検出
          const references = this.detector.detectReferences(articleText, article.articleNumber);
          
          // Neo4jに参照エッジを作成（バッチ内で）
          for (const ref of references) {
            const targetLawId = this.determineTargetLaw(ref, lawId);
            
            await tx.run(
              `MATCH (from:Law {lawId: $fromLaw})
               MATCH (to:Law {lawId: $toLaw})
               MERGE (from)-[r:REFERENCES {
                 type: $type,
                 sourceArticle: $sourceArticle,
                 targetArticle: $targetArticle
               }]->(to)
               SET r.text = $text, r.confidence = $confidence`,
              {
                fromLaw: lawId,
                toLaw: targetLawId,
                type: ref.type,
                sourceArticle: article.articleNumber,
                targetArticle: ref.targetArticle || '',
                text: ref.sourceText.substring(0, 100),
                confidence: ref.confidence || 1.0
              }
            ).catch(() => {}); // 個別エラーは無視
            
            this.totalReferences++;
          }
        }
      }
      
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
  
  private determineTargetLaw(ref: any, currentLawId: string): string {
    // 外部参照の場合
    if (ref.type === 'external' && ref.metadata?.lawNumber) {
      const lawNumber = ref.metadata.lawNumber;
      // 法令番号から法令IDを推定
      if (lawNumber.includes('_')) {
        return lawNumber.split('_')[0];
      }
      return lawNumber;
    }
    
    // 略称展開された場合
    if (ref.metadata?.expandedFrom) {
      const commonLaws: Record<string, string> = {
        '民法': '129AC0000000089',
        '刑法': '140AC0000000045',
        '商法': '132AC0000000048',
        '会社法': '417AC0000000086',
        '民事訴訟法': '108AC0000000109',
        '刑事訴訟法': '323AC0000000131',
        '労働基準法': '322AC0000000049',
        '憲法': '321CONSTITUTION',
        '破産法': '416AC0000000075',
        '特許法': '334AC0000000121',
        '著作権法': '345AC0000000048',
        '独占禁止法': '322AC0000000054'
      };
      
      for (const [name, id] of Object.entries(commonLaws)) {
        if (ref.sourceText.includes(name) || ref.metadata.expandedFrom === name) {
          return id;
        }
      }
    }
    
    // デフォルトは同一法令内
    return currentLawId;
  }
  
  private showProgress(): void {
    if (this.processedLaws % 10 !== 0) return;
    
    const progress = (this.processedLaws / this.totalLaws * 100).toFixed(1);
    const elapsed = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    const rate = this.processedLaws / parseFloat(elapsed) || 0;
    const remaining = ((this.totalLaws - this.processedLaws) / rate).toFixed(1);
    
    console.log(`  進捗: ${progress}% (${this.processedLaws.toLocaleString()}/${this.totalLaws.toLocaleString()})`);
    console.log(`  経過: ${elapsed}分 | 推定残り: ${remaining}分`);
    console.log(`  条文: ${this.totalArticles.toLocaleString()} | 参照: ${this.totalReferences.toLocaleString()}`);
    console.log();
  }
  
  private async showFinalReport(session: neo4j.Session): Promise<void> {
    const totalTime = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
    
    console.log('='.repeat(80));
    console.log('✅ 参照検出とNeo4j投入完了');
    console.log('='.repeat(80));
    console.log(`処理法令数: ${this.processedLaws.toLocaleString()}件`);
    console.log(`処理条文数: ${this.totalArticles.toLocaleString()}件`);
    console.log(`検出参照数: ${this.totalReferences.toLocaleString()}件`);
    console.log(`処理時間: ${totalTime}分`);
    console.log(`平均速度: ${(this.processedLaws / parseFloat(totalTime)).toFixed(1)}法令/分`);
    
    // グラフ統計
    console.log();
    console.log('📊 Neo4jグラフ統計:');
    
    const statsResult = await session.run(`
      MATCH (l:Law)
      WITH count(l) as nodeCount
      MATCH ()-[r:REFERENCES]->()
      WITH nodeCount, count(r) as edgeCount
      RETURN nodeCount, edgeCount, 
             toFloat(edgeCount) / toFloat(nodeCount) as avgDegree
    `);
    
    if (statsResult.records.length > 0) {
      const stats = statsResult.records[0];
      console.log(`  法令ノード数: ${stats.get('nodeCount').toNumber().toLocaleString()}`);
      console.log(`  参照エッジ数: ${stats.get('edgeCount').toNumber().toLocaleString()}`);
      console.log(`  平均次数: ${stats.get('avgDegree').toFixed(1)}`);
    }
    
    // 最も参照されている法令TOP10
    const topResult = await session.run(`
      MATCH (l:Law)<-[:REFERENCES]-()
      WITH l, count(*) as refCount
      ORDER BY refCount DESC
      LIMIT 10
      RETURN l.title as title, l.lawId as lawId, refCount
    `);
    
    if (topResult.records.length > 0) {
      console.log();
      console.log('📈 最も参照されている法令TOP10:');
      topResult.records.forEach((record, idx) => {
        console.log(`  ${idx + 1}. ${record.get('title')}`);
        console.log(`     法令ID: ${record.get('lawId')}`);
        console.log(`     被参照数: ${record.get('refCount').toNumber().toLocaleString()}回`);
      });
    }
  }
}

// メイン実行
async function main() {
  console.log('⚠️ このスクリプトは全10,573法令の参照を検出してNeo4jに投入します。');
  console.log('推定処理時間: 60-120分');
  console.log('推定参照数: 300万〜500万件');
  console.log();
  console.log('続行する場合は5秒後に開始します... (Ctrl+Cでキャンセル)');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const processor = new FullScaleNeo4jPopulator();
  await processor.detectAndPopulate();
}

main().catch(console.error);