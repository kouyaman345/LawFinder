#!/usr/bin/env npx tsx
/**
 * 全法令をNeo4jに同期
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const CONFIG = {
  BATCH_SIZE: 10,
  NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
  NEO4J_USER: process.env.NEO4J_USER || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'lawfinder123'
};

class AllLawsSyncer {
  private prisma: PrismaClient;
  private neo4jDriver: any;
  private detector: ComprehensiveReferenceDetector;
  private stats = {
    totalLaws: 0,
    processedLaws: 0,
    totalArticles: 0,
    totalReferences: 0,
    errors: 0,
    startTime: 0
  };

  constructor() {
    this.prisma = new PrismaClient();
    this.neo4jDriver = neo4j.driver(
      CONFIG.NEO4J_URI,
      neo4j.auth.basic(CONFIG.NEO4J_USER, CONFIG.NEO4J_PASSWORD)
    );
    this.detector = new ComprehensiveReferenceDetector();
  }

  async syncAll(): Promise<void> {
    console.log('🔄 全法令のNeo4j同期を開始します...\n');
    this.stats.startTime = performance.now();

    try {
      // 全法令を取得
      const laws = await this.prisma.law.findMany({
        include: { articles: true }
      });
      
      this.stats.totalLaws = laws.length;
      console.log(`📚 ${this.stats.totalLaws}件の法令を処理します\n`);

      // バッチ処理
      for (let i = 0; i < laws.length; i += CONFIG.BATCH_SIZE) {
        const batch = laws.slice(i, i + CONFIG.BATCH_SIZE);
        
        for (const law of batch) {
          await this.syncLaw(law);
        }
        
        // 進捗表示
        const progress = Math.min(i + CONFIG.BATCH_SIZE, laws.length);
        const percentage = Math.round((progress / laws.length) * 100);
        console.log(`進捗: ${progress}/${laws.length} (${percentage}%)`);
      }

      this.printStats();
    } finally {
      await this.cleanup();
    }
  }

  private async syncLaw(law: any): Promise<void> {
    const session = this.neo4jDriver.session();
    
    try {
      const tx = session.beginTransaction();
      
      try {
        // 法令ノードを作成
        await tx.run(
          `MERGE (l:Law {id: $id})
           SET l.title = $title,
               l.lawType = $lawType,
               l.status = $status,
               l.lastUpdated = datetime()`,
          {
            id: law.id,
            title: law.title,
            lawType: law.lawType || '法律',
            status: law.status
          }
        );

        // 条文ノードを作成
        for (const article of law.articles) {
          const articleId = `${law.id}_${article.articleNumber}`;
          
          await tx.run(
            `MERGE (a:Article {id: $id})
             SET a.lawId = $lawId,
                 a.number = $number,
                 a.title = $title,
                 a.isDeleted = $isDeleted
             WITH a
             MATCH (l:Law {id: $lawId})
             MERGE (l)-[:HAS_ARTICLE]->(a)`,
            {
              id: articleId,
              lawId: law.id,
              number: article.articleNumber,
              title: article.articleTitle || '',
              isDeleted: article.isDeleted
            }
          );
          
          this.stats.totalArticles++;

          // 参照を検出して作成
          if (!article.isDeleted) {
            const references = this.detector.detectAllReferences(article.content);
            
            for (const ref of references) {
              await this.createReference(tx, article, ref);
              this.stats.totalReferences++;
            }
          }
        }

        await tx.commit();
        this.stats.processedLaws++;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      console.error(`❌ エラー (${law.id}):`, error);
      this.stats.errors++;
    } finally {
      await session.close();
    }
  }

  private async createReference(tx: any, article: any, reference: any): Promise<void> {
    const sourceId = `${article.lawId}_${article.articleNumber}`;
    
    try {
      switch (reference.type) {
        case 'internal':
          await tx.run(
            `MATCH (source:Article {id: $sourceId})
             MATCH (target:Article {lawId: $lawId, number: $targetNumber})
             MERGE (source)-[r:REFERS_TO {
               type: 'internal',
               text: $text,
               confidence: $confidence
             }]->(target)`,
            {
              sourceId,
              lawId: article.lawId,
              targetNumber: reference.targetArticle,
              text: reference.text,
              confidence: reference.confidence
            }
          );
          break;

        case 'relative':
          const direction = reference.relativeType || 'previous';
          const distance = reference.relativeDistance || 1;
          
          await tx.run(
            `MATCH (source:Article {id: $sourceId})
             MATCH (source)<-[:HAS_ARTICLE]-(l:Law)-[:HAS_ARTICLE]->(target:Article)
             WHERE id(target) ${direction === 'previous' ? '<' : '>'} id(source)
             WITH source, target
             ORDER BY id(target) ${direction === 'previous' ? 'DESC' : 'ASC'}
             LIMIT 1
             MERGE (source)-[r:RELATIVE_REF {
               direction: $direction,
               distance: $distance,
               text: $text
             }]->(target)`,
            {
              sourceId,
              direction,
              distance,
              text: reference.text
            }
          );
          break;

        case 'external':
          await tx.run(
            `MATCH (source:Article {id: $sourceId})
             MERGE (targetLaw:Law {title: $lawName})
             MERGE (source)-[r:REFERS_TO_LAW {
               type: 'external',
               lawName: $lawName,
               text: $text,
               confidence: $confidence
             }]->(targetLaw)`,
            {
              sourceId,
              lawName: reference.targetLaw,
              text: reference.text,
              confidence: reference.confidence
            }
          );
          break;
      }
    } catch (error) {
      // 参照作成エラーは無視（ログのみ）
    }
  }

  private printStats(): void {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Neo4j同期完了');
    console.log('='.repeat(60));
    console.log(`処理法令数: ${this.stats.processedLaws}/${this.stats.totalLaws}`);
    console.log(`処理条文数: ${this.stats.totalArticles}`);
    console.log(`作成参照数: ${this.stats.totalReferences}`);
    console.log(`エラー数: ${this.stats.errors}`);
    console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
    console.log(`処理速度: ${(this.stats.totalLaws / elapsed).toFixed(1)}法令/秒`);
  }

  private async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
    await this.neo4jDriver.close();
  }
}

// 実行
if (require.main === module) {
  const syncer = new AllLawsSyncer();
  
  syncer.syncAll()
    .then(() => {
      console.log('\n✅ 全法令のNeo4j同期が完了しました');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ エラー:', error);
      process.exit(1);
    });
}