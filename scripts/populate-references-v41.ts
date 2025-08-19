#!/usr/bin/env tsx

/**
 * 高精度参照検出スクリプト（V41エンジン使用）
 * 最新バージョンの法令から参照を検出してデータベースに投入
 */

import { PrismaClient } from '@prisma/client';
import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';

const prisma = new PrismaClient();
const detector = new EnhancedReferenceDetectorV41();

async function populateReferences() {
  console.log('='.repeat(80));
  console.log('📝 高精度参照検出 V41 開始');
  console.log('='.repeat(80));
  
  try {
    // 既存の参照データをクリア
    await prisma.reference.deleteMany();
    console.log('✅ 既存の参照データをクリアしました');
    
    // 最新バージョンの法令を取得
    const lawVersions = await prisma.lawVersion.findMany({
      where: { isLatest: true },
      include: {
        articles: {
          orderBy: { sortOrder: 'asc' }
        },
        lawMaster: true
      }
    });
    
    console.log(`📊 処理対象: ${lawVersions.length}法令`);
    
    let totalReferences = 0;
    let processedLaws = 0;
    const batchSize = 100;
    const references: any[] = [];
    
    for (const lawVersion of lawVersions) {
      const lawId = lawVersion.lawId;
      const lawTitle = lawVersion.lawMaster.title;
      
      processedLaws++;
      let lawReferences = 0;
      
      // 各条文から参照を検出
      for (const article of lawVersion.articles) {
        const detectedRefs = detector.detectAllReferences(
          article.content,
          {
            sourceLawId: lawId,
            sourceLawTitle: lawTitle,
            sourceArticle: article.articleNumber
          }
        );
        
        // 参照データを準備
        for (const ref of detectedRefs) {
          references.push({
            sourceVersionId: lawVersion.id,
            sourceLawId: lawId,
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
            await prisma.reference.createMany({
              data: references,
              skipDuplicates: true
            });
            totalReferences += references.length;
            references.length = 0;
          }
        }
      }
      
      // 進捗表示
      if (processedLaws % 10 === 0 || lawReferences > 0) {
        console.log(`[${processedLaws}/${lawVersions.length}] ${lawId}: ${lawReferences}件検出`);
      }
      
      if (processedLaws % 50 === 0) {
        console.log(`📊 進捗: ${Math.round(processedLaws / lawVersions.length * 100)}% | 総参照数: ${totalReferences}`);
      }
    }
    
    // 残りのデータを投入
    if (references.length > 0) {
      await prisma.reference.createMany({
        data: references,
        skipDuplicates: true
      });
      totalReferences += references.length;
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 参照データの投入が完了しました！');
    console.log(`  処理法令数: ${lawVersions.length}`);
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
    `;
    
    console.log('\n📊 参照先上位法令:');
    for (const target of topTargets as any[]) {
      console.log(`  ${target.targetLawId}: ${target.count}件`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理
populateReferences().catch(console.error);