#!/usr/bin/env tsx

import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'lawfinder123')
);

async function getOverviewStats() {
  const session = driver.session();
  try {
    console.log('🗺️ Neo4j グラフ全体構造の可視化ガイド');
    console.log('=' .repeat(70));
    
    // 主要ハブ法令を特定
    const hubs = await session.run(`
      MATCH (target:Law)<-[r:REFERENCES]-(source:Law)
      WHERE source.id <> target.id
      RETURN target.id as id, target.title as title, COUNT(r) as inDegree
      ORDER BY inDegree DESC
      LIMIT 5
    `);
    
    console.log('\n📍 主要ハブ法令（最も参照される法令）:');
    const hubIds: string[] = [];
    hubs.records.forEach((r, i) => {
      hubIds.push(r.get('id'));
      console.log(`  ${i+1}. ${r.get('title')} (${r.get('inDegree').toNumber()}件の参照)`);
    });
    
    // 密度の高い領域を検出
    const density = await session.run(`
      MATCH (a:Law)-[r:REFERENCES]-(b:Law)
      WHERE a.id < b.id
      WITH a, b, COUNT(r) as connections
      WHERE connections > 2
      RETURN COUNT(*) as densePairs
    `);
    
    console.log(`\n🔗 密な参照関係: ${density.records[0].get('densePairs').toNumber()}組`);
    
    // グラフの連結性
    const components = await session.run(`
      MATCH (n:Law)
      WHERE NOT (n)-[:REFERENCES]-() AND NOT ()-[:REFERENCES]-(n)
      RETURN COUNT(n) as isolated
    `);
    
    const isolated = components.records[0].get('isolated').toNumber();
    const connected = 8910 - isolated;
    
    console.log(`\n📊 グラフ連結性:`);
    console.log(`  • 連結法令: ${connected}件 (${(connected/8910*100).toFixed(1)}%)`);
    console.log(`  • 孤立法令: ${isolated}件 (${(isolated/8910*100).toFixed(1)}%)`);
    
    // 最大の連結成分を分析
    const largestComponent = await session.run(`
      MATCH (a:Law)-[:REFERENCES*]-(b:Law)
      WITH DISTINCT a
      RETURN COUNT(a) as componentSize
      LIMIT 1
    `);
    
    if (largestComponent.records.length > 0) {
      const size = largestComponent.records[0].get('componentSize').toNumber();
      console.log(`  • 最大連結成分: ${size}法令`);
    }
    
    console.log('\n' + '=' .repeat(70));
    console.log('\n🎯 推奨可視化手順:\n');
    console.log('1️⃣ Neo4j Browserを開く: http://localhost:7474');
    console.log('   ログイン: neo4j / lawfinder123\n');
    
    console.log('2️⃣ 全体構造を段階的に探索:');
    console.log('   a) まず主要5法令の関係を表示（軽量）:');
    const hubQuery = `MATCH (s:Law)-[r:REFERENCES]->(t:Law)
      WHERE s.id IN [${hubIds.map(id => `'${id}'`).join(', ')}]
      RETURN s, r, t LIMIT 100`;
    console.log(`      ${hubQuery}\n`);
    
    console.log('   b) 次に密な領域を可視化:');
    console.log(`      MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(a)`);
    console.log(`      RETURN a, b, r1, r2 LIMIT 50\n`);
    
    console.log('   c) 全体サンプル（重い場合は件数を調整）:');
    console.log(`      MATCH (s:Law)-[r:REFERENCES]->(t:Law)`);
    console.log(`      WHERE rand() < 0.05`);
    console.log(`      RETURN s, r, t LIMIT 500\n`);
    
    console.log('3️⃣ 可視化設定の調整:');
    console.log('   • 右下の設定アイコンをクリック');
    console.log('   • 「Initial Node Display」を100に設定');
    console.log('   • 「Max Neighbors」を50に設定');
    console.log('   • ノードをダブルクリックで展開');
    console.log('   • Shiftキーを押しながらドラッグで複数選択\n');
    
    console.log('4️⃣ レイアウトの最適化:');
    console.log('   • 画面下部のレイアウトボタンで配置を調整');
    console.log('   • Force Layoutで自動配置');
    console.log('   • Hierarchical Layoutで階層表示\n');
    
    console.log('📝 詳細なクエリ集:');
    console.log('   • neo4j-queries.cypher - 基本クエリ集');
    console.log('   • neo4j-visualization-queries.cypher - 可視化特化クエリ');
    
  } finally {
    await session.close();
    await driver.close();
  }
}

getOverviewStats().catch(console.error);