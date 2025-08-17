#!/usr/bin/env npx tsx
/**
 * 統合版参照管理スクリプト
 * 
 * 法令の参照検出と登録を一元管理するスクリプト
 * - 全法令の参照を初期登録
 * - 特定法令の参照を更新（差分更新）
 * - 参照データのクリーンアップ
 * - 統計情報の表示
 * 
 * 使用方法:
 *   全法令の初期登録: npx tsx scripts/manage-references.ts --init
 *   特定法令の更新:   npx tsx scripts/manage-references.ts --update 129AC0000000089
 *   全法令の再登録:   npx tsx scripts/manage-references.ts --rebuild
 *   統計情報の表示:   npx tsx scripts/manage-references.ts --stats
 *   クリーンアップ:   npx tsx scripts/manage-references.ts --cleanup
 */

import { PrismaClient } from '@prisma/client';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const detector = new ImprovedReferenceDetector();

// 統計情報の型定義
interface ProcessStats {
  laws: number;
  articles: number;
  paragraphs: number;
  references: number;
  internalRefs: number;
  externalRefs: number;
  relativeRefs: number;
  errors: number;
  startTime: number;
  endTime?: number;
}

/**
 * メインエントリーポイント
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const lawId = args[1];

  try {
    switch (command) {
      case '--init':
        console.log('📋 初期登録モード');
        await initializeReferences();
        break;
        
      case '--update':
        if (!lawId) {
          console.error('❌ 法令IDを指定してください');
          process.exit(1);
        }
        console.log(`📝 差分更新モード: ${lawId}`);
        await updateLawReferences(lawId);
        break;
        
      case '--rebuild':
        console.log('🔄 全法令再登録モード');
        await rebuildAllReferences();
        break;
        
      case '--stats':
        console.log('📊 統計情報表示モード');
        await showStatistics();
        break;
        
      case '--cleanup':
        console.log('🧹 クリーンアップモード');
        await cleanupReferences();
        break;
        
      case '--help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * ヘルプメッセージの表示
 */
function showHelp() {
  console.log(`
統合版参照管理スクリプト

使用方法:
  npx tsx scripts/manage-references.ts [コマンド] [オプション]

コマンド:
  --init          全法令の参照を初期登録（既存データがない場合）
  --update <ID>   特定法令の参照を更新（差分更新）
  --rebuild       全法令の参照を再登録（既存データを削除して再構築）
  --stats         参照データの統計情報を表示
  --cleanup       不要な参照データをクリーンアップ
  --help          このヘルプを表示

例:
  npx tsx scripts/manage-references.ts --init
  npx tsx scripts/manage-references.ts --update 129AC0000000089
  npx tsx scripts/manage-references.ts --stats
  `);
}

/**
 * 初期登録（既存データがない場合）
 */
async function initializeReferences() {
  // 既存データの確認
  const existingCount = await prisma.reference.count();
  if (existingCount > 0) {
    console.log(`⚠️  既に${existingCount}件の参照データが存在します`);
    console.log('   --rebuild オプションを使用して再登録してください');
    return;
  }
  
  await processAllLaws();
}

/**
 * 全法令の再登録（既存データを削除）
 */
async function rebuildAllReferences() {
  console.log('🗑️  既存の参照データを削除中...');
  await prisma.reference.deleteMany();
  console.log('✅ 削除完了');
  
  await processAllLaws();
}

/**
 * 特定法令の参照を更新（差分更新）
 */
async function updateLawReferences(lawId: string) {
  const law = await prisma.law.findUnique({
    where: { id: lawId },
    include: {
      articles: {
        include: {
          paragraphs: true
        }
      }
    }
  });

  if (!law) {
    console.error(`❌ 法令が見つかりません: ${lawId}`);
    return;
  }

  console.log(`📖 ${law.title} の参照を更新中...`);
  
  // 既存の参照を削除
  const deleted = await prisma.reference.deleteMany({
    where: { sourceLawId: lawId }
  });
  console.log(`  削除: ${deleted.count}件`);

  // 新しい参照を登録
  const stats = await processLaw(law);
  console.log(`  登録: ${stats.references}件`);
  console.log('✅ 更新完了');
}

/**
 * 全法令の処理
 */
