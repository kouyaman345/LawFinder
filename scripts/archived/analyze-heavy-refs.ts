#!/usr/bin/env npx tsx

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

async function analyzeHeavyReferences() {
  const driver = initNeo4jDriver();
  const session = driver.session();
  
  try {
    const lawId = '325AC0000000226'; // 地方税法
    console.log(chalk.cyan(`🔍 法令ID ${lawId} の参照分析\n`));
    
    // この法令への参照を詳細分析
    const result = await session.run(`
      MATCH (source)-[r:REFERENCES]->(target:Law {lawId: $lawId})
      WITH source, COUNT(r) as refCount
      RETURN 
        labels(source)[0] as sourceType,
        source.lawId as sourceLaw,
        refCount
      ORDER BY refCount DESC
      LIMIT 20
    `, { lawId });
    
    console.log(chalk.blue('📊 この法令を参照しているソースTOP20:'));
    let totalFromSameLaw = 0;
    
    result.records.forEach(record => {
      const sourceType = record.get('sourceType');
      const sourceLaw = record.get('sourceLaw');
      const count = record.get('refCount').toNumber();
      
      if (sourceLaw === lawId) {
        totalFromSameLaw += count;
      }
      
      if (sourceLaw) {
        console.log(`  [${sourceType}] ${sourceLaw}: ${count}件 ${sourceLaw === lawId ? '⚠️ (同一法令)' : ''}`);
      } else {
        console.log(`  [${sourceType}] (条文からの参照): ${count}件`);
      }
    });
    
    // 自己参照をチェック
    const selfRefResult = await session.run(`
      MATCH (l:Law {lawId: $lawId})-[r:REFERENCES]->(l)
      RETURN COUNT(r) as selfRefCount
    `, { lawId });
    
    const selfRefCount = selfRefResult.records[0].get('selfRefCount').toNumber();
    console.log(chalk.yellow(`\n🔄 法令ノードの自己参照: ${selfRefCount}件`));
    
    // 同一法令からの全参照をカウント
    const sameLawResult = await session.run(`
      MATCH (source)-[r:REFERENCES]->(target:Law {lawId: $lawId})
      WHERE source.lawId = $lawId
      RETURN COUNT(r) as count
    `, { lawId });
    
    const sameLawRefs = sameLawResult.records[0].get('count').toNumber();
    console.log(chalk.yellow(`📍 同一法令からの全参照: ${sameLawRefs}件`));
    
    // 参照タイプ別の内訳
    const typeResult = await session.run(`
      MATCH ()-[r:REFERENCES]->(target:Law {lawId: $lawId})
      RETURN r.type as refType, COUNT(r) as count
      ORDER BY count DESC
    `, { lawId });
    
    console.log(chalk.blue('\n📈 参照タイプ別内訳:'));
    typeResult.records.forEach(record => {
      const type = record.get('refType');
      const count = record.get('count').toNumber();
      console.log(`  ${type || 'undefined'}: ${count}件`);
    });
    
    // 重複参照をチェック
    const dupResult = await session.run(`
      MATCH (source)-[r:REFERENCES]->(target:Law {lawId: $lawId})
      WITH source, target, r.text as text, COUNT(*) as dupCount
      WHERE dupCount > 1
      RETURN source.lawId as sourceLaw, text, dupCount
      ORDER BY dupCount DESC
      LIMIT 10
    `, { lawId });
    
    console.log(chalk.red('\n⚠️ 重複参照（同じテキストで複数回参照）:'));
    if (dupResult.records.length > 0) {
      dupResult.records.forEach(record => {
        const sourceLaw = record.get('sourceLaw');
        const text = record.get('text');
        const count = record.get('dupCount').toNumber();
        console.log(`  ${sourceLaw}: "${text?.substring(0, 30)}..." が${count}回`);
      });
    } else {
      console.log('  重複なし');
    }
    
    // 全体の統計
    const totalResult = await session.run(`
      MATCH ()-[r:REFERENCES]->(target:Law {lawId: $lawId})
      RETURN COUNT(r) as total
    `, { lawId });
    
    const total = totalResult.records[0].get('total').toNumber();
    
    // 外部からの参照を計算
    const externalRefs = total - sameLawRefs;
    
    console.log(chalk.green('\n📊 統計サマリー:'));
    console.log(`  総参照数: ${total}件`);
    console.log(`  同一法令からの参照: ${sameLawRefs}件 (${Math.round(sameLawRefs/total*100)}%)`);
    console.log(`  外部法令からの参照: ${externalRefs}件 (${Math.round(externalRefs/total*100)}%)`);
    
    if (sameLawRefs > total * 0.8) {
      console.log(chalk.red('\n⚠️ 警告: 参照の80%以上が同一法令からです。内部参照が過度に計上されている可能性があります。'));
    }
    
    // サンプルで実際の参照テキストを確認
    const sampleResult = await session.run(`
      MATCH (source {lawId: $lawId})-[r:REFERENCES]->(target:Law {lawId: $lawId})
      RETURN r.text as text, r.type as type
      LIMIT 10
    `, { lawId });
    
    if (sampleResult.records.length > 0) {
      console.log(chalk.gray('\n📝 同一法令内の参照サンプル:'));
      sampleResult.records.forEach((record, i) => {
        const text = record.get('text');
        const type = record.get('type');
        console.log(`  ${i+1}. [${type}] "${text?.substring(0, 50)}..."`);
      });
    }
    
  } finally {
    await session.close();
    await driver.close();
  }
}

analyzeHeavyReferences().catch(console.error);