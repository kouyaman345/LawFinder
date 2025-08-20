#!/usr/bin/env npx tsx

/**
 * 検出された参照データをNeo4jに投入する
 * バッチ処理により400万件のデータを効率的に処理
 */

import neo4j from 'neo4j-driver';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'lawfinder123')
);

const BATCH_SIZE = 1000; // Neo4jへの投入バッチサイズ
const CHECKPOINT_DIR = 'Report/checkpoints';

interface ReferenceData {
  lawId: string;
  articles: number;
  references: number;
  baseline: number;
}

interface BatchResult {
  laws: ReferenceData[];
  totalReferences: number;
  totalArticles: number;
}

/**
 * 既存データをクリアする
 */
async function clearExistingData(session: any) {
  console.log(chalk.yellow('🗑️  既存データをクリア中...'));
  
  // リレーションシップを削除
  await session.run('MATCH ()-[r:REFERENCES]->() DELETE r');
  
  // 必要に応じてノードも削除（オプション）
  const clearNodes = process.argv.includes('--clear-all');
  if (clearNodes) {
    await session.run('MATCH (n) DELETE n');
    console.log(chalk.green('✅ すべてのノードとリレーションシップを削除しました'));
  } else {
    console.log(chalk.green('✅ リレーションシップを削除しました'));
  }
}

/**
 * 法令ノードを作成または取得
 */
async function ensureLawNode(session: any, lawId: string, title: string = '') {
  await session.run(
    `MERGE (l:Law {id: $lawId})
     ON CREATE SET l.title = $title
     RETURN l`,
    { lawId, title }
  );
}

/**
 * バッチファイルから参照データを抽出して処理
 */
async function processBatchFile(filePath: string): Promise<any[]> {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  const references: any[] = [];
  
  // 各法令のデータを処理
  if (data.laws && Array.isArray(data.laws)) {
    for (const law of data.laws) {
      if (law.lawId) {
        // ここで実際の参照データを生成
        // バッチファイルには集計データしかないので、
        // 実際の参照を生成するには元のXMLを再処理する必要がある
        references.push({
          fromLaw: law.lawId,
          referenceCount: law.references || 0,
          articleCount: law.articles || 0
        });
      }
    }
  }
  
  return references;
}

/**
 * XMLファイルから参照を直接抽出
 */
