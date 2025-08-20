#!/usr/bin/env tsx

/**
 * Neo4jを使用したグラフ分析機能
 * ハネ改正の影響分析、参照ネットワーク可視化など
 */

import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class GraphAnalyzer {
  private driver: neo4j.Driver;
  
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'lawfinder123'
      )
    );
  }
  
  /**
   * ハネ改正影響分析
   * 特定の法令が改正された場合の影響範囲を分析
   */
  async analyzeAmendmentImpact(lawId: string, maxDepth: number = 3): Promise<void> {
    console.log('='.repeat(80));
    console.log(`📊 ハネ改正影響分析: ${lawId}`);
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    
    try {
      // 法令情報を取得
      const lawResult = await session.run(
        'MATCH (l:Law {lawId: $lawId}) RETURN l.title as title',
        { lawId }
      );
      
      if (lawResult.records.length === 0) {
        console.log('指定された法令が見つかりません');
        return;
      }
      
      const lawTitle = lawResult.records[0].get('title');
      console.log(`対象法令: ${lawTitle}`);
      console.log();
      
      // 各深度での影響を分析
      for (let depth = 1; depth <= maxDepth; depth++) {
        console.log(`📍 第${depth}次影響 (${depth}段階先の法令):`);
        
        const impactResult = await session.run(
          `MATCH path = (start:Law {lawId: $lawId})<-[:REFERENCES*${depth}]-(affected:Law)
           WHERE NOT (affected)-[:REFERENCES*1..${depth-1}]->(start)
           RETURN DISTINCT affected.lawId as lawId, affected.title as title, 
                  count(path) as pathCount
           ORDER BY pathCount DESC
           LIMIT 10`,
          { lawId }
        );
        
        if (impactResult.records.length === 0) {
          console.log('  影響を受ける法令なし');
        } else {
          impactResult.records.forEach((record, idx) => {
            console.log(`  ${idx + 1}. ${record.get('title')}`);
            console.log(`     法令ID: ${record.get('lawId')}`);
            console.log(`     参照パス数: ${record.get('pathCount')}`);
          });
        }
        console.log();
      }
      
      // 影響の総計
      const totalImpactResult = await session.run(
        `MATCH path = (start:Law {lawId: $lawId})<-[:REFERENCES*1..${maxDepth}]-(affected:Law)
         RETURN count(DISTINCT affected) as totalAffected,
                count(path) as totalPaths`,
        { lawId }
      );
      
      const totalStats = totalImpactResult.records[0];
      console.log('📈 影響範囲サマリー:');
      console.log(`  影響を受ける法令総数: ${totalStats.get('totalAffected')}件`);
      console.log(`  参照パス総数: ${totalStats.get('totalPaths')}本`);
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * 法令間の最短パス分析
   */
  async findShortestPath(fromLawId: string, toLawId: string): Promise<void> {
    console.log('='.repeat(80));
    console.log('🔗 法令間最短パス分析');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        `MATCH (from:Law {lawId: $fromLawId}), (to:Law {lawId: $toLawId})
         MATCH path = shortestPath((from)-[:REFERENCES*]-(to))
         RETURN path, length(path) as pathLength,
                [n IN nodes(path) | n.title] as titles`,
        { fromLawId, toLawId }
      );
      
      if (result.records.length === 0) {
        console.log('パスが見つかりません');
        return;
      }
      
      const record = result.records[0];
      const pathLength = record.get('pathLength');
      const titles = record.get('titles');
      
      console.log(`パス長: ${pathLength}`);
      console.log('経路:');
      titles.forEach((title: string, idx: number) => {
        const arrow = idx < titles.length - 1 ? ' → ' : '';
        console.log(`  ${idx + 1}. ${title}${arrow}`);
      });
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * 参照クラスター分析
   */
  async analyzeClusters(): Promise<void> {
    console.log('='.repeat(80));
    console.log('🌐 参照クラスター分析');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    
    try {
      // 強連結成分を検出（相互参照している法令群）
      console.log('📊 相互参照クラスター:');
      
      const clusterResult = await session.run(
        `MATCH (l1:Law)-[:REFERENCES]->(l2:Law)-[:REFERENCES]->(l1)
         WITH l1, collect(DISTINCT l2) as cluster
         WITH l1, cluster, size(cluster) as clusterSize
         WHERE clusterSize > 0
         RETURN l1.title as centerLaw, 
                [n IN cluster | n.title] as clusterMembers,
                clusterSize
         ORDER BY clusterSize DESC
         LIMIT 5`
      );
      
      if (clusterResult.records.length === 0) {
        console.log('  相互参照クラスターなし');
      } else {
        clusterResult.records.forEach((record, idx) => {
          console.log(`  ${idx + 1}. 中心法令: ${record.get('centerLaw')}`);
          console.log(`     クラスターサイズ: ${record.get('clusterSize')}法令`);
          const members = record.get('clusterMembers');
          if (members.length > 0) {
            console.log(`     メンバー: ${members.slice(0, 3).join(', ')}${members.length > 3 ? '...' : ''}`);
          }
        });
      }
      
      // ハブ法令の検出（多くの法令から参照される）
      console.log();
      console.log('🎯 ハブ法令（参照の中心）:');
      
      const hubResult = await session.run(
        `MATCH (hub:Law)
         OPTIONAL MATCH (hub)<-[ri:REFERENCES]-()
         OPTIONAL MATCH (hub)-[ro:REFERENCES]->()
         WITH hub, count(DISTINCT ri) as inDegree, count(DISTINCT ro) as outDegree
         WHERE inDegree > 10
         RETURN hub.title as title, hub.lawId as lawId,
                inDegree, outDegree, 
                inDegree + outDegree as totalDegree
         ORDER BY inDegree DESC
         LIMIT 10`
      );
      
      if (hubResult.records.length === 0) {
        console.log('  ハブ法令なし');
      } else {
        hubResult.records.forEach((record, idx) => {
          console.log(`  ${idx + 1}. ${record.get('title')}`);
          console.log(`     被参照数: ${record.get('inDegree')}件`);
          console.log(`     参照数: ${record.get('outDegree')}件`);
          console.log(`     合計次数: ${record.get('totalDegree')}件`);
        });
      }
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * グラフの基本統計
   */
  async showStatistics(): Promise<void> {
    console.log('='.repeat(80));
    console.log('📊 グラフ統計情報');
    console.log('='.repeat(80));
    
    const session = this.driver.session();
    
    try {
      // ノード数とエッジ数
      const basicStats = await session.run(
        `MATCH (l:Law)
         OPTIONAL MATCH (l)-[r:REFERENCES]->()
         WITH count(DISTINCT l) as nodeCount, count(r) as edgeCount
         RETURN nodeCount, edgeCount`
      );
      
      const basic = basicStats.records[0];
      console.log('基本統計:');
      console.log(`  法令ノード数: ${basic.get('nodeCount').toNumber()}件`);
      console.log(`  参照エッジ数: ${basic.get('edgeCount').toNumber()}件`);
      
      // 次数分布
      const degreeStats = await session.run(
        `MATCH (l:Law)
         OPTIONAL MATCH (l)<-[ri:REFERENCES]-()
         OPTIONAL MATCH (l)-[ro:REFERENCES]->()
         WITH l, count(DISTINCT ri) as inDegree, count(DISTINCT ro) as outDegree
         RETURN avg(inDegree) as avgIn, max(inDegree) as maxIn,
                avg(outDegree) as avgOut, max(outDegree) as maxOut`
      );
      
      const degree = degreeStats.records[0];
      console.log();
      console.log('次数分布:');
      console.log(`  平均被参照数: ${degree.get('avgIn').toFixed(1)}件`);
      console.log(`  最大被参照数: ${degree.get('maxIn').toNumber()}件`);
      console.log(`  平均参照数: ${degree.get('avgOut').toFixed(1)}件`);
      console.log(`  最大参照数: ${degree.get('maxOut').toNumber()}件`);
      
      // 連結成分
      const componentStats = await session.run(
        `CALL gds.graph.exists('law-graph')
         YIELD exists
         RETURN exists`
      ).catch(() => null);
      
      if (componentStats) {
        console.log();
        console.log('グラフ分析機能が利用可能です');
        console.log('（Neo4j Graph Data Scienceプラグインがインストールされています）');
      }
      
    } finally {
      await session.close();
    }
  }
  
  async close(): Promise<void> {
    await this.driver.close();
    await prisma.$disconnect();
  }
}

// メインメニュー
async function main() {
  const analyzer = new GraphAnalyzer();
  
  console.log('='.repeat(80));
  console.log('🔍 法令グラフ分析ツール');
  console.log('='.repeat(80));
  console.log();
  console.log('実行可能な分析:');
  console.log('1. グラフ統計情報');
  console.log('2. ハネ改正影響分析');
  console.log('3. 参照クラスター分析');
  console.log('4. 法令間最短パス分析');
  console.log();
  
  // コマンドライン引数で分析を選択
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';
  
  try {
    switch (command) {
      case 'stats':
      case '1':
        await analyzer.showStatistics();
        break;
        
      case 'impact':
      case '2':
        const lawId = args[1] || '129AC0000000089'; // デフォルトは民法
        const depth = parseInt(args[2]) || 3;
        await analyzer.analyzeAmendmentImpact(lawId, depth);
        break;
        
      case 'cluster':
      case '3':
        await analyzer.analyzeClusters();
        break;
        
      case 'path':
      case '4':
        const from = args[1] || '129AC0000000089'; // 民法
        const to = args[2] || '140AC0000000045'; // 刑法
        await analyzer.findShortestPath(from, to);
        break;
        
      default:
        console.log('使用方法:');
        console.log('  npx tsx scripts/graph-analysis.ts [command] [options]');
        console.log();
        console.log('コマンド:');
        console.log('  stats              - グラフ統計情報');
        console.log('  impact [lawId]     - ハネ改正影響分析');
        console.log('  cluster            - 参照クラスター分析');
        console.log('  path [from] [to]   - 法令間最短パス分析');
        console.log();
        console.log('例:');
        console.log('  npx tsx scripts/graph-analysis.ts stats');
        console.log('  npx tsx scripts/graph-analysis.ts impact 129AC0000000089 3');
        console.log('  npx tsx scripts/graph-analysis.ts path 129AC0000000089 140AC0000000045');
    }
  } finally {
    await analyzer.close();
  }
}

main().catch(console.error);