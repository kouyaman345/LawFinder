import { initNeo4jDriver, closeNeo4jDriver } from '../src/lib/neo4j';

/**
 * Neo4jの初期セットアップとスキーマ作成
 */
async function setupNeo4j() {
  const driver = initNeo4jDriver();
  const session = driver.session();

  try {
    console.log('Neo4j初期セットアップを開始します...\n');

    // 既存データをクリア（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log('既存データをクリアしています...');
      await session.run('MATCH (n) DETACH DELETE n');
    }

    // 制約の作成（制約はインデックスも自動的に作成する）
    console.log('制約を作成しています...');
    
    try {
      // 法令IDのユニーク制約
      await session.run(`
        CREATE CONSTRAINT law_id_unique IF NOT EXISTS
        FOR (l:Law) REQUIRE l.id IS UNIQUE
      `);
    } catch (e) {
      console.log('Law ID制約は既に存在します');
    }

    try {
      // 条文IDのユニーク制約
      await session.run(`
        CREATE CONSTRAINT article_id_unique IF NOT EXISTS
        FOR (a:Article) REQUIRE a.id IS UNIQUE
      `);
    } catch (e) {
      console.log('Article ID制約は既に存在します');
    }

    // 追加のインデックス作成
    console.log('追加インデックスを作成しています...');
    
    try {
      await session.run(`
        CREATE INDEX law_title IF NOT EXISTS
        FOR (l:Law) ON (l.title)
      `);
    } catch (e) {
      console.log('Law titleインデックスは既に存在します');
    }

    try {
      await session.run(`
        CREATE INDEX article_law_number IF NOT EXISTS
        FOR (a:Article) ON (a.lawId, a.number)
      `);
    } catch (e) {
      console.log('Article law_numberインデックスは既に存在します');
    }

    // サンプルデータの作成（テスト用）
    console.log('\nサンプルデータを作成しています...');
    
    // 民法サンプル
    await session.run(`
      CREATE (l:Law {
        id: '129AC0000000089',
        title: '民法',
        lawNumber: '明治二十九年法律第八十九号',
        effectiveDate: datetime('1896-07-16')
      })
    `);

    // 条文サンプル
    await session.run(`
      MATCH (l:Law {id: '129AC0000000089'})
      CREATE (a1:Article {
        id: '129AC0000000089_1',
        lawId: '129AC0000000089',
        number: '一',
        content: '私権は、公共の福祉に適合しなければならない。'
      })
      CREATE (a709:Article {
        id: '129AC0000000089_709',
        lawId: '129AC0000000089',
        number: '七百九',
        content: '故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、これによって生じた損害を賠償する責任を負う。'
      })
      CREATE (l)-[:HAS_ARTICLE]->(a1)
      CREATE (l)-[:HAS_ARTICLE]->(a709)
    `);

    console.log('\n✅ Neo4jのセットアップが完了しました！');

    // 統計情報を表示
    const lawResult = await session.run(`
      MATCH (l:Law) RETURN count(l) as count
    `);
    const articleResult = await session.run(`
      MATCH (a:Article) RETURN count(a) as count
    `);
    
    console.log('\n📊 初期データ統計:');
    console.log(`  Laws: ${lawResult.records[0].get('count').toNumber()}`);
    console.log(`  Articles: ${articleResult.records[0].get('count').toNumber()}`);

  } catch (error) {
    console.error('セットアップ中にエラーが発生しました:', error);
    throw error;
  } finally {
    await session.close();
    await closeNeo4jDriver();
  }
}

// メイン処理
setupNeo4j().catch(console.error);