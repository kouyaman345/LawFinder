#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';

const prisma = new PrismaClient();
const detector = new ImprovedReferenceDetector();

/**
 * 法令の参照を検出してデータベースに保存
 */
async function detectReferencesForLaw(lawId: string) {
  console.log(chalk.cyan(`\n📚 ${lawId}の参照検出を開始...`));
  
  // 法令バージョンを取得
  const lawVersion = await prisma.lawVersion.findFirst({
    where: {
      lawId,
      isLatest: true
    },
    include: {
      articles: {
        include: {
          paragraphs: true
        },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  if (!lawVersion) {
    console.error(chalk.red(`法令 ${lawId} が見つかりません`));
    return;
  }
  
  console.log(chalk.gray(`  条文数: ${lawVersion.articles.length}`));
  
  let totalReferences = 0;
  const references: any[] = [];
  
  // 各条文の参照を検出
  for (const article of lawVersion.articles) {
    // 条文全体のテキストを構築
    let fullText = '';
    if (article.articleTitle) {
      fullText += article.articleTitle + '\n';
    }
    fullText += article.content;
    
    // 参照を検出
    const detectedRefs = detector.detectAllReferences(fullText);
    
    for (const ref of detectedRefs) {
      // 参照タイプによって処理を分ける
      let targetLawId = null;
      let targetArticle = null;
      
      if (ref.type === 'external' && ref.targetLaw) {
        // 他法令への参照
        targetLawId = await findLawIdByName(ref.targetLaw);
        targetArticle = ref.targetArticle;
      } else if (ref.type === 'internal' && ref.targetArticle) {
        // 同一法令内の参照
        targetLawId = lawId;
        targetArticle = ref.targetArticle;
      } else if (ref.type === 'relative') {
        // 相対参照（前条、次条など）
        targetLawId = lawId;
        targetArticle = resolveRelativeReference(article.articleNumber, ref.text);
      }
      
      // データベースに保存
      references.push({
        sourceVersionId: lawVersion.id,
        sourceLawId: lawId,
        sourceArticle: article.articleNumber,
        targetVersionId: null,
        targetLawId,
        targetArticle,
        referenceType: ref.type,
        referenceText: ref.text,
        confidence: ref.confidence || 1.0,
        metadata: {
          detectedAt: new Date().toISOString(),
          detector: 'ImprovedReferenceDetector',
          sourceText: fullText.substring(0, 200)
        }
      });
      
      totalReferences++;
    }
    
    // 進捗表示
    if (article.sortOrder % 50 === 0) {
      console.log(chalk.gray(`  処理済み: ${article.sortOrder}/${lawVersion.articles.length} (${totalReferences}件の参照)`));
    }
  }
  
  // バッチでデータベースに保存
  if (references.length > 0) {
    console.log(chalk.cyan(`  ${references.length}件の参照をデータベースに保存中...`));
    
    // 既存の参照を削除
    await prisma.reference.deleteMany({
      where: {
        sourceLawId: lawId
      }
    });
    
    // 新しい参照を保存（バッチ処理）
    const batchSize = 100;
    for (let i = 0; i < references.length; i += batchSize) {
      const batch = references.slice(i, i + batchSize);
      await prisma.reference.createMany({
        data: batch,
        skipDuplicates: true
      });
      console.log(chalk.gray(`    保存済み: ${Math.min(i + batchSize, references.length)}/${references.length}`));
    }
  }
  
  console.log(chalk.green(`✅ ${lawId}の参照検出完了（${totalReferences}件）`));
}

/**
 * 法令名から法令IDを検索
 */
async function findLawIdByName(lawName: string): Promise<string | null> {
  // よく参照される法令のマッピング
  const commonLaws: Record<string, string> = {
    '民法': '129AC0000000089',
    '商法': '132AC0000000048',
    '刑法': '140AC0000000045',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '憲法': '321CONSTITUTION',
    '民事訴訟法': '108AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '破産法': '416AC0000000075',
    '民事執行法': '354AC0000000004'
  };
  
  // 完全一致を試す
  if (commonLaws[lawName]) {
    return commonLaws[lawName];
  }
  
  // 部分一致を試す
  for (const [name, id] of Object.entries(commonLaws)) {
    if (lawName.includes(name) || name.includes(lawName)) {
      return id;
    }
  }
  
  // データベースから検索
  const law = await prisma.lawMaster.findFirst({
    where: {
      OR: [
        { title: { contains: lawName } },
        { lawNumber: { contains: lawName } }
      ]
    }
  });
  
  return law?.id || null;
}

/**
 * 相対参照を解決
 */
function resolveRelativeReference(currentArticle: string, referenceText: string): string | null {
  const currentNum = parseInt(currentArticle.replace(/[^0-9]/g, ''));
  
  if (referenceText.includes('前条')) {
    return String(currentNum - 1);
  } else if (referenceText.includes('次条')) {
    return String(currentNum + 1);
  } else if (referenceText.includes('前二条')) {
    return String(currentNum - 2);
  } else if (referenceText.includes('前三条')) {
    return String(currentNum - 3);
  }
  
  return null;
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.yellow('使用方法: npx tsx scripts/detect-references.ts [法令ID]'));
    console.log(chalk.yellow('例: npx tsx scripts/detect-references.ts 129AC0000000089'));
    console.log(chalk.cyan('\n主要な法令の参照を検出します...'));
    
    // 主要な法令の参照を検出
    const majorLaws = [
      '129AC0000000089', // 民法
      '132AC0000000048', // 商法
      '140AC0000000045', // 刑法
      '417AC0000000086', // 会社法
      '322AC0000000049'  // 労働基準法
    ];
    
    for (const lawId of majorLaws) {
      await detectReferencesForLaw(lawId);
    }
  } else {
    await detectReferencesForLaw(args[0]);
  }
  
  // 統計情報表示
  const stats = await prisma.reference.groupBy({
    by: ['referenceType'],
    _count: {
      _all: true
    }
  });
  
  console.log(chalk.cyan('\n📊 参照タイプ別統計:'));
  for (const stat of stats) {
    console.log(`  ${stat.referenceType}: ${stat._count._all}件`);
  }
  
  const totalRefs = await prisma.reference.count();
  console.log(chalk.green(`\n✨ 合計: ${totalRefs}件の参照`));
  
  await prisma.$disconnect();
}

main().catch(console.error);