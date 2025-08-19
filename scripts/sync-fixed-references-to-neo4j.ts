#!/usr/bin/env tsx

/**
 * 修正された参照データをNeo4jに同期
 * 外部参照を含む完全なグラフ構造を構築
 */

import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class Neo4jReferenceSyncer {
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
    console.log('🔄 修正された参照データをNeo4jに同期');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    const startTime = Date.now();
    
    try {
      // 既存の参照関係をクリア（ノードは保持）
      console.log('既存の参照関係をクリア中...');
      await session.run('MATCH ()-[r:REFERENCES]->() DELETE r');
      
      // PostgreSQLから参照データを取得
      const references = await prisma.reference.findMany();
      console.log(`📊 同期対象: ${references.length}件の参照`);
      
      // targetLawIdが設定されている外部参照を確認
      const externalRefs = references.filter(r => 
        r.targetLawId && r.targetLawId !== r.sourceLawId
      );
      console.log(`  外部参照: ${externalRefs.length}件`);
      
      // 法令ノードの確認・作成
      const lawIds = new Set<string>();
      references.forEach(ref => {
        lawIds.add(ref.sourceLawId);
        if (ref.targetLawId) lawIds.add(ref.targetLawId);
      });
      
      console.log(`📝 法令ノード作成/確認: ${lawIds.size}件`);
      
      // 法令ノードを作成（MERGE使用で重複回避）
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
              lawNumber: law.lawNumber || lawId
            }
          );
        }
      }
      
      // 参照関係を投入
      console.log('参照関係を投入中...');
      let processed = 0;
      let externalCount = 0;
      let internalCount = 0;
      const refBatch = [];
      
      for (const ref of references) {
        // targetLawIdがnullの場合はsourceLawIdを使用（内部参照）
        const targetId = ref.targetLawId || ref.sourceLawId;
        const isExternal = ref.targetLawId && ref.targetLawId !== ref.sourceLawId;
        
        refBatch.push({
          sourceId: ref.sourceLawId,
          targetId: targetId,
          sourceArticle: ref.sourceArticle,
          targetArticle: ref.targetArticle,
          type: ref.referenceType,
          text: ref.referenceText,
          confidence: ref.confidence,
          isExternal: isExternal
        });
        
        if (isExternal) {
          externalCount++;
        } else {
          internalCount++;
        }
        
        if (refBatch.length >= this.batchSize) {
          await this.insertBatch(session, refBatch);
          processed += refBatch.length;
          
          if (processed % 1000 === 0) {
            console.log(`  [${processed}/${references.length}] ${Math.round(processed / references.length * 100)}% (外部: ${externalCount}, 内部: ${internalCount})`);
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
        RETURN r.type as type, r.isExternal as isExternal, COUNT(r) as count
        ORDER BY count DESC
      `);
      
      // 相互参照の確認
      const mutualRefs = await session.run(`
        MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(a)
        WHERE a.id < b.id AND a.id <> b.id
        RETURN COUNT(*) as count
      `);
      
      const mutualCount = mutualRefs.records[0]?.get('count').toNumber() || 0;
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log();
      console.log('='.repeat(80));
      console.log('✅ Neo4j同期完了！');
      console.log(`  処理時間: ${elapsed}秒`);
      console.log(`  総参照関係: ${references.length}件`);
      console.log(`  外部参照: ${externalCount}件`);
      console.log(`  内部参照: ${internalCount}件`);
      console.log(`  相互参照ペア: ${mutualCount}組`);
      console.log();
      console.log('📊 参照タイプ別統計:');
      
      const typeStats = new Map<string, number>();
      stats.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        typeStats.set(type, (typeStats.get(type) || 0) + count);
      });
      
      for (const [type, count] of typeStats) {
        console.log(`  ${type}: ${count}件`);
      }
      
      console.log();
      console.log('🔍 可視化サンプルクエリ:');
      console.log('  相互参照を表示:');
      console.log('    MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(a)');
      console.log('    WHERE a.id < b.id RETURN a, r1, b, r2 LIMIT 50');
      console.log();
      console.log('  外部参照ネットワーク:');
      console.log('    MATCH (a:Law)-[r:REFERENCES {isExternal: true}]->(b:Law)');
      console.log('    WHERE a.id <> b.id RETURN a, r, b LIMIT 100');
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
        confidence: ref.confidence,
        isExternal: ref.isExternal
      }]->(target)
    `;
    
    await session.run(query, { refs: batch });
  }
}

// メイン処理
const syncer = new Neo4jReferenceSyncer();
syncer.sync().catch(console.error);