async function extractReferencesFromXML(lawId: string): Promise<any[]> {
  const references: any[] = [];
  
  try {
    // XMLファイルを探す
    const lawsDataDir = 'laws_data';
    const dirs = readdirSync(lawsDataDir);
    
    for (const dir of dirs) {
      if (dir.startsWith(lawId)) {
        const dirPath = path.join(lawsDataDir, dir);
        const files = readdirSync(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        
        if (xmlFile) {
          const xmlPath = path.join(dirPath, xmlFile);
          const xmlContent = readFileSync(xmlPath, 'utf-8');
          
          // 参照パターンを抽出
          const patterns = [
            // 外部法令参照
            /([^。、\s]{2,30}(?:法|令|規則|条例))(?:（[^）]+）)?(?:第[一二三四五六七八九十百千万０-９]+条)/g,
            // 内部条文参照
            /第[一二三四五六七八九十百千万０-９]+条(?:第[一二三四五六七八九十百千万０-９]+項)?/g,
            // 相対参照
            /(?:前|次|同)(?:条|項|号)/g
          ];
          
          for (const pattern of patterns) {
            const matches = xmlContent.matchAll(pattern);
            for (const match of matches) {
              const text = match[0];
              
              // 参照タイプを判定
              let type = 'unknown';
              let targetLaw = lawId; // デフォルトは内部参照
              let targetArticle = '';
              
              if (text.includes('法') || text.includes('令') || text.includes('規則')) {
                type = 'external';
                // 法令名から法令IDを解決する必要がある（辞書を使用）
                const lawName = text.match(/([^。、\s]{2,30}(?:法|令|規則|条例))/)?.[1];
                if (lawName) {
                  targetLaw = lawName; // 仮の値（実際は辞書で解決）
                }
              } else if (text.match(/第[一二三四五六七八九十百千万０-９]+条/)) {
                type = 'internal';
                targetArticle = text;
              } else if (text.match(/(?:前|次|同)(?:条|項|号)/)) {
                type = 'relative';
              }
              
              references.push({
                fromLaw: lawId,
                toLaw: targetLaw,
                type,
                text,
                articleRef: targetArticle
              });
            }
          }
        }
      }
    }
  } catch (error) {
    // エラーは無視
  }
  
  return references;
}

/**
 * Neo4jにバッチ投入
 */
async function batchImportToNeo4j(session: any, references: any[], batchNum: number) {
  const chunks = [];
  for (let i = 0; i < references.length; i += BATCH_SIZE) {
    chunks.push(references.slice(i, i + BATCH_SIZE));
  }
  
  let imported = 0;
  for (const chunk of chunks) {
    try {
      // バッチクエリを構築
      const query = `
        UNWIND $references as ref
        MERGE (from:Law {id: ref.fromLaw})
        MERGE (to:Law {id: ref.toLaw})
        CREATE (from)-[r:REFERENCES {
          type: ref.type,
          text: ref.text,
          articleRef: ref.articleRef,
          timestamp: datetime()
        }]->(to)
        RETURN count(r) as created
      `;
      
      const result = await session.run(query, { references: chunk });
      imported += chunk.length;
      
    } catch (error) {
      console.error(chalk.red(`エラー: バッチ${batchNum}の投入失敗`), error);
    }
  }
  
  return imported;
}

/**
 * メイン処理
 */
async function importAllReferences() {
  const session = driver.session();
  const startTime = Date.now();
  
  try {
    console.log(chalk.cyan('=' .repeat(80)));
    console.log(chalk.cyan.bold('🚀 Neo4j参照データ投入'));
    console.log(chalk.cyan('=' .repeat(80)));
    
    // 既存データのクリア（オプション）
    if (process.argv.includes('--clear')) {
      await clearExistingData(session);
    }
    
    // バッチ結果ファイルを取得
    const batchFiles = readdirSync(CHECKPOINT_DIR)
      .filter(f => f.startsWith('batch_') && f.endsWith('_results.json'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/batch_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/batch_(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    console.log(`\n📁 ${batchFiles.length}個のバッチファイルを処理します`);
    
    let totalImported = 0;
    let totalLaws = 0;
    const lawSet = new Set<string>();
    
    // 進捗表示
    const progressBar = ora('処理中...').start();
    
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const filePath = path.join(CHECKPOINT_DIR, file);
      const batchNum = parseInt(file.match(/batch_(\d+)/)?.[1] || '0');
      
      progressBar.text = `バッチ ${batchNum}/${batchFiles.length} を処理中...`;
      
      // バッチファイルからデータを読み込み
      const content = readFileSync(filePath, 'utf-8');
      const batchData = JSON.parse(content);
      
      if (batchData.laws && Array.isArray(batchData.laws)) {
        for (const law of batchData.laws) {
          if (law.lawId) {
            lawSet.add(law.lawId);
            
            // XMLから実際の参照を抽出
            const references = await extractReferencesFromXML(law.lawId);
            
            if (references.length > 0) {
              // Neo4jに投入
              const imported = await batchImportToNeo4j(session, references, batchNum);
              totalImported += imported;
            }
          }
        }
      }
      
      // 進捗更新
      const progress = ((i + 1) / batchFiles.length * 100).toFixed(1);
      progressBar.text = `処理中... ${progress}% (${totalImported}件投入済み)`;
    }
    
    progressBar.succeed(`✅ 投入完了: ${totalImported}件の参照を処理`);
    
    // 統計情報を取得
    console.log(chalk.yellow('\n📊 投入後の統計:'));
    
    const stats = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[r:REFERENCES]->()
      WITH count(DISTINCT l) as totalLaws, count(r) as totalRefs
      RETURN totalLaws, totalRefs
    `);
    
    const stat = stats.records[0];
    console.log(`  法令ノード数: ${stat.get('totalLaws')}`);
    console.log(`  参照リレーションシップ数: ${stat.get('totalRefs')}`);
    
    // インデックスを作成
    console.log(chalk.yellow('\n🔧 インデックスを作成中...'));
    
    try {
      await session.run('CREATE INDEX law_id IF NOT EXISTS FOR (l:Law) ON (l.id)');
      await session.run('CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title)');
      console.log(chalk.green('✅ インデックス作成完了'));
    } catch (error) {
      console.log(chalk.yellow('ℹ️  インデックスは既に存在します'));
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(chalk.green(`\n✨ 処理時間: ${elapsed.toFixed(1)}秒`));
    
    console.log(chalk.cyan('\n' + '=' .repeat(80)));
    console.log(chalk.green.bold('✅ Neo4jへのデータ投入が完了しました！'));
    console.log(chalk.cyan('=' .repeat(80)));
    
    // 可視化の案内
    console.log(chalk.yellow('\n📌 次のステップ:'));
    console.log('  1. Neo4j Browser で確認: http://localhost:7474');
    console.log('  2. 可視化レポート生成: npx tsx scripts/visualize-references.ts');
    console.log('  3. Webアプリで確認: npm run dev → http://localhost:3000');
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// オプション表示
if (process.argv.includes('--help')) {
  console.log(`
使用方法:
  npx tsx scripts/import-to-neo4j.ts [オプション]

オプション:
  --clear       既存の参照リレーションシップをクリア
  --clear-all   すべてのノードとリレーションシップをクリア
  --help        このヘルプを表示
  `);
  process.exit(0);
}

// メイン実行
importAllReferences().catch(console.error);