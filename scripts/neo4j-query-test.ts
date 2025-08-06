#!/usr/bin/env npx tsx
/**
 * Neo4j参照関係グラフのクエリテスト
 * 改善されたグラフ構造の検証
 */

import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';

dotenv.config();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

class Neo4jQueryTester {
  private driver: any;

  constructor() {
    this.driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
    );
  }

  /**
   * 基本統計の取得
   */
  async getBasicStats(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log('\n📊 Neo4j グラフ統計\n');
      
      // 法令数
      const lawResult = await session.run('MATCH (l:Law) RETURN count(l) as count');
      console.log(`法令ノード数: ${lawResult.records[0].get('count')}`);
      
      // 条文数
      const articleResult = await session.run('MATCH (a:Article) RETURN count(a) as count');
      console.log(`条文ノード数: ${articleResult.records[0].get('count')}`);
      
      // 参照関係数（タイプ別）
      const refTypes = [
        { name: '内部参照', query: 'MATCH ()-[r:REFERS_TO]->() RETURN count(r) as count' },
        { name: '外部参照', query: 'MATCH ()-[r:REFERS_TO_LAW]->() RETURN count(r) as count' },
        { name: '相対参照', query: 'MATCH ()-[r:RELATIVE_REF]->() RETURN count(r) as count' },
        { name: '構造参照', query: 'MATCH ()-[r:REFERS_TO_STRUCTURE]->() RETURN count(r) as count' }
      ];
      
      console.log('\n参照関係タイプ別:');
      for (const refType of refTypes) {
        const result = await session.run(refType.query);
        console.log(`  ${refType.name}: ${result.records[0].get('count')}件`);
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 最も参照されている条文トップ10
   */
  async getMostReferencedArticles(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log('\n🎯 最も参照されている条文トップ10\n');
      
      const result = await session.run(`
        MATCH (a:Article)<-[r]-()
        WITH a, count(r) as refCount
        ORDER BY refCount DESC
        LIMIT 10
        RETURN a.id as id, a.number as number, refCount
      `);
      
      result.records.forEach((record, index) => {
        console.log(`${index + 1}. ${record.get('id')} (第${record.get('number')}条): ${record.get('refCount')}回`);
      });
      
    } finally {
      await session.close();
    }
  }

  /**
   * ハネ改正の影響分析例
   */
  async analyzeImpact(articleId: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log(`\n🔍 ${articleId} を改正した場合の影響範囲（3段階まで）\n`);
      
      const result = await session.run(`
        MATCH path = (source:Article {id: $articleId})<-[*1..3]-(affected:Article)
        WITH affected, min(length(path)) as distance
        RETURN DISTINCT affected.id as id, affected.number as number, distance
        ORDER BY distance, affected.id
        LIMIT 20
      `, { articleId });
      
      let currentDistance = 0;
      result.records.forEach(record => {
        const distance = record.get('distance').toNumber();
        if (distance !== currentDistance) {
          currentDistance = distance;
          console.log(`\n距離 ${distance}:`);
        }
        console.log(`  - ${record.get('id')} (第${record.get('number')}条)`);
      });
      
    } finally {
      await session.close();
    }
  }

  /**
   * 準用関係の探索
   */
  async findApplicationRelations(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log('\n📚 準用・適用関係のサンプル\n');
      
      const result = await session.run(`
        MATCH (a:Article)-[r:REFERS_TO|REFERS_TO_LAW]->(b)
        WHERE r.text CONTAINS '準用' OR r.text CONTAINS '適用'
        RETURN a.id as sourceId, r.text as text, b.id as targetId
        LIMIT 10
      `);
      
      result.records.forEach(record => {
        console.log(`${record.get('sourceId')} → ${record.get('targetId')}`);
        console.log(`  "${record.get('text')}"\n`);
      });
      
    } finally {
      await session.close();
    }
  }

  async cleanup(): Promise<void> {
    await this.driver.close();
  }
}

// メイン実行
async function main() {
  const tester = new Neo4jQueryTester();
  
  try {
    await tester.getBasicStats();
    await tester.getMostReferencedArticles();
    await tester.analyzeImpact('129AC0000000089_709'); // 民法709条の影響分析
    await tester.findApplicationRelations();
  } finally {
    await tester.cleanup();
  }
}

main()
  .then(() => {
    console.log('\n✅ Neo4jクエリテスト完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });