#!/usr/bin/env npx tsx

/**
 * 主要法令の参照検出スクリプト
 * デモンストレーション用に主要な法令の参照を検出してデータベースに投入
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { UltimateReferenceDetector } from './detector';

const prisma = new PrismaClient();

// 主要法令リスト
const MAJOR_LAWS = [
  { id: '129AC0000000089', name: '民法' },
  { id: '132AC0000000048', name: '商法' },
  { id: '140AC0000000045', name: '刑法' },
  { id: '417AC0000000086', name: '会社法' },
  { id: '322AC0000000049', name: '労働基準法' },
  { id: '323AC0000000131', name: '刑事訴訟法' },
  { id: '408AC0000000109', name: '民事訴訟法' },
  { id: '321CO0000000000', name: '日本国憲法' },
  { id: '405AC0000000088', name: '行政手続法' },
  { id: '325AC0000000226', name: '地方税法' }
];

async function findXMLFile(lawId: string): Promise<string | null> {
  const lawsDataDir = 'laws_data';
  
  try {
    const dirs = fs.readdirSync(lawsDataDir);
    
    for (const dir of dirs) {
      if (dir.startsWith(lawId)) {
        const dirPath = path.join(lawsDataDir, dir);
        const files = fs.readdirSync(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        
        if (xmlFile) {
          return path.join(dirPath, xmlFile);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error finding XML for ${lawId}:`, error));
  }
  
  return null;
}

async function extractArticles(xmlContent: string): Promise<string[]> {
  const articles: string[] = [];
  
  // 条文を抽出（簡略版）
  const articlePattern = /<Article[^>]*>([\s\S]*?)<\/Article>/g;
  let match;
  
  while ((match = articlePattern.exec(xmlContent)) !== null) {
    const articleContent = match[1]
      .replace(/<[^>]*>/g, ' ')  // タグを削除
      .replace(/\s+/g, ' ')       // 空白を正規化
      .trim();
    
    if (articleContent) {
      articles.push(articleContent);
    }
  }
  
  return articles;
}

async function detectAndSaveReferences(lawId: string, lawName: string) {
  console.log(chalk.cyan(`\n📖 ${lawName} (${lawId}) を処理中...`));
  
  // XMLファイルを探す
  const xmlPath = await findXMLFile(lawId);
  if (!xmlPath) {
    console.log(chalk.yellow(`  ⚠️ XMLファイルが見つかりません`));
    return 0;
  }
  
  // XMLを読み込み
  const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
  
  // 条文を抽出
  const articles = await extractArticles(xmlContent);
  console.log(chalk.gray(`  📄 ${articles.length}条文を抽出`));
  
  // 参照検出
  const detector = new UltimateReferenceDetector(false); // LLMは無効化
  const allReferences: any[] = [];
  
  const progressBar = ora(`参照検出中...`).start();
  
  for (let i = 0; i < Math.min(articles.length, 10); i++) { // デモ用に最初の10条文のみ
    const articleText = articles[i];
    const refs = await detector.detectReferences(articleText, lawId, lawName, `第${i+1}条`);
    
    for (const ref of refs) {
      allReferences.push({
        sourceLawId: lawId,
        sourceArticle: `第${i+1}条`,
        targetLawId: ref.targetLawId || lawId, // 内部参照の場合は同じ法令ID
        targetLaw: ref.targetLaw || lawName,
        targetArticle: ref.targetArticle,
        referenceType: ref.type,
        referenceText: ref.text.substring(0, 500),
        confidence: ref.confidence
      });
    }
    
    progressBar.text = `処理中: ${i+1}/${Math.min(articles.length, 10)}条文`;
  }
  
  progressBar.succeed(`  ✅ ${allReferences.length}件の参照を検出`);
  
  // データベースに保存
  if (allReferences.length > 0) {
    const saveBar = ora(`データベースに保存中...`).start();
    
    // まずLawVersionを作成または取得
    let lawVersion = await prisma.lawVersion.findFirst({
      where: { lawId: lawId }
    });
    
    if (!lawVersion) {
      lawVersion = await prisma.lawVersion.create({
        data: {
          id: `${lawId}_current`,
          lawId: lawId,
          versionDate: new Date(),
          xmlContent: xmlContent.substring(0, 1000), // サンプルとして一部のみ保存
          isLatest: true,
          status: '現行'
        }
      });
    }
    
    let saved = 0;
    for (const ref of allReferences) {
      try {
        await prisma.reference.create({
          data: {
            ...ref,
            sourceVersionId: lawVersion.id,
            targetLaw: undefined // targetLawフィールドは存在しない
          }
        });
        saved++;
      } catch (error: any) {
        // エラーログ
        if (!error.message.includes('Unique constraint')) {
          console.error(chalk.red(`  ⚠️ エラー: ${error.message}`));
        }
      }
    }
    
    saveBar.succeed(`  💾 ${saved}件の参照を保存`);
    return saved;
  }
  
  return 0;
}

async function main() {
  console.log(chalk.cyan.bold('🚀 主要法令の参照検出を開始'));
  console.log('='.repeat(60));
  
  let totalReferences = 0;
  
  for (const law of MAJOR_LAWS) {
    const refs = await detectAndSaveReferences(law.id, law.name);
    totalReferences += refs;
  }
  
  console.log(chalk.green.bold(`\n✨ 完了！ 合計${totalReferences}件の参照を検出・保存`));
  
  // 統計表示
  const stats = await prisma.reference.groupBy({
    by: ['referenceType'],
    _count: true
  });
  
  console.log(chalk.cyan('\n📊 参照タイプ別統計:'));
  for (const stat of stats) {
    console.log(`  ${stat.referenceType}: ${stat._count}件`);
  }
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(chalk.red('❌ エラー:'), error);
  process.exit(1);
});