async function processAllLaws() {
  const laws = await prisma.law.findMany({
    where: { status: '現行' },
    include: {
      articles: {
        include: {
          paragraphs: true
        }
      }
    }
  });

  console.log(`📚 ${laws.length}件の法令を処理します`);
  
  const totalStats: ProcessStats = {
    laws: 0,
    articles: 0,
    paragraphs: 0,
    references: 0,
    internalRefs: 0,
    externalRefs: 0,
    relativeRefs: 0,
    errors: 0,
    startTime: Date.now()
  };

  for (const law of laws) {
    try {
      const stats = await processLaw(law);
      
      // 統計の集計
      totalStats.laws++;
      totalStats.articles += stats.articles;
      totalStats.paragraphs += stats.paragraphs;
      totalStats.references += stats.references;
      totalStats.internalRefs += stats.internalRefs;
      totalStats.externalRefs += stats.externalRefs;
      totalStats.relativeRefs += stats.relativeRefs;
      
      console.log(`✅ ${law.title}: ${stats.references}件の参照を登録`);
    } catch (error) {
      console.error(`❌ ${law.title} の処理中にエラー:`, error);
      totalStats.errors++;
    }
  }

  totalStats.endTime = Date.now();
  printStatistics(totalStats);
}

/**
 * 個別法令の処理
 */
async function processLaw(law: any): Promise<ProcessStats> {
  const stats: ProcessStats = {
    laws: 1,
    articles: 0,
    paragraphs: 0,
    references: 0,
    internalRefs: 0,
    externalRefs: 0,
    relativeRefs: 0,
    errors: 0,
    startTime: Date.now()
  };

  const referencesToCreate = [];

  for (const article of law.articles) {
    if (article.isDeleted) continue;
    
    stats.articles++;
    
    // 条文タイトルからの参照検出
    if (article.articleTitle) {
      const titleRefs = detector.detectAllReferences(article.articleTitle);
      for (const ref of titleRefs) {
        referencesToCreate.push(createReferenceData(law.id, article.articleNumber, ref, stats));
      }
    }

    // 各項からの参照検出
    for (const paragraph of article.paragraphs) {
      stats.paragraphs++;
      
      const paragraphRefs = detector.detectAllReferences(paragraph.content);
      for (const ref of paragraphRefs) {
        referencesToCreate.push(createReferenceData(law.id, article.articleNumber, ref, stats));
      }
    }
  }

  // バッチ登録
  if (referencesToCreate.length > 0) {
    await prisma.reference.createMany({
      data: referencesToCreate,
      skipDuplicates: true
    });
    stats.references = referencesToCreate.length;
  }

  return stats;
}

/**
 * 参照データの作成
 */
function createReferenceData(lawId: string, articleNumber: string, ref: any, stats: ProcessStats): any {
  const referenceData: any = {
    sourceLawId: lawId,
    sourceArticle: articleNumber,
    referenceType: ref.type,
    referenceText: ref.text,
    confidence: ref.confidence || 0.9,
    metadata: {
      startPos: ref.startPos,
      endPos: ref.endPos,
      context: ref.context
    }
  };

  switch (ref.type) {
    case 'internal':
      referenceData.targetLawId = lawId;
      referenceData.targetArticle = ref.targetArticle || null;
      if (ref.targetParagraph) {
        referenceData.metadata.targetParagraph = ref.targetParagraph;
      }
      if (ref.targetItem) {
        referenceData.metadata.targetItem = ref.targetItem;
      }
      stats.internalRefs++;
      break;

    case 'external':
      referenceData.targetLawId = ref.targetLaw || null;
      referenceData.targetArticle = ref.targetArticle || null;
      referenceData.metadata.lawName = ref.targetLaw;
      if (ref.targetParagraph) {
        referenceData.metadata.targetParagraph = ref.targetParagraph;
      }
      if (ref.targetItem) {
        referenceData.metadata.targetItem = ref.targetItem;
      }
      stats.externalRefs++;
      break;

    case 'relative':
      referenceData.metadata.relativeType = ref.relativeType;
      referenceData.metadata.distance = ref.relativeDistance;
      stats.relativeRefs++;
      break;

    case 'range':
      referenceData.metadata.rangeStart = ref.targetArticle;
      referenceData.metadata.rangeEnd = ref.targetArticleEnd;
      break;

    case 'multiple':
      referenceData.metadata.targets = ref.targets;
      break;

    case 'structural':
      referenceData.metadata.structureType = ref.structureType;
      if (ref.targetParagraph) {
        referenceData.metadata.targetParagraph = ref.targetParagraph;
      }
      if (ref.targetItem) {
        referenceData.metadata.targetItem = ref.targetItem;
      }
      break;

    case 'application':
      referenceData.metadata.applicationType = ref.applicationType;
      break;
  }

  return referenceData;
}

