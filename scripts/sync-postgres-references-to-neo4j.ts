#!/usr/bin/env tsx

/**
 * PostgreSQLの参照データをNeo4jに同期するスクリプト
 * PostgreSQLの最新参照データ（11,893件）をNeo4jに投入
 */

import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class PostgresToNeo4jSync {
  private driver: neo4j.Driver;
  private batchSize = 500;
  
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'lawfinder123'
      )
    );
  }
  
  async sync(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🔄 PostgreSQL → Neo4j 参照データ同期');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    const startTime = Date.now();
    
    try {
      // 既存の参照関係をクリア
      console.log('既存の参照関係をクリア中...');
      await session.run('MATCH ()-[r:REFERENCES]->() DELETE r');
      
      // PostgreSQLから参照データを取得
      const references = await prisma.reference.findMany();
      
      console.log(`📊 同期対象: ${references.length}件の参照`);
      
      // 法令ノードの確認・作成
      const lawIds = new Set<string>();
      references.forEach(ref => {
        lawIds.add(ref.sourceLawId);
        if (ref.targetLawId) lawIds.add(ref.targetLawId);
      });
      
      console.log(`📝 法令ノード作成/確認: ${lawIds.size}件`);
      
      // 法令ノードを作成
      for (const lawId of lawIds) {
        const law = await prisma.lawMaster.findUnique({
          where: { id: lawId }
        });
        
        if (law) {
          await session.run(
            'MERGE (l:Law {id: $id}) SET l.title = $title, l.lawNumber = $lawNumber',
            { 
              id: lawId, 
              title: law.title,
              lawNumber: law.lawNumber
            }
          );
        }
      }
      
      // 参照関係を投入
      console.log('参照関係を投入中...');
      let processed = 0;
      const refBatch = [];
      
      for (const ref of references) {
        refBatch.push({
          sourceId: ref.sourceLawId,
          targetId: ref.targetLawId || ref.sourceLawId,
          sourceArticle: ref.sourceArticle,
          targetArticle: ref.targetArticle,
          type: ref.referenceType,
          text: ref.referenceText,
          confidence: ref.confidence
        });
        
        if (refBatch.length >= this.batchSize) {
          await this.insertBatch(session, refBatch);
          processed += refBatch.length;
          
          if (processed % 1000 === 0) {
            console.log(`  [${processed}/${references.length}] ${Math.round(processed / references.length * 100)}%`);
          }
          
          refBatch.length = 0;
        }
      }
      
      // 残りを投入
      if (refBatch.length > 0) {
        await this.insertBatch(session, refBatch);
        processed += refBatch.length;
      }
      
      // 統計情報
      const stats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN r.type as type, COUNT(r) as count
        ORDER BY count DESC
      `);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log();
      console.log('='.repeat(80));
      console.log('✅ 同期完了！');
      console.log(`  処理時間: ${elapsed}秒`);
      console.log(`  参照関係: ${references.length}件`);
      console.log();
      console.log('📊 参照タイプ別統計:');
      stats.records.forEach(record => {
        console.log(`  ${record.get('type')}: ${record.get('count').toNumber()}件`);
      });
      console.log('='.repeat(80));
      
    } finally {
      await session.close();
      await this.driver.close();
      await prisma.$disconnect();
    }
  }
  
  private async insertBatch(session: neo4j.Session, batch: any[]): Promise<void> {
    const query = `
      UNWIND $refs as ref
      MATCH (source:Law {id: ref.sourceId})
      MATCH (target:Law {id: ref.targetId})
      CREATE (source)-[r:REFERENCES {
        type: ref.type,
        sourceArticle: ref.sourceArticle,
        targetArticle: ref.targetArticle,
        text: ref.text,
        confidence: ref.confidence
      }]->(target)
    `;
    
    await session.run(query, { refs: batch });
  }
}

// メイン処理
const syncer = new PostgresToNeo4jSync();
syncer.sync().catch(console.error);