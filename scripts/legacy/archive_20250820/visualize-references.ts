#!/usr/bin/env npx tsx

/**
 * 参照関係の可視化と分析
 */

import neo4j from 'neo4j-driver';
import chalk from 'chalk';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'lawfinder123')
);

async function visualizeReferences() {
  const session = driver.session();
  
  try {
    console.log(chalk.cyan('=' .repeat(80)));
    console.log(chalk.cyan.bold('📊 法令参照ネットワーク可視化レポート'));
    console.log(chalk.cyan('=' .repeat(80)));
    
    // 1. 基本統計
    console.log(chalk.yellow('\n📈 基本統計:'));
    
    const stats = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[r:REFERENCES]->()
      WITH l, count(r) as refCount
      RETURN 
        count(DISTINCT l) as totalLaws,
        sum(refCount) as totalReferences,
        avg(refCount) as avgReferencesPerLaw
    `);
    
    const stat = stats.records[0];
    console.log(`  法令数: ${stat.get('totalLaws')}`);
    console.log(`  参照関係数: ${stat.get('totalReferences')}`);
    console.log(`  平均参照数/法令: ${stat.get('avgReferencesPerLaw')?.toFixed(2) || 0}`);
    
    // 2. 最も参照される法令TOP10
    console.log(chalk.yellow('\n🔝 最も参照される法令 TOP10:'));
    
    const mostReferenced = await session.run(`
      MATCH (l:Law)<-[:REFERENCES]-(other)
      RETURN l.title as law, l.id as id, count(other) as referenceCount
      ORDER BY referenceCount DESC
      LIMIT 10
    `);
    
    mostReferenced.records.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.get('law')} (${record.get('id')})`);
      console.log(`     被参照数: ${record.get('referenceCount')}`);
    });
    
    // 3. 最も多く参照する法令TOP10
    console.log(chalk.yellow('\n📤 最も多く参照する法令 TOP10:'));
    
    const mostReferencing = await session.run(`
      MATCH (l:Law)-[:REFERENCES]->(other)
      RETURN l.title as law, l.id as id, count(other) as referenceCount
      ORDER BY referenceCount DESC
      LIMIT 10
    `);
    
    mostReferencing.records.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.get('law')} (${record.get('id')})`);
      console.log(`     参照数: ${record.get('referenceCount')}`);
    });
    
    // 4. 参照タイプ別統計
    console.log(chalk.yellow('\n📊 参照タイプ別統計:'));
    
    const typeStats = await session.run(`
      MATCH ()-[r:REFERENCES]->()
      RETURN r.type as type, count(r) as count
      ORDER BY count DESC
    `);
    
    typeStats.records.forEach((record) => {
      const type = record.get('type') || 'unknown';
      const count = Number(record.get('count'));
      const bar = '█'.repeat(Math.floor(count / 100));
      console.log(`  ${type.padEnd(15)} ${count.toString().padStart(6)} ${chalk.green(bar)}`);
    });
    
    // 5. 相互参照の検出
    console.log(chalk.yellow('\n🔄 相互参照（双方向参照）:'));
    
    const mutual = await session.run(`
      MATCH (a:Law)-[:REFERENCES]->(b:Law)
      WHERE (b)-[:REFERENCES]->(a) AND id(a) < id(b)
      RETURN a.title as law1, b.title as law2
      LIMIT 10
    `);
    
    if (mutual.records.length > 0) {
      mutual.records.forEach((record) => {
        console.log(`  ${record.get('law1')} ⟷ ${record.get('law2')}`);
      });
    } else {
      console.log('  相互参照は見つかりませんでした');
    }
    
    // 6. 参照ネットワークの深さ
    console.log(chalk.yellow('\n🌳 参照チェーンの深さ分析:'));
    
    const depthAnalysis = await session.run(`
      MATCH path = (start:Law)-[:REFERENCES*1..3]->(end:Law)
      WHERE start.id = '129AC0000000089' // 民法を起点
      RETURN length(path) as depth, count(*) as pathCount
      ORDER BY depth
    `);
    
    depthAnalysis.records.forEach((record) => {
      const depth = record.get('depth');
      const count = record.get('pathCount');
      console.log(`  深さ${depth}: ${count}パス`);
    });
    
    // 7. 孤立した法令
    console.log(chalk.yellow('\n🏝️ 孤立した法令（参照なし）:'));
    
    const isolated = await session.run(`
      MATCH (l:Law)
      WHERE NOT (l)-[:REFERENCES]-() AND NOT ()-[:REFERENCES]-(l)
      RETURN count(l) as isolatedCount
    `);
    
    console.log(`  孤立法令数: ${isolated.records[0].get('isolatedCount')}`);
    
    // 8. 可視化用サンプルグラフデータ
    console.log(chalk.yellow('\n🎨 可視化用サンプルデータ（民法を中心とした参照ネットワーク）:'));
    
    const graphData = await session.run(`
      MATCH (center:Law {id: '129AC0000000089'})
      OPTIONAL MATCH (center)-[:REFERENCES]->(target:Law)
      OPTIONAL MATCH (source:Law)-[:REFERENCES]->(center)
      RETURN 
        center.title as centerLaw,
        collect(DISTINCT target.title) as referencesTo,
        collect(DISTINCT source.title) as referencedBy
      LIMIT 1
    `);
    
    if (graphData.records.length > 0) {
      const record = graphData.records[0];
      console.log(`\n  中心: ${record.get('centerLaw')}`);
      console.log(`  → 参照先 (${record.get('referencesTo').length}件):`);
      record.get('referencesTo').slice(0, 5).forEach(law => {
        console.log(`    - ${law}`);
      });
      console.log(`  ← 被参照元 (${record.get('referencedBy').length}件):`);
      record.get('referencedBy').slice(0, 5).forEach(law => {
        console.log(`    - ${law}`);
      });
    }
    
    console.log(chalk.cyan('\n' + '=' .repeat(80)));
    
  } finally {
    await session.close();
  }
}

async function generateD3Visualization() {
  const session = driver.session();
  
  try {
    // D3.js用のJSONデータを生成
    const result = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[r:REFERENCES]->(target:Law)
      WITH l, collect({target: target.id, type: r.type}) as refs
      RETURN l.id as id, l.title as title, refs
      LIMIT 100
    `);
    
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    result.records.forEach(record => {
      const id = record.get('id');
      const title = record.get('title');
      
      if (!nodeMap.has(id)) {
        nodes.push({ id, title, group: 1 });
        nodeMap.set(id, true);
      }
      
      const refs = record.get('refs');
      refs.forEach(ref => {
        if (ref.target) {
          links.push({
            source: id,
            target: ref.target,
            type: ref.type || 'unknown'
          });
        }
      });
    });
    
    const graphData = { nodes, links };
    
    // HTMLファイルを生成
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>法令参照ネットワーク可視化</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        h1 { color: #333; }
        #graph { border: 1px solid #ccc; }
        .node { stroke: #fff; stroke-width: 1.5px; cursor: pointer; }
        .link { stroke: #999; stroke-opacity: 0.6; }
        .label { font-size: 10px; }
        #info { position: absolute; top: 20px; right: 20px; width: 300px; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; }
    </style>
</head>
<body>
    <h1>法令参照ネットワーク可視化</h1>
    <div id="info">
        <h3>統計情報</h3>
        <p>ノード数: ${nodes.length}</p>
        <p>リンク数: ${links.length}</p>
        <p>クリックで法令詳細を表示</p>
    </div>
    <svg id="graph" width="1200" height="800"></svg>
    
    <script>
        const data = ${JSON.stringify(graphData)};
        
        const svg = d3.select("#graph");
        const width = +svg.attr("width");
        const height = +svg.attr("height");
        
        const simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));
        
        const link = svg.append("g")
            .selectAll("line")
            .data(data.links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", 1);
        
        const node = svg.append("g")
            .selectAll("circle")
            .data(data.nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", 5)
            .attr("fill", d => d3.schemeCategory10[d.group % 10])
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));
        
        node.append("title")
            .text(d => d.title);
        
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    </script>
</body>
</html>
    `;
    
    const fs = require('fs');
    fs.writeFileSync('Report/reference_network_visualization.html', html);
    console.log(chalk.green('\n✅ 可視化HTMLファイルを生成しました: Report/reference_network_visualization.html'));
    
  } finally {
    await session.close();
  }
}

// メイン実行
async function main() {
  try {
    await visualizeReferences();
    await generateD3Visualization();
  } finally {
    await driver.close();
  }
}

main().catch(console.error);