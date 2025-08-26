#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver';
import fs from 'fs';
import path from 'path';

async function checkProcessed() {
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );

  const session = driver.session();
  try {
    // 処理済み法令IDを取得
    const result = await session.run(`
      MATCH (l:Law)
      WHERE l.source = 'egov'
      RETURN DISTINCT l.lawId as lawId
      ORDER BY lawId
    `);
    
    const processedLaws = new Set(result.records.map(r => r.get('lawId')));
    console.log('Neo4jに登録済みの法令数:', processedLaws.size);
    
    // HTMLファイルリスト取得
    const htmlDir = path.join(process.cwd(), 'egov_html_cache');
    const allHtmlFiles = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
    const allLawIds = allHtmlFiles.map(f => f.replace('.html', ''));
    
    console.log('総HTMLファイル数:', allHtmlFiles.length);
    
    // 未処理リスト
    const unprocessed = allLawIds.filter(id => !processedLaws.has(id));
    console.log('未処理数:', unprocessed.length);
    
    // 未処理の最初の10個を表示
    console.log('\n未処理の最初の10個:');
    unprocessed.slice(0, 10).forEach(id => console.log(' -', id));
    
    // プログレスファイルを更新
    const progressFile = path.join(process.cwd(), 'egov_progress.json');
    fs.writeFileSync(progressFile, JSON.stringify({
      processed: Array.from(processedLaws),
      total: allLawIds.length,
      remaining: unprocessed.length
    }, null, 2));
    
    console.log('\n✅ プログレスファイルを更新しました:', progressFile);
    
  } finally {
    await session.close();
    await driver.close();
  }
}

checkProcessed().catch(console.error);