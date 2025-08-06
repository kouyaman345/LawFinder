#!/usr/bin/env npx tsx
/**
 * ハネ改正影響分析のテストスクリプト
 * Neo4jを直接使用して影響分析を実行
 */

import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';

dotenv.config();

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'lawfinder123'
  )
);

async function analyzeImpact(lawId: string, articleNumber: string, depth: number = 3) {
  console.log(`\n🔍 ${lawId} 第${articleNumber}条の改正影響分析（深度: ${depth}）\n`);
  
  const session = driver.session();
  
  try {
    // まず条文が存在するか確認
    const checkResult = await session.run(
      `MATCH (a:Article {lawId: $lawId, number: $articleNumber})
       RETURN a.id as id, a.title as title`,
      { lawId, articleNumber }
    );
    
    if (checkResult.records.length === 0) {
      console.log(`❌ 条文が見つかりません: ${lawId} 第${articleNumber}条`);
      return;
    }
    
    const articleId = checkResult.records[0].get('id');
    const articleTitle = checkResult.records[0].get('title');
    console.log(`📖 対象条文: ${articleTitle || `第${articleNumber}条`}`);
    console.log(`   ID: ${articleId}\n`);
    
    // ハネ改正影響分析
    const result = await session.run(
      `
      MATCH path = (source:Article {lawId: $lawId, number: $articleNumber})
        <-[:REFERS_TO|REFERS_TO_LAW|RELATIVE_REF*1..${depth}]-(affected:Article)
      WITH affected, path, length(path) as distance
      RETURN DISTINCT 
        affected.lawId as lawId,
        affected.number as articleNumber,
        affected.title as articleTitle,
        min(distance) as impactLevel,
        count(distinct path) as pathCount
      ORDER BY impactLevel, pathCount DESC
      LIMIT 20
      `,
      { lawId, articleNumber }
    );
    
    if (result.records.length === 0) {
      console.log('この条文を参照している条文は見つかりませんでした。');
      return;
    }
    
    console.log('='.repeat(60));
    console.log('影響を受ける条文（影響度順）');
    console.log('='.repeat(60));
    
    const impacts = result.records.map(record => ({
      lawId: record.get('lawId'),
      articleNumber: record.get('articleNumber'),
      articleTitle: record.get('articleTitle'),
      impactLevel: record.get('impactLevel').toNumber(),
      pathCount: record.get('pathCount').toNumber(),
    }));
    
    // 影響度でグループ化
    const highImpact = impacts.filter(i => i.impactLevel === 1);
    const mediumImpact = impacts.filter(i => i.impactLevel === 2);
    const lowImpact = impacts.filter(i => i.impactLevel >= 3);
    
    if (highImpact.length > 0) {
      console.log('\n🔴 直接影響（距離1）:');
      highImpact.forEach(i => {
        console.log(`  - ${i.lawId} 第${i.articleNumber}条${i.articleTitle ? ` (${i.articleTitle})` : ''}`);
        console.log(`    参照パス数: ${i.pathCount}`);
      });
    }
    
    if (mediumImpact.length > 0) {
      console.log('\n🟡 間接影響（距離2）:');
      mediumImpact.forEach(i => {
        console.log(`  - ${i.lawId} 第${i.articleNumber}条${i.articleTitle ? ` (${i.articleTitle})` : ''}`);
        console.log(`    参照パス数: ${i.pathCount}`);
      });
    }
    
    if (lowImpact.length > 0) {
      console.log('\n🟢 波及影響（距離3以上）:');
      lowImpact.forEach(i => {
        console.log(`  - ${i.lawId} 第${i.articleNumber}条${i.articleTitle ? ` (${i.articleTitle})` : ''}`);
        console.log(`    影響度: ${i.impactLevel}, 参照パス数: ${i.pathCount}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('サマリー');
    console.log('='.repeat(60));
    console.log(`総影響条文数: ${impacts.length}`);
    console.log(`  直接影響: ${highImpact.length}条`);
    console.log(`  間接影響: ${mediumImpact.length}条`);
    console.log(`  波及影響: ${lowImpact.length}条`);
    
    // 法令別の影響
    const lawImpacts = new Map<string, number>();
    impacts.forEach(i => {
      lawImpacts.set(i.lawId, (lawImpacts.get(i.lawId) || 0) + 1);
    });
    
    console.log('\n影響を受ける法令:');
    Array.from(lawImpacts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([lawId, count]) => {
        console.log(`  - ${lawId}: ${count}条`);
      });
    
  } finally {
    await session.close();
  }
}

// 実行
async function main() {
  console.log('🚀 ハネ改正影響分析テスト\n');
  
  // テストケース1: 民法709条（不法行為）
  await analyzeImpact('129AC0000000089', '709', 3);
  
  // テストケース2: 会社法100条
  await analyzeImpact('417AC0000000086', '100', 2);
  
  // テストケース3: 刑法199条（殺人）
  await analyzeImpact('140AC0000000045', '199', 2);
  
  await driver.close();
  console.log('\n✅ テスト完了');
}

main().catch(console.error);