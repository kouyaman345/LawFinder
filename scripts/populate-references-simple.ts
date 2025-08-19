#!/usr/bin/env tsx

/**
 * シンプルな参照検出スクリプト
 * XMLコンテンツを除外して効率的に処理
 */

import { PrismaClient } from '@prisma/client';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';

const prisma = new PrismaClient();
const detector = new ImprovedReferenceDetector();

async function populateReferences() {
  console.log('='.repeat(80));
  console.log('📝 参照検出開始（シンプル版）');
  console.log('='.repeat(80));
  
  try {
    // 既存の参照データをクリア
    await prisma.reference.deleteMany();
    console.log('✅ 既存の参照データをクリアしました');
    
    // 法令マスターを取得
    const laws = await prisma.lawMaster.findMany();
    console.log(`📊 処理対象: ${laws.length}法令`);
    
    let totalReferences = 0;
    let processedLaws = 0;
    const batchSize = 1000;
    const references: any[] = [];
    
    for (const law of laws) {
      processedLaws++;
      
      // 最新バージョンの条文を取得
      const articles = await prisma.article.findMany({
        where: {
          versionId: {
            startsWith: law.id
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: 1000 // メモリ対策
      });
      
      let lawReferences = 0;
      
      // 各条文から参照を検出
      for (const article of articles) {
        const detectedRefs = detector.detectAllReferences(article.content);
        
        // 参照データを準備
        for (const ref of detectedRefs) {
          references.push({
            sourceVersionId: article.versionId,
            sourceLawId: law.id,
            sourceArticle: article.articleNumber,
            targetVersionId: null,
            targetLawId: ref.targetLawId || null,
            targetArticle: ref.targetArticle || null,
            referenceType: ref.type,
            referenceText: ref.text,
            confidence: ref.confidence || 1.0,
            metadata: ref.metadata || {}
          });
          
          lawReferences++;
          
          // バッチ処理
          if (references.length >= batchSize) {
            try {
              await prisma.reference.createMany({
                data: references,
                skipDuplicates: true
              });
              totalReferences += references.length;
            } catch (error) {
              console.error('バッチ投入エラー:', error);
            }
            references.length = 0;
          }
        }
      }
      
      // 進捗表示
      if (processedLaws % 100 === 0 || lawReferences > 0) {
        console.log(`[${processedLaws}/${laws.length}] ${law.id}: ${lawReferences}件検出 (累計: ${totalReferences}件)`);
      }
    }
    
    // 残りのデータを投入
    if (references.length > 0) {
      try {
        await prisma.reference.createMany({
          data: references,
          skipDuplicates: true
        });
        totalReferences += references.length;
      } catch (error) {
        console.error('最終バッチ投入エラー:', error);
      }
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 参照データの投入が完了しました！');
    console.log(`  処理法令数: ${laws.length}`);
    console.log(`  総参照数: ${totalReferences}`);
    console.log('='.repeat(80));
    
    // 統計情報
    const stats = await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true,
      orderBy: { _count: { referenceType: 'desc' } }
    });
    
    console.log('\n📊 参照タイプ別統計:');
    for (const stat of stats) {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    }
    
    // 上位参照法令
    const topTargets = await prisma.$queryRaw`
      SELECT "targetLawId", COUNT(*) as count
      FROM "Reference"
      WHERE "targetLawId" IS NOT NULL
      GROUP BY "targetLawId"
      ORDER BY count DESC
      LIMIT 10
    ` as any[];
    
    if (topTargets.length > 0) {
      console.log('\n📊 参照先上位法令:');
      for (const target of topTargets) {
        const targetLaw = await prisma.lawMaster.findUnique({
          where: { id: target.targetLawId },
          select: { title: true }
        });
        console.log(`  ${target.targetLawId} (${targetLaw?.title || '不明'}): ${target.count}件`);
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理
populateReferences().catch(console.error);