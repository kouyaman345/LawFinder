#!/usr/bin/env tsx

/**
 * PostgreSQL内の法令データから参照を検出し、Neo4jにエッジとして投入するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';

const prisma = new PrismaClient();

class ReferenceDetectorAndPopulator {
  private driver: neo4j.Driver;
  private detector: EnhancedReferenceDetectorV41;
  private batchSize = 10;
  private totalLaws = 0;
  private totalArticles = 0;
  private totalReferences = 0;
  private processedLaws = 0;
  
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'lawfinder123'
      )
    );
    this.detector = new EnhancedReferenceDetectorV41({ enableCache: false });
  }
  
  async detectAndPopulate(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🚀 参照検出とNeo4j投入開始');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    const startTime = Date.now();
    
    try {
      // 既存のNeo4jデータをクリア
      console.log('Neo4jの既存データをクリア中...');
      await session.run('MATCH (n) DETACH DELETE n');
      
      // インデックス作成
      console.log('インデックスを作成中...');
      await session.run('CREATE INDEX law_id IF NOT EXISTS FOR (l:Law) ON (l.lawId)').catch(() => {});
      await session.run('CREATE INDEX article_id IF NOT EXISTS FOR (a:Article) ON (a.id)').catch(() => {});
      await session.run('CREATE CONSTRAINT law_unique IF NOT EXISTS FOR (l:Law) REQUIRE l.lawId IS UNIQUE').catch(() => {});
      
      // PostgreSQLから法令を取得
      const laws = await prisma.law.findMany({
        select: {
          id: true,
          title: true,
          lawNumber: true
        }
      });
      
      this.totalLaws = laws.length;
      console.log(`📊 処理対象: ${this.totalLaws}法令`);
      console.log();
      
      // まず全法令ノードを作成
      console.log('法令ノードを作成中...');
      for (const law of laws) {
        await session.run(
          'MERGE (l:Law {lawId: $lawId}) SET l.title = $title, l.lawNumber = $lawNumber',
          {
            lawId: law.id,
            title: law.title,
            lawNumber: law.lawNumber || law.id
          }
        );
      }
      console.log(`✅ ${laws.length}件の法令ノードを作成しました`);
      console.log();
      
      // バッチ処理で参照を検出・投入
      for (let i = 0; i < laws.length; i += this.batchSize) {
        const batch = laws.slice(i, i + this.batchSize);
        const batchNum = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(laws.length / this.batchSize);
        
        console.log(`バッチ ${batchNum}/${totalBatches} 処理中...`);
        
        for (const law of batch) {
          await this.processLaw(session, law.id);
          this.processedLaws++;
          
          // 進捗表示
          if (this.processedLaws % 10 === 0) {
            const progress = (this.processedLaws / this.totalLaws * 100).toFixed(1);
            const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            console.log(`  進捗: ${progress}% (${this.processedLaws}/${this.totalLaws}) | ${elapsed}分経過 | ${this.totalReferences.toLocaleString()}参照`);
          }
        }
      }
      
      const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      
      console.log();
      console.log('='.repeat(80));
      console.log('✅ 参照検出とNeo4j投入完了');
      console.log('='.repeat(80));
      console.log(`処理法令数: ${this.processedLaws.toLocaleString()}件`);
      console.log(`処理条文数: ${this.totalArticles.toLocaleString()}件`);
      console.log(`検出参照数: ${this.totalReferences.toLocaleString()}件`);
      console.log(`処理時間: ${totalTime}分`);
      
      // グラフ統計を表示
      await this.showStatistics(session);
      
    } catch (error) {
      console.error('エラー:', error);
    } finally {
      await session.close();
      await this.driver.close();
      await prisma.$disconnect();
    }
  }
  
  private async processLaw(session: neo4j.Session, lawId: string): Promise<void> {
    try {
      // 法令の条文を取得
      const articles = await prisma.article.findMany({
        where: { lawId: lawId },
        include: {
          paragraphs: {
            include: {
              items: true
            }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });
      
      this.totalArticles += articles.length;
      
      // 各条文から参照を検出
      for (const article of articles) {
        // 条文テキストを構築
        let articleText = article.content || '';
        
        // 項からもテキストを収集
        for (const paragraph of article.paragraphs) {
          articleText += ' ' + paragraph.content;
          for (const item of paragraph.items) {
            articleText += ' ' + item.content;
          }
        }
        
        // 参照を検出
        const references = this.detector.detectReferences(articleText, article.articleNumber);
        
        // Neo4jに参照エッジを作成
        for (const ref of references) {
          const targetLawId = this.determineTargetLaw(ref, lawId);
          
          try {
            await session.run(
              `MATCH (from:Law {lawId: $fromLaw})
               MATCH (to:Law {lawId: $toLaw})
               MERGE (from)-[r:REFERENCES {
                 type: $type,
                 sourceArticle: $sourceArticle,
                 targetArticle: $targetArticle,
                 text: $text,
                 confidence: $confidence
               }]->(to)`,
              {
                fromLaw: lawId,
                toLaw: targetLawId,
                type: ref.type,
                sourceArticle: article.articleNumber,
                targetArticle: ref.targetArticle || '',
                text: ref.sourceText.substring(0, 200),
                confidence: ref.confidence || 1.0
              }
            );
            
            this.totalReferences++;
          } catch (error) {
            // 個別エラーは無視
          }
        }
      }
      
    } catch (error) {
      console.error(`  ⚠️ ${lawId}の処理でエラー:`, error);
    }
  }
  
  private determineTargetLaw(ref: any, currentLawId: string): string {
    // 外部参照の場合
    if (ref.type === 'external' && ref.metadata?.lawNumber) {
      // 法令番号から法令IDを推定
      return ref.metadata.lawNumber.split('_')[0] || currentLawId;
    }
    
    // 略称展開された場合
    if (ref.metadata?.expandedFrom) {
      const abbreviations: Record<string, string> = {
        '民法': '129AC0000000089',
        '刑法': '140AC0000000045',
        '商法': '132AC0000000048',
        '会社法': '417AC0000000086',
        '労働基準法': '322AC0000000049',
        '労基法': '322AC0000000049',
        '憲法': '321CONSTITUTION',
        '民事訴訟法': '108AC0000000109',
        '刑事訴訟法': '323AC0000000131',
        '破産法': '416AC0000000075'
      };
      
      for (const [name, id] of Object.entries(abbreviations)) {
        if (ref.sourceText.includes(name)) {
          return id;
        }
      }
    }
    
    // デフォルトは同一法令内
    return currentLawId;
  }
  
  private async showStatistics(session: neo4j.Session): Promise<void> {
    console.log();
    console.log('📊 Neo4jグラフ統計:');
    
    // 基本統計
    const statsResult = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[r:REFERENCES]->()
      WITH l, count(r) as outRefs
      RETURN 
        count(DISTINCT l) as lawCount,
        sum(outRefs) as refCount,
        avg(outRefs) as avgRefs
    `);
    
    const stats = statsResult.records[0];
    console.log(`  法令ノード数: ${stats.get('lawCount').toLocaleString()}`);
    console.log(`  参照エッジ数: ${stats.get('refCount').toLocaleString()}`);
    console.log(`  平均参照数/法令: ${stats.get('avgRefs')?.toFixed(1) || 0}`);
    
    // 最も参照されている法令TOP5
    const topReferencedResult = await session.run(`
      MATCH (l:Law)<-[:REFERENCES]-()
      RETURN l.lawId as lawId, l.title as title, count(*) as refCount
      ORDER BY refCount DESC
      LIMIT 5
    `);
    
    if (topReferencedResult.records.length > 0) {
      console.log();
      console.log('📈 最も参照されている法令TOP5:');
      topReferencedResult.records.forEach((record, idx) => {
        console.log(`  ${idx + 1}. ${record.get('title')} (${record.get('refCount')}回)`);
      });
    }
    
    // 最も参照している法令TOP5
    const topReferencingResult = await session.run(`
      MATCH (l:Law)-[:REFERENCES]->()
      RETURN l.lawId as lawId, l.title as title, count(*) as refCount
      ORDER BY refCount DESC
      LIMIT 5
    `);
    
    if (topReferencingResult.records.length > 0) {
      console.log();
      console.log('📤 最も参照を持つ法令TOP5:');
      topReferencingResult.records.forEach((record, idx) => {
        console.log(`  ${idx + 1}. ${record.get('title')} (${record.get('refCount')}件)`);
      });
    }
    
    // ハネ改正の可能性がある法令（多段階参照）
    console.log();
    console.log('🔗 ハネ改正分析サンプル:');
    
    const cascadeResult = await session.run(`
      MATCH path = (start:Law)-[:REFERENCES*2..3]->(end:Law)
      WHERE start.lawId <> end.lawId
      RETURN start.title as startLaw, end.title as endLaw, length(path) as depth
      LIMIT 5
    `);
    
    if (cascadeResult.records.length > 0) {
      console.log('  多段階参照パス:');
      cascadeResult.records.forEach((record, idx) => {
        const depth = record.get('depth');
        console.log(`  ${idx + 1}. ${record.get('startLaw')} → (${depth}段階) → ${record.get('endLaw')}`);
      });
    }
  }
}

// メイン実行
async function main() {
  console.log('⚠️ このスクリプトは全法令の参照を検出してNeo4jに投入します。');
  console.log('続行する場合は3秒後に開始します... (Ctrl+Cでキャンセル)');
  console.log();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const processor = new ReferenceDetectorAndPopulator();
  await processor.detectAndPopulate();
}

main().catch(console.error);