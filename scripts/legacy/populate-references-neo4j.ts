#!/usr/bin/env npx tsx
/**
 * PostgreSQLからNeo4jに参照データを直接移行するスクリプト
 * PostgreSQLのReferenceテーブルから読み取り、Neo4jに同じデータを作成
 */

import { PrismaClient } from '@prisma/client';
import neo4j, { Driver } from 'neo4j-driver';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'lawfinder123';

async function migrateReferencesToNeo4j() {
  console.log('🔄 PostgreSQLからNeo4jへの参照データ移行を開始...\n');
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  
  const session = driver.session();
  
  try {
    // 既存の参照関係をクリア
    console.log('🗑️ 既存の参照関係をクリア中...');
    await session.run(
      `MATCH ()-[r:REFERS_TO|REFERS_TO_LAW|RELATIVE_REF|APPLIES]->()
       DELETE r`
    );
    
    // PostgreSQLから参照データを取得
    const references = await prisma.reference.findMany({
      orderBy: { sourceLawId: 'asc' }
    });
    
    console.log(`📊 ${references.length}件の参照データを移行します\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // バッチ処理で参照関係を作成
    const batchSize = 100;
    for (let i = 0; i < references.length; i += batchSize) {
      const batch = references.slice(i, i + batchSize);
      const tx = session.beginTransaction();
      
      try {
        for (const ref of batch) {
          const sourceId = `${ref.sourceLawId}_${ref.sourceArticle}`;
          
          // 参照タイプによって異なるリレーションシップを作成
          if (ref.referenceType === 'internal' && ref.targetArticle) {
            const targetId = `${ref.sourceLawId}_${ref.targetArticle}`;
            await tx.run(
              `MATCH (source:Article {id: $sourceId})
               MATCH (target:Article {id: $targetId})
               MERGE (source)-[r:REFERS_TO {
                 type: $type,
                 text: $text,
                 confidence: $confidence,
                 metadata: $metadata
               }]->(target)`,
              {
                sourceId,
                targetId,
                type: ref.referenceType,
                text: ref.referenceText,
                confidence: ref.confidence,
                metadata: ref.metadata ? JSON.stringify(ref.metadata) : null
              }
            );
            successCount++;
            
          } else if (ref.referenceType === 'external' && ref.targetLawId) {
            // 外部法令への参照
            if (ref.targetArticle) {
              const targetId = `${ref.targetLawId}_${ref.targetArticle}`;
              await tx.run(
                `MATCH (source:Article {id: $sourceId})
                 MATCH (target:Article {id: $targetId})
                 MERGE (source)-[r:REFERS_TO {
                   type: $type,
                   text: $text,
                   confidence: $confidence,
                   metadata: $metadata
                 }]->(target)`,
                {
                  sourceId,
                  targetId,
                  type: ref.referenceType,
                  text: ref.referenceText,
                  confidence: ref.confidence,
                  metadata: ref.metadata ? JSON.stringify(ref.metadata) : null
                }
              );
            } else {
              // 法令全体への参照
              await tx.run(
                `MATCH (source:Article {id: $sourceId})
                 MATCH (targetLaw:Law {id: $targetLawId})
                 MERGE (source)-[r:REFERS_TO_LAW {
                   type: $type,
                   text: $text,
                   confidence: $confidence
                 }]->(targetLaw)`,
                {
                  sourceId,
                  targetLawId: ref.targetLawId,
                  type: ref.referenceType,
                  text: ref.referenceText,
                  confidence: ref.confidence
                }
              );
            }
            successCount++;
            
          } else if (ref.referenceType === 'relative') {
            // 相対参照
            const metadata = ref.metadata as any;
            const direction = metadata?.relativeDirection || 'previous';
            
            await tx.run(
              `MATCH (source:Article {id: $sourceId})
               MERGE (source)-[r:RELATIVE_REF {
                 type: $type,
                 text: $text,
                 direction: $direction,
                 confidence: $confidence,
                 metadata: $metadata
               }]->(source)`,
              {
                sourceId,
                type: ref.referenceType,
                text: ref.referenceText,
                direction,
                confidence: ref.confidence,
                metadata: ref.metadata ? JSON.stringify(ref.metadata) : null
              }
            );
            successCount++;
            
          } else if (ref.referenceType === 'application') {
            // 準用
            await tx.run(
              `MATCH (source:Article {id: $sourceId})
               MERGE (source)-[r:APPLIES {
                 type: $type,
                 text: $text,
                 confidence: $confidence
               }]->(source)`,
              {
                sourceId,
                type: ref.referenceType,
                text: ref.referenceText,
                confidence: ref.confidence
              }
            );
            successCount++;
            
          } else {
            // その他の参照タイプ
            await tx.run(
              `MATCH (source:Article {id: $sourceId})
               MERGE (source)-[r:REFERS_TO {
                 type: $type,
                 text: $text,
                 confidence: $confidence,
                 metadata: $metadata
               }]->(source)`,
              {
                sourceId,
                type: ref.referenceType,
                text: ref.referenceText,
                confidence: ref.confidence,
                metadata: ref.metadata ? JSON.stringify(ref.metadata) : null
              }
            );
            successCount++;
          }
        }
        
        await tx.commit();
        console.log(`✅ バッチ ${Math.floor(i / batchSize) + 1}: ${batch.length}件処理完了`);
        
      } catch (error) {
        await tx.rollback();
        console.error(`❌ バッチエラー:`, error);
        errorCount += batch.length;
      }
    }
    
    console.log('\n=== 移行完了 ===');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    
    // 統計情報を表示
    const result = await session.run(
      `MATCH ()-[r]->()
       RETURN type(r) as type, count(r) as count
       ORDER BY count DESC`
    );
    
    console.log('\n📊 Neo4j参照関係統計:');
    result.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count')}件`);
    });
    
  } catch (error) {
    console.error('❌ 移行エラー:', error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
    await prisma.$disconnect();
  }
}

// 実行
migrateReferencesToNeo4j().catch(console.error);