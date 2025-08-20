#!/usr/bin/env npx tsx

/**
 * 拡張参照検出スクリプト
 * 通常検出、逆引き検出、曖昧な参照検出を統合
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { detectReferences } from './detector';
import AmbiguousReferenceResolver from '../src/domain/services/AmbiguousReferenceResolver';

const prisma = new PrismaClient();

// 法令データをインポート
async function importLaws() {
  console.log(chalk.cyan('📚 法令データをインポート中...'));
  
  const csvContent = readFileSync('laws_data/all_law_list.csv', 'utf-8');
  const lines = csvContent.split('\n').slice(1);
  
  let imported = 0;
  for (const line of lines) {
    const columns = line.split(',');
    if (columns.length >= 12) {
      const lawId = columns[11]?.trim();
      const lawTitle = columns[2]?.trim();
      
      if (lawId && lawTitle) {
        // LawMasterを作成
        await prisma.lawMaster.upsert({
          where: { id: lawId },
          update: { title: lawTitle },
          create: {
            id: lawId,
            title: lawTitle,
            lawType: detectLawType(lawId)
          }
        });
        
        // XMLファイルを探す
        const xmlPath = findXMLFile(lawId);
        if (xmlPath) {
          const xmlContent = readFileSync(xmlPath, 'utf-8');
          
          // LawVersionを作成
          await prisma.lawVersion.upsert({
            where: {
              id: `${lawId}_current`
            },
            update: {
              xmlContent,
              isLatest: true
            },
            create: {
              id: `${lawId}_current`,
              lawId,
              versionDate: new Date(),
              xmlContent,
              isLatest: true,
              status: '現行'
            }
          });
        }
        
        imported++;
        if (imported % 100 === 0) {
          process.stdout.write(`\r  インポート済み: ${imported}`);
        }
      }
    }
  }
  
  console.log(chalk.green(`\n✅ ${imported}件の法令をインポート完了`));
}

// 法令タイプを判定
function detectLawType(lawId: string): string {
  if (lawId.includes('AC')) return '法律';
  if (lawId.includes('CO')) return '政令';
  if (lawId.includes('M')) return '省令';
  if (lawId.includes('IO')) return '勅令';
  return 'その他';
}

// XMLファイルを探す
function findXMLFile(lawId: string): string | null {
  const lawsDataDir = 'laws_data';
  const dirs = readdirSync(lawsDataDir);
  
  for (const dir of dirs) {
    if (dir.startsWith(lawId)) {
      const dirPath = path.join(lawsDataDir, dir);
      const files = readdirSync(dirPath);
      const xmlFile = files.find(f => f.endsWith('.xml'));
      
      if (xmlFile) {
        return path.join(dirPath, xmlFile);
      }
    }
  }
  
  return null;
}

// 通常の参照検出
async function detectNormalReferences() {
  console.log(chalk.cyan('🔍 通常の参照検出を実行中...'));
  
  const laws = await prisma.lawVersion.findMany({
    where: { isLatest: true }
  });
  
  let totalRefs = 0;
  const progressBar = ora('参照検出中...').start();
  
  for (let i = 0; i < laws.length; i++) {
    const law = laws[i];
    const refs = detectReferences(law.lawId, law.xmlContent);
    
    // 参照をデータベースに保存
    for (const ref of refs) {
      await prisma.reference.create({
        data: {
          sourceVersionId: law.id,
          sourceLawId: law.lawId,
          sourceArticle: ref.sourceArticle || '全体',
          targetLawId: ref.targetLawId,
          targetArticle: ref.targetArticle,
          referenceType: ref.type,
          referenceText: ref.text,
          confidence: ref.confidence || 0.9,
          detectionMethod: 'forward',
          requiresLLMCheck: ref.type === 'relative' || ref.type === 'contextual',
          isAmbiguous: false,
          metadata: ref.metadata
        }
      });
      totalRefs++;
    }
    
    progressBar.text = `処理中: ${i+1}/${laws.length} (${totalRefs}件検出)`;
  }
  
  progressBar.succeed(`✅ 通常検出完了: ${totalRefs}件`);
  return totalRefs;
}

// 政令・省令の逆引き検出
async function detectReverseReferences() {
  console.log(chalk.cyan('🔄 政令・省令の逆引き検出を実行中...'));
  
  const resolver = new AmbiguousReferenceResolver(prisma);
  await resolver.resolveDecreeReferences();
  
  const reverseRefs = await prisma.reference.count({
    where: { detectionMethod: 'reverse' }
  });
  
  console.log(chalk.green(`✅ 逆引き検出完了: ${reverseRefs}件`));
  return reverseRefs;
}

// 曖昧な参照の検出
async function detectAmbiguousReferences() {
  console.log(chalk.cyan('❓ 曖昧な参照の検出を実行中...'));
  
  const resolver = new AmbiguousReferenceResolver(prisma);
  const laws = await prisma.lawVersion.findMany({
    where: { isLatest: true }
  });
  
  let ambiguousCount = 0;
  
  for (const law of laws) {
    const ambiguousRefs = await resolver.detectAmbiguousReferences(
      law.lawId,
      law.xmlContent
    );
    
    for (const ref of ambiguousRefs) {
      await prisma.reference.create({
        data: {
          sourceVersionId: law.id,
          sourceLawId: law.lawId,
          sourceArticle: '全体',
          targetLawId: null,  // 曖昧なので特定できない
          referenceType: ref.type,
          referenceText: ref.text,
          confidence: ref.confidence,
          detectionMethod: ref.detectionMethod,
          requiresLLMCheck: ref.requiresLLM,
          isAmbiguous: true,
          metadata: { pattern: ref.type }
        }
      });
      ambiguousCount++;
    }
  }
  
  console.log(chalk.green(`✅ 曖昧な参照検出完了: ${ambiguousCount}件`));
  return ambiguousCount;
}

// LLMによる検証
async function validateWithLLM() {
  console.log(chalk.cyan('🤖 LLMによる検証を実行中...'));
  
  // Ollamaが起動しているか確認
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      console.log(chalk.yellow('⚠️  Ollamaが起動していません。スキップします。'));
      return 0;
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Ollamaに接続できません。スキップします。'));
    return 0;
  }
  
  const resolver = new AmbiguousReferenceResolver(prisma);
  const refs = await prisma.reference.findMany({
    where: {
      requiresLLMCheck: true,
      llmCheckedAt: null
    },
    take: 100  // 一度に100件まで
  });
  
  const progressBar = ora(`LLM検証中... 0/${refs.length}`).start();
  
  for (let i = 0; i < refs.length; i++) {
    await resolver.validateWithLLM(refs[i].id);
    progressBar.text = `LLM検証中... ${i+1}/${refs.length}`;
  }
  
  progressBar.succeed(`✅ LLM検証完了: ${refs.length}件`);
  return refs.length;
}

// Neo4jへの投入
async function syncToNeo4j() {
  console.log(chalk.cyan('🔄 Neo4jへのデータ投入を開始...'));
  
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  
  try {
    // 既存データをクリア
    console.log('  既存データをクリア中...');
    let deleted = 0;
    while (true) {
      const result = await session.run(
        'MATCH ()-[r:REFERENCES]->() WITH r LIMIT 10000 DELETE r RETURN count(r) as count'
      );
      const count = Number(result.records[0]?.get('count') || 0);
      deleted += count;
      if (count < 10000) break;
    }
    console.log(`  ${deleted}件のリレーションシップをクリア`);
    
    // 法令ノードを作成
    console.log('  法令ノードを作成中...');
    const laws = await prisma.lawMaster.findMany();
    
    for (let i = 0; i < laws.length; i += 1000) {
      const batch = laws.slice(i, i + 1000);
      await session.run(
        `UNWIND $laws as law
         MERGE (l:Law {id: law.id})
         ON CREATE SET l.title = law.title, l.type = law.lawType
         RETURN count(l)`,
        { laws: batch }
      );
    }
    console.log(`  ${laws.length}件の法令ノードを作成`);
    
    // 参照関係を投入
    console.log('  参照関係を投入中...');
    const references = await prisma.reference.findMany({
      where: {
        targetLawId: { not: null }
      }
    });
    
    for (let i = 0; i < references.length; i += 5000) {
      const batch = references.slice(i, i + 5000);
      const refs = batch.map(r => ({
        fromLaw: r.sourceLawId,
        toLaw: r.targetLawId,
        type: r.referenceType,
        text: r.referenceText,
        confidence: r.confidence,
        method: r.detectionMethod,
        isAmbiguous: r.isAmbiguous,
        llmChecked: r.llmCheckedAt !== null
      }));
      
      await session.run(
        `UNWIND $refs as ref
         MATCH (from:Law {id: ref.fromLaw})
         MATCH (to:Law {id: ref.toLaw})
         CREATE (from)-[r:REFERENCES {
           type: ref.type,
           text: ref.text,
           confidence: ref.confidence,
           method: ref.method,
           isAmbiguous: ref.isAmbiguous,
           llmChecked: ref.llmChecked,
           timestamp: datetime()
         }]->(to)
         RETURN count(r)`,
        { refs }
      );
      
      process.stdout.write(`\r  投入中: ${Math.min(i + 5000, references.length)}/${references.length}`);
    }
    
    console.log(chalk.green(`\n✅ Neo4j投入完了: ${references.length}件`));
    
    // 統計を表示
    const stats = await session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[r:REFERENCES]->()
      WITH count(DISTINCT l) as laws, count(r) as refs
      RETURN laws, refs
    `);
    
    const stat = stats.records[0];
    console.log(chalk.cyan('\n📊 Neo4j統計:'));
    console.log(`  法令ノード数: ${Number(stat.get('laws')).toLocaleString()}`);
    console.log(`  参照リレーションシップ数: ${Number(stat.get('refs')).toLocaleString()}`);
    
  } finally {
    await session.close();
    await driver.close();
  }
}

// 統計レポート
async function generateReport() {
  console.log(chalk.cyan('\n📊 最終統計レポート'));
  console.log('='.repeat(60));
  
  const stats = {
    totalLaws: await prisma.lawMaster.count(),
    totalVersions: await prisma.lawVersion.count(),
    totalReferences: await prisma.reference.count(),
    byType: await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true
    }),
    byMethod: await prisma.reference.groupBy({
      by: ['detectionMethod'],
      _count: true
    }),
    ambiguous: await prisma.reference.count({
      where: { isAmbiguous: true }
    }),
    llmRequired: await prisma.reference.count({
      where: { requiresLLMCheck: true }
    }),
    llmChecked: await prisma.reference.count({
      where: { llmCheckedAt: { not: null } }
    })
  };
  
  console.log(`総法令数: ${stats.totalLaws.toLocaleString()}`);
  console.log(`総バージョン数: ${stats.totalVersions.toLocaleString()}`);
  console.log(`総参照数: ${stats.totalReferences.toLocaleString()}`);
  
  console.log('\n参照タイプ別:');
  for (const item of stats.byType) {
    const percentage = (item._count / stats.totalReferences * 100).toFixed(2);
    console.log(`  ${item.referenceType}: ${item._count.toLocaleString()} (${percentage}%)`);
  }
  
  console.log('\n検出方法別:');
  for (const item of stats.byMethod) {
    const percentage = (item._count / stats.totalReferences * 100).toFixed(2);
    console.log(`  ${item.detectionMethod}: ${item._count.toLocaleString()} (${percentage}%)`);
  }
  
  console.log('\n特殊カテゴリ:');
  console.log(`  曖昧な参照: ${stats.ambiguous.toLocaleString()}`);
  console.log(`  LLMチェック必須: ${stats.llmRequired.toLocaleString()}`);
  console.log(`  LLMチェック済み: ${stats.llmChecked.toLocaleString()}`);
  
  console.log('='.repeat(60));
}

// メイン処理
async function main() {
  const startTime = Date.now();
  
  console.log(chalk.cyan.bold('🚀 拡張参照検出処理を開始'));
  console.log('='.repeat(60));
  
  try {
    // 1. 法令データをインポート
    await importLaws();
    
    // 2. 通常の参照検出
    await detectNormalReferences();
    
    // 3. 政令・省令の逆引き検出
    await detectReverseReferences();
    
    // 4. 曖昧な参照の検出
    await detectAmbiguousReferences();
    
    // 5. LLMによる検証
    await validateWithLLM();
    
    // 6. Neo4jへの投入
    await syncToNeo4j();
    
    // 7. 統計レポート
    await generateReport();
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(chalk.green.bold(`\n✨ 処理完了！ (${elapsed.toFixed(1)}秒)`));
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(console.error);