/**
 * 統計情報の表示
 */
async function showStatistics() {
  const totalRefs = await prisma.reference.count();
  const byType = await prisma.reference.groupBy({
    by: ['referenceType'],
    _count: true,
    orderBy: {
      _count: {
        referenceType: 'desc'
      }
    }
  });

  const byLaw = await prisma.reference.groupBy({
    by: ['sourceLawId'],
    _count: true,
    orderBy: {
      _count: {
        sourceLawId: 'desc'
      }
    },
    take: 10
  });

  console.log('\n📊 参照データ統計');
  console.log('='.repeat(60));
  console.log(`総参照数: ${totalRefs.toLocaleString()}件\n`);
  
  console.log('参照タイプ別:');
  for (const type of byType) {
    const percentage = ((type._count / totalRefs) * 100).toFixed(1);
    console.log(`  ${type.referenceType}: ${type._count.toLocaleString()}件 (${percentage}%)`);
  }
  
  console.log('\n法令別TOP10:');
  for (const law of byLaw) {
    const lawData = await prisma.law.findUnique({
      where: { id: law.sourceLawId },
      select: { title: true }
    });
    console.log(`  ${lawData?.title}: ${law._count.toLocaleString()}件`);
  }
  console.log('='.repeat(60));
}

/**
 * 不要な参照データのクリーンアップ
 */
async function cleanupReferences() {
  console.log('🧹 クリーンアップを開始します...');
  
  // 1. 削除された条文の参照を削除
  const deletedArticles = await prisma.article.findMany({
    where: { isDeleted: true },
    select: { lawId: true, articleNumber: true }
  });
  
  let cleanupCount = 0;
  for (const article of deletedArticles) {
    const deleted = await prisma.reference.deleteMany({
      where: {
        sourceLawId: article.lawId,
        sourceArticle: article.articleNumber
      }
    });
    cleanupCount += deleted.count;
  }
  
  console.log(`  削除された条文の参照: ${cleanupCount}件削除`);
  
  // 2. 重複する参照を削除
  const duplicates = await prisma.$queryRaw<any[]>`
    SELECT "sourceLawId", "sourceArticle", "referenceText", COUNT(*) as count
    FROM "Reference"
    GROUP BY "sourceLawId", "sourceArticle", "referenceText"
    HAVING COUNT(*) > 1
  `;
  
  let duplicateCount = 0;
  for (const dup of duplicates) {
    const refs = await prisma.reference.findMany({
      where: {
        sourceLawId: dup.sourceLawId,
        sourceArticle: dup.sourceArticle,
        referenceText: dup.referenceText
      },
      orderBy: { createdAt: 'asc' }
    });
    
    // 最初の1件以外を削除
    const toDelete = refs.slice(1).map(r => r.id);
    if (toDelete.length > 0) {
      await prisma.reference.deleteMany({
        where: { id: { in: toDelete } }
      });
      duplicateCount += toDelete.length;
    }
  }
  
  console.log(`  重複参照: ${duplicateCount}件削除`);
  
  // 3. 異常に長い参照テキスト（200文字以上）を削除
  const longRefs = await prisma.$queryRaw<number>`
    DELETE FROM "Reference"
    WHERE LENGTH("referenceText") > 200
    RETURNING COUNT(*) as count
  `;
  
  console.log(`  異常に長い参照: ${longRefs || 0}件削除`);
  
  console.log('✅ クリーンアップ完了');
}

/**
 * 統計情報の出力
 */
function printStatistics(stats: ProcessStats) {
  const elapsed = ((stats.endTime || Date.now()) - stats.startTime) / 1000;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 処理完了');
  console.log('='.repeat(60));
  console.log(`法令数: ${stats.laws}`);
  console.log(`条文数: ${stats.articles}`);
  console.log(`項数: ${stats.paragraphs}`);
  console.log(`総参照数: ${stats.references}`);
  console.log(`  内部参照: ${stats.internalRefs}`);
  console.log(`  外部参照: ${stats.externalRefs}`);
  console.log(`  相対参照: ${stats.relativeRefs}`);
  if (stats.errors > 0) {
    console.log(`⚠️ エラー: ${stats.errors}件`);
  }
  console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
  console.log('='.repeat(60));
}

// 実行
if (require.main === module) {
  main();
}