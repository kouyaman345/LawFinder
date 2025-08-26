#!/usr/bin/env npx tsx

import { initNeo4jDriver } from '../src/lib/neo4j';
import chalk from 'chalk';

async function testNeo4j() {
  console.log(chalk.blue('Neo4j接続テスト開始'));
  
  const driver = initNeo4jDriver();
  const session = driver.session();
  
  try {
    // 簡単なクエリを実行
    const result = await session.run('RETURN 1 as test');
    console.log(chalk.green('✓ 接続成功'));
    console.log('結果:', result.records[0].get('test'));
    
    // ノード数を確認
    const nodeCount = await session.run('MATCH (n) RETURN count(n) as count');
    console.log(`ノード数: ${nodeCount.records[0].get('count')}`);
    
  } catch (error) {
    console.error(chalk.red('✗ 接続失敗'));
    console.error(error);
  } finally {
    await session.close();
    await driver.close();
  }
}

testNeo4j();