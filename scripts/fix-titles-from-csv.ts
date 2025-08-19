#!/usr/bin/env tsx

/**
 * CSVファイルから法令タイトルを修正
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

async function fixTitlesFromCSV() {
  console.log('='.repeat(80));
  console.log('🔧 CSVから法令タイトルを修正');
  console.log('='.repeat(80));
  
  try {
    // CSVファイルを読み込み
    const csvContent = readFileSync('/home/coffee/projects/LawFinder/laws_data/all_law_list.csv', 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    console.log(`CSVレコード数: ${records.length}`);
    
    // 法令IDとタイトルのマップを作成
    const titleMap = new Map<string, string>();
    
    for (const record of records) {
      const lawId = record['法令番号'] || record['law_id'] || record['law_number'];
      const title = record['法令名'] || record['title'] || record['law_title'];
      
      if (lawId && title) {
        titleMap.set(lawId, title);
      }
    }
    
    console.log(`タイトルマップ: ${titleMap.size}件`);
    
    // PostgreSQLの法令を更新
    let updated = 0;
    const laws = await prisma.lawMaster.findMany();
    
    for (const law of laws) {
      const title = titleMap.get(law.id);
      if (title) {
        await prisma.lawMaster.update({
          where: { id: law.id },
          data: { title }
        });
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`[${updated}/${laws.length}] 更新中...`);
        }
      }
    }
    
    console.log(`\n✅ PostgreSQL更新完了: ${updated}件`);
    
    // サンプル確認
    const samples = await prisma.lawMaster.findMany({
      where: {
        title: {
          not: ''
        }
      },
      take: 5
    });
    
    console.log('\n📝 更新後のサンプル:');
    samples.forEach(law => {
      console.log(`  ${law.id}: ${law.title}`);
    });
    
    // Neo4jも更新
    console.log('\n🔄 Neo4jノードを更新中...');
    await updateNeo4j(titleMap);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function updateNeo4j(titleMap: Map<string, string>) {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  
  try {
    // まず、nullのidをlawNumberで修正
    const fixIds = await session.run(`
      MATCH (n:Law)
      WHERE n.id IS NULL AND n.lawNumber IS NOT NULL
      SET n.id = n.lawNumber
      RETURN COUNT(n) as count
    `);
    
    console.log(`  IDを修正: ${fixIds.records[0].get('count').toNumber()}件`);
    
    // タイトルを更新
    const batch = [];
    for (const [id, title] of titleMap) {
      batch.push({ id, title });
      
      if (batch.length >= 100) {
        await session.run(`
          UNWIND $laws as law
          MATCH (n:Law)
          WHERE n.id = law.id OR n.lawNumber = law.id
          SET n.title = law.title, n.id = law.id
        `, { laws: batch });
        
        batch.length = 0;
      }
    }
    
    // 残りを処理
    if (batch.length > 0) {
      await session.run(`
        UNWIND $laws as law
        MATCH (n:Law)
        WHERE n.id = law.id OR n.lawNumber = law.id
        SET n.title = law.title, n.id = law.id
      `, { laws: batch });
    }
    
    // 結果確認
    const result = await session.run(`
      MATCH (n:Law)
      WHERE n.title IS NOT NULL AND n.title <> ''
      RETURN COUNT(n) as count
    `);
    
    console.log(`✅ Neo4j更新完了: ${result.records[0].get('count').toNumber()}件のノードにタイトル設定`);
    
    // サンプル表示
    const samples = await session.run(`
      MATCH (n:Law)
      WHERE n.title IS NOT NULL AND n.title <> ''
      RETURN n.id as id, n.title as title
      LIMIT 5
    `);
    
    console.log('\n📝 Neo4jサンプル:');
    samples.records.forEach(r => {
      console.log(`  ${r.get('id')}: ${r.get('title')}`);
    });
    
  } finally {
    await session.close();
    await driver.close();
  }
}

// メイン処理
fixTitlesFromCSV().catch(console.error);