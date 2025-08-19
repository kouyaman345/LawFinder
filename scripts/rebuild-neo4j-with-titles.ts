#!/usr/bin/env tsx

/**
 * Neo4jを完全に再構築（タイトル付き）
 */

import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';

const prisma = new PrismaClient();

async function rebuildNeo4j() {
  console.log('='.repeat(80));
  console.log('🔧 Neo4j完全再構築（タイトル付き）');
  console.log('='.repeat(80));
  
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  
  try {
    // 1. CSVから法令タイトルを取得
    console.log('📄 CSVから法令タイトルを読み込み中...');
    const csvContent = readFileSync('/home/coffee/projects/LawFinder/laws_data/all_law_list.csv', 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });
    
    const titleMap = new Map<string, string>();
    for (const record of records) {
      const lawId = record['法令ID'] || record['法令番号'];
      const title = record['法令名'];
      if (lawId && title) {
        titleMap.set(lawId, title);
      }
    }
    
    console.log(`  ✅ ${titleMap.size}件のタイトルを取得`);
    
    // 2. PostgreSQLのタイトルも更新
    console.log('\n📝 PostgreSQLの法令タイトルを更新中...');
    const laws = await prisma.lawMaster.findMany();
    let pgUpdated = 0;
    
    for (const law of laws) {
      const title = titleMap.get(law.id);
      if (title && title !== law.title) {
        await prisma.lawMaster.update({
          where: { id: law.id },
          data: { title }
        });
        pgUpdated++;
      }
    }
    
    console.log(`  ✅ ${pgUpdated}件更新`);
    
    // 3. Neo4jを再構築
    console.log('\n🗑️ Neo4j既存データをクリア...');
    await session.run('MATCH (n) DETACH DELETE n');
    
    console.log('\n📊 法令ノードを作成中...');
    const updatedLaws = await prisma.lawMaster.findMany();
    let nodeCount = 0;
    const nodeBatch = [];
    
    for (const law of updatedLaws) {
      nodeBatch.push({
        id: law.id,
        title: law.title || titleMap.get(law.id) || law.id,
        lawNumber: law.lawNumber || law.id
      });
      
      if (nodeBatch.length >= 100) {
        await session.run(`
          UNWIND $laws as law
          CREATE (n:Law {
            id: law.id,
            title: law.title,
            lawNumber: law.lawNumber
          })
        `, { laws: nodeBatch });
        
        nodeCount += nodeBatch.length;
        nodeBatch.length = 0;
        
        if (nodeCount % 1000 === 0) {
          console.log(`  [${nodeCount}/${updatedLaws.length}] ノード作成中...`);
        }
      }
    }
    
    // 残りを処理
    if (nodeBatch.length > 0) {
      await session.run(`
        UNWIND $laws as law
        CREATE (n:Law {
          id: law.id,
          title: law.title,
          lawNumber: law.lawNumber
        })
      `, { laws: nodeBatch });
      nodeCount += nodeBatch.length;
    }
    
    console.log(`  ✅ ${nodeCount}件のノード作成完了`);
    
    // 4. 参照関係を追加
    console.log('\n🔗 参照関係を追加中...');
    const references = await prisma.reference.findMany();
    let refCount = 0;
    const refBatch = [];
    
    for (const ref of references) {
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
      
      if (refBatch.length >= 500) {
        await session.run(`
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
        `, { refs: refBatch });
        
        refCount += refBatch.length;
        refBatch.length = 0;
        
        if (refCount % 2000 === 0) {
          console.log(`  [${refCount}/${references.length}] 参照関係作成中...`);
        }
      }
    }
    
    // 残りを処理
    if (refBatch.length > 0) {
      await session.run(`
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
      `, { refs: refBatch });
      refCount += refBatch.length;
    }
    
    console.log(`  ✅ ${refCount}件の参照関係作成完了`);
    
    // 5. 結果確認
    console.log('\n📊 結果確認...');
    
    const nodeStats = await session.run(`
      MATCH (n:Law)
      WHERE n.title IS NOT NULL AND n.title <> ''
      RETURN COUNT(n) as count
    `);
    
    const refStats = await session.run(`
      MATCH ()-[r:REFERENCES]->()
      RETURN COUNT(r) as count
    `);
    
    const externalStats = await session.run(`
      MATCH (a:Law)-[r:REFERENCES {isExternal: true}]->(b:Law)
      WHERE a.id <> b.id
      RETURN COUNT(r) as count
    `);
    
    console.log(`  • タイトル付きノード: ${nodeStats.records[0].get('count').toNumber()}件`);
    console.log(`  • 総参照関係: ${refStats.records[0].get('count').toNumber()}件`);
    console.log(`  • 外部参照: ${externalStats.records[0].get('count').toNumber()}件`);
    
    // サンプル表示
    const samples = await session.run(`
      MATCH (n:Law)
      WHERE n.title IS NOT NULL AND n.title <> ''
      RETURN n.id as id, n.title as title
      LIMIT 5
    `);
    
    console.log('\n📝 サンプル（タイトル付き）:');
    samples.records.forEach(r => {
      console.log(`  ${r.get('id')}: ${r.get('title')}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Neo4j再構築完了！');
    console.log('\n🌐 Neo4j Browser: http://localhost:7474');
    console.log('   認証: neo4j / lawfinder123');
    console.log('\n📊 推奨クエリ:');
    console.log('   MATCH (a:Law)-[r:REFERENCES {isExternal: true}]->(b:Law)');
    console.log('   WHERE a.id <> b.id');
    console.log('   RETURN a, r, b LIMIT 100');
    console.log('\n💡 ノードをクリック後、Captionを「title」に変更すると法令名が表示されます');
    console.log('='.repeat(80));
    
  } finally {
    await session.close();
    await driver.close();
    await prisma.$disconnect();
  }
}

// メイン処理
rebuildNeo4j().catch(console.error);