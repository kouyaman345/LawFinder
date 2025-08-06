import { initNeo4jDriver, closeNeo4jDriver } from '../src/lib/neo4j';
import * as dotenv from 'dotenv';

// 環境変数を読み込む
dotenv.config();

/**
 * Neo4jクエリのテスト
 */
async function testNeo4jQueries() {
  const driver = initNeo4jDriver();
  const session = driver.session();

  try {
    console.log('🧪 Neo4jクエリのテストを開始します...\n');

    // 1. 基本的な統計情報
    console.log('📊 [1] 基本統計:');
    const stats = await session.run(`
      MATCH (l:Law) RETURN 'Laws' as type, count(l) as count
      UNION ALL
      MATCH (a:Article) RETURN 'Articles' as type, count(a) as count
      UNION ALL
      MATCH (p:Paragraph) RETURN 'Paragraphs' as type, count(p) as count
      UNION ALL
      MATCH (i:Item) RETURN 'Items' as type, count(i) as count
    `);
    
    stats.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count').toNumber()}`);
    });

    // 2. 法令の一覧
    console.log('\n📋 [2] 法令一覧:');
    const laws = await session.run(`
      MATCH (l:Law)
      RETURN l.id as id, l.title as title
      ORDER BY l.title
    `);
    
    laws.records.forEach(record => {
      console.log(`  ${record.get('title')} (${record.get('id')})`);
    });

    // 3. 参照関係の統計
    console.log('\n🔗 [3] 参照関係の統計:');
    const refStats = await session.run(`
      MATCH ()-[r]->()
      WHERE type(r) IN ['REFERS_TO', 'REFERS_TO_EXTERNAL', 'RELATIVE_REF', 'APPLIES']
      RETURN type(r) as relType, count(r) as count
      ORDER BY count DESC
    `);
    
    refStats.records.forEach(record => {
      console.log(`  ${record.get('relType')}: ${record.get('count').toNumber()}件`);
    });

    // 4. 相対参照（前条・次条）の例
    console.log('\n🔄 [4] 相対参照の例:');
    const relativeRefs = await session.run(`
      MATCH (from:Article)-[r:RELATIVE_REF]->(to:Article)
      WITH from, r, to
      LIMIT 5
      MATCH (fromLaw:Law {id: from.lawId})
      MATCH (toLaw:Law {id: to.lawId})
      RETURN 
        fromLaw.title as fromLawTitle,
        from.number as fromArticle,
        r.direction as direction,
        r.text as text,
        toLaw.title as toLawTitle,
        to.number as toArticle
    `);
    
    relativeRefs.records.forEach(record => {
      console.log(`  ${record.get('fromLawTitle')} 第${record.get('fromArticle')}条`);
      console.log(`    → "${record.get('text')}" (${record.get('direction')})`);
      console.log(`    → ${record.get('toLawTitle')} 第${record.get('toArticle')}条`);
    });

    // 5. 外部参照の例
    console.log('\n🌐 [5] 外部参照の例:');
    const externalRefs = await session.run(`
      MATCH (from:Article)-[r:REFERS_TO_EXTERNAL]->(toLaw:Law)
      WITH from, r, toLaw
      LIMIT 5
      MATCH (fromLaw:Law {id: from.lawId})
      RETURN 
        fromLaw.title as fromLawTitle,
        from.number as fromArticle,
        r.text as text,
        toLaw.title as toLawTitle,
        r.articleNumber as targetArticle
    `);
    
    externalRefs.records.forEach(record => {
      console.log(`  ${record.get('fromLawTitle')} 第${record.get('fromArticle')}条`);
      console.log(`    → "${record.get('text')}"`);
      console.log(`    → ${record.get('toLawTitle')} 第${record.get('targetArticle')}条`);
    });

    // 6. ハネ改正の検出テスト（会社法第100条を改正した場合）
    console.log('\n⚡ [6] ハネ改正検出テスト（会社法第100条を改正した場合）:');
    const impactAnalysis = await session.run(`
      MATCH (source:Article {lawId: "417AC0000000086", number: "一〇〇"})
      OPTIONAL MATCH path = (source)<-[*1..3]-(affected:Article)
      WHERE ALL(r IN relationships(path) WHERE type(r) IN ['REFERS_TO', 'RELATIVE_REF', 'APPLIES'])
      WITH affected, length(path) as distance
      WHERE affected IS NOT NULL
      WITH affected.lawId as lawId, affected.number as articleNumber, min(distance) as minDistance
      RETURN lawId, articleNumber, minDistance
      ORDER BY minDistance, lawId, articleNumber
      LIMIT 10
    `);
    
    if (impactAnalysis.records.length > 0) {
      console.log('  影響を受ける条文:');
      for (const record of impactAnalysis.records) {
        const lawResult = await session.run(`
          MATCH (l:Law {id: $lawId})
          RETURN l.title as title
        `, { lawId: record.get('lawId') });
        
        const lawTitle = lawResult.records[0]?.get('title') || '不明';
        console.log(`    距離${record.get('minDistance')}: ${lawTitle} 第${record.get('articleNumber')}条`);
      }
    } else {
      console.log('  影響を受ける条文は見つかりませんでした');
    }

    // 7. グラフの密度分析
    console.log('\n📈 [7] グラフ密度分析:');
    const density = await session.run(`
      MATCH (a:Article)
      WITH count(a) as nodeCount
      MATCH ()-[r]->()
      WHERE type(r) IN ['REFERS_TO', 'RELATIVE_REF', 'APPLIES', 'REFERS_TO_EXTERNAL']
      WITH nodeCount, count(r) as edgeCount
      RETURN 
        nodeCount,
        edgeCount,
        round(toFloat(edgeCount) / toFloat(nodeCount) * 100) / 100 as avgDegree
    `);
    
    const densityRecord = density.records[0];
    console.log(`  ノード数: ${densityRecord.get('nodeCount').toNumber()}`);
    console.log(`  エッジ数: ${densityRecord.get('edgeCount').toNumber()}`);
    console.log(`  平均次数: ${densityRecord.get('avgDegree')}`);

    console.log('\n✅ すべてのテストが完了しました！');

  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
    throw error;
  } finally {
    await session.close();
    await closeNeo4jDriver();
  }
}

// メイン処理
testNeo4jQueries().catch(console.error);