#!/usr/bin/env tsx

/**
 * 法令タイトルを修正するスクリプト
 * XMLファイルから法令名を取得してデータベースを更新
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

function extractTitleFromXML(xmlContent: string): string | null {
  // 法令名を抽出（複数のパターンに対応）
  const patterns = [
    /<LawTitle>([^<]+)<\/LawTitle>/,
    /<法令名[^>]*>([^<]+)<\/法令名>/,
    /<Title>([^<]+)<\/Title>/,
    /<題名>([^<]+)<\/題名>/
  ];
  
  for (const pattern of patterns) {
    const match = xmlContent.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

async function fixLawTitles() {
  console.log('='.repeat(80));
  console.log('🔧 法令タイトル修正開始');
  console.log('='.repeat(80));
  
  try {
    // すべての法令バージョンを取得
    const versions = await prisma.lawVersion.findMany({
      where: { isLatest: true },
      select: {
        id: true,
        lawId: true,
        xmlContent: true
      }
    });
    
    console.log(`処理対象: ${versions.length}バージョン`);
    
    let updated = 0;
    let failed = 0;
    const batchSize = 100;
    const updates: { id: string; title: string }[] = [];
    
    for (const version of versions) {
      // XMLからタイトルを抽出
      const title = extractTitleFromXML(version.xmlContent);
      
      if (title) {
        updates.push({ id: version.lawId, title });
        
        if (updates.length >= batchSize) {
          // バッチ更新
          for (const update of updates) {
            await prisma.lawMaster.update({
              where: { id: update.id },
              data: { title: update.title }
            });
            updated++;
          }
          
          console.log(`[${updated}/${versions.length}] 更新中...`);
          updates.length = 0;
        }
      } else {
        failed++;
      }
    }
    
    // 残りを更新
    for (const update of updates) {
      await prisma.lawMaster.update({
        where: { id: update.id },
        data: { title: update.title }
      });
      updated++;
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ タイトル修正完了');
    console.log(`  更新: ${updated}件`);
    console.log(`  失敗: ${failed}件`);
    console.log('='.repeat(80));
    
    // サンプル確認
    const samples = await prisma.lawMaster.findMany({
      where: {
        title: {
          not: ''
        }
      },
      take: 10
    });
    
    if (samples.length > 0) {
      console.log('\n📝 修正後のサンプル:');
      samples.forEach(law => {
        console.log(`  ${law.id}: ${law.title}`);
      });
    }
    
    // Neo4jも更新
    console.log('\n🔄 Neo4jのノードも更新します...');
    await updateNeo4jTitles();
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function updateNeo4jTitles() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  
  try {
    // PostgreSQLから法令データを取得
    const laws = await prisma.lawMaster.findMany({
      where: {
        title: {
          not: ''
        }
      }
    });
    
    console.log(`Neo4j: ${laws.length}件の法令タイトルを更新中...`);
    
    // バッチ更新
    const batchSize = 100;
    for (let i = 0; i < laws.length; i += batchSize) {
      const batch = laws.slice(i, i + batchSize);
      
      await session.run(`
        UNWIND $laws as law
        MATCH (n:Law {id: law.id})
        SET n.title = law.title
      `, { laws: batch.map(l => ({ id: l.id, title: l.title })) });
      
      if ((i + batchSize) % 500 === 0) {
        console.log(`  [${Math.min(i + batchSize, laws.length)}/${laws.length}] 更新中...`);
      }
    }
    
    // 既存ノードのidも修正（lawNumberをidにコピー）
    await session.run(`
      MATCH (n:Law)
      WHERE n.id IS NULL AND n.lawNumber IS NOT NULL
      SET n.id = n.lawNumber
    `);
    
    console.log('✅ Neo4jノードの更新完了');
    
  } finally {
    await session.close();
    await driver.close();
  }
}

// メイン処理
fixLawTitles().catch(console.error);