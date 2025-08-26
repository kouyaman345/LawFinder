#!/usr/bin/env npx tsx

import { initNeo4jDriver } from '../src/lib/neo4j';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

async function findMissingHTMLs() {
  const driver = initNeo4jDriver();
  const session = driver.session();
  
  try {
    // 被参照が多い法令TOP100を取得
    const result = await session.run(`
      MATCH (l:Law)<-[r:REFERENCES]-()
      WHERE l.source = 'egov'
      WITH l.lawId as lawId, l.lawTitle as title, COUNT(r) as refs
      ORDER BY refs DESC
      LIMIT 100
      RETURN lawId, title, refs
    `);
    
    const htmlDir = path.join(process.cwd(), 'egov_html_cache');
    const missingLaws: Array<{lawId: string, title: string, refs: number}> = [];
    
    console.log(chalk.cyan('🔍 HTMLファイル欠損チェック（被参照TOP100）\n'));
    
    result.records.forEach(record => {
      const lawId = record.get('lawId');
      const title = record.get('title') || '不明';
      const refs = record.get('refs').toNumber();
      const htmlPath = path.join(htmlDir, `${lawId}.html`);
      
      if (!fs.existsSync(htmlPath)) {
        missingLaws.push({ lawId, title, refs });
      }
    });
    
    if (missingLaws.length > 0) {
      console.log(chalk.red('❌ HTMLファイルが欠損している重要法令:\n'));
      missingLaws.forEach((law, i) => {
        console.log(`${i+1}. ${law.lawId}: ${law.title} (被参照${law.refs}件)`);
      });
      
      // 欠損リストをファイルに保存
      const missingList = missingLaws.map(l => l.lawId).join('\n');
      fs.writeFileSync('missing_laws.txt', missingList);
      console.log(chalk.green('\n✅ missing_laws.txt に欠損リストを保存しました'));
    } else {
      console.log(chalk.green('✅ TOP100法令のHTMLファイルはすべて存在します'));
    }
    
    // 全体の欠損数も確認
    const allLawsResult = await session.run(`
      MATCH (l:Law)
      WHERE l.source = 'egov'
      RETURN l.lawId as lawId
    `);
    
    let totalMissing = 0;
    const allMissingIds: string[] = [];
    
    allLawsResult.records.forEach(record => {
      const lawId = record.get('lawId');
      const htmlPath = path.join(htmlDir, `${lawId}.html`);
      if (!fs.existsSync(htmlPath)) {
        totalMissing++;
        allMissingIds.push(lawId);
      }
    });
    
    console.log(chalk.blue('\n📊 全体統計:'));
    console.log(`  データベース内の法令数: ${allLawsResult.records.length}`);
    console.log(`  HTMLファイル欠損数: ${totalMissing}`);
    
    if (totalMissing > 0) {
      // 全欠損リストも保存
      fs.writeFileSync('all_missing_laws.txt', allMissingIds.join('\n'));
      console.log(chalk.gray('  → all_missing_laws.txt に全欠損リストを保存'));
    }
    
  } finally {
    await session.close();
    await driver.close();
  }
}

// 実行
if (require.main === module) {
  findMissingHTMLs().catch(console.error);
}

export default findMissingHTMLs;