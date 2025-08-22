#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import chalk from 'chalk';

const prisma = new PrismaClient();

// Neo4j接続設定
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'lawfinder123'
  )
);

/**
 * PostgreSQLの参照データをNeo4jに同期
 */
async function syncReferencesToNeo4j(lawId?: string) {
  const session = driver.session();
  
  try {
    console.log(chalk.cyan('🚀 参照データのNeo4j同期開始'));
    
    // 参照データを取得
    const references = await prisma.reference.findMany({
      where: lawId ? { sourceLawId: lawId } : {}
    });
    
    // 法令マスタ情報を取得
    const lawMasters = await prisma.lawMaster.findMany({
      where: lawId ? { id: lawId } : {}
    });
    
    console.log(chalk.cyan(`📝 ${references.length}件の参照データを処理中...`));
    
    let successCount = 0;
    let errorCount = 0;
    
    // バッチ処理で効率化
    const batchSize = 50;
    for (let i = 0; i < references.length; i += batchSize) {
      const batch = references.slice(i, i + batchSize);
      
      for (const ref of batch) {
        try {
          // 法令ノードを作成
          await session.run(
            `
            MERGE (sourceLaw:Law {id: $sourceLawId})
            SET sourceLaw.title = $sourceTitle
            `,
            {
              sourceLawId: ref.sourceLawId,
              sourceTitle: lawMasters.find(l => l.id === ref.sourceLawId)?.title || ref.sourceLawId
            }
          );
          
          // 条文ノードを作成
          await session.run(
            `
            MATCH (law:Law {id: $lawId})
            MERGE (article:Article {lawId: $lawId, number: $articleNumber})
            SET article.id = $lawId + '_' + $articleNumber
            MERGE (law)-[:HAS_ARTICLE]->(article)
            `,
            {
              lawId: ref.sourceLawId,
              articleNumber: ref.sourceArticle
            }
          );
          
          // ターゲットが存在する場合
          if (ref.targetLawId && ref.targetArticle) {
            // ターゲット法令ノードを作成
            await session.run(
              `
              MERGE (targetLaw:Law {id: $targetLawId})
              `,
              { targetLawId: ref.targetLawId }
            );
            
            // ターゲット条文ノードを作成
            await session.run(
              `
              MATCH (law:Law {id: $lawId})
              MERGE (article:Article {lawId: $lawId, number: $articleNumber})
              SET article.id = $lawId + '_' + $articleNumber
              MERGE (law)-[:HAS_ARTICLE]->(article)
              `,
              {
                lawId: ref.targetLawId,
                articleNumber: ref.targetArticle
              }
            );
            
            // 参照関係を作成
            await session.run(
              `
              MATCH (source:Article {lawId: $sourceLawId, number: $sourceArticle})
              MATCH (target:Article {lawId: $targetLawId, number: $targetArticle})
              MERGE (source)-[ref:REFERENCES {
                type: $refType,
                text: $refText,
                confidence: $confidence
              }]->(target)
              `,
              {
                sourceLawId: ref.sourceLawId,
                sourceArticle: ref.sourceArticle,
                targetLawId: ref.targetLawId,
                targetArticle: ref.targetArticle,
                refType: ref.referenceType,
                refText: ref.referenceText,
                confidence: ref.confidence
              }
            );
          }
          
          successCount++;
        } catch (error) {
          console.error(chalk.red(`❌ エラー: ${error}`));
          errorCount++;
        }
      }
      
      console.log(chalk.gray(`  処理済み: ${Math.min(i + batchSize, references.length)}/${references.length}`));
    }
    
    // 統計情報を表示
    const stats = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[:HAS_ARTICLE]->(a:Article)
      OPTIONAL MATCH (a)-[r:REFERENCES]->()
      RETURN 
        COUNT(DISTINCT l) as lawCount,
        COUNT(DISTINCT a) as articleCount,
        COUNT(r) as referenceCount
    `);
    
    const result = stats.records[0];
    console.log(chalk.cyan('\n📈 Neo4j統計情報'));
    console.table({
      '法令数': result.get('lawCount').toNumber(),
      '条文数': result.get('articleCount').toNumber(),
      '参照関係数': result.get('referenceCount').toNumber()
    });
    
    console.log(chalk.green(`✅ 同期完了: ${successCount}件成功, ${errorCount}件エラー`));
    
  } catch (error) {
    console.error(chalk.red(`同期エラー: ${error}`));
  } finally {
    await session.close();
  }
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  const lawId = args[0];
  
  if (lawId) {
    console.log(chalk.cyan(`📚 ${lawId}の参照データを同期`));
  } else {
    console.log(chalk.cyan('📚 全法令の参照データを同期'));
  }
  
  await syncReferencesToNeo4j(lawId);
  
  await prisma.$disconnect();
  await driver.close();
}

main().catch(console.error);