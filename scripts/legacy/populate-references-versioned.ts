#!/usr/bin/env tsx

/**
 * バージョニング対応の参照検出・投入スクリプト
 * 最新バージョンの法令から参照を検出してデータベースに投入
 */

import { PrismaClient } from '@prisma/client';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

async function populateReferences() {
  console.log('='.repeat(80));
  console.log('📝 バージョニング対応 参照データの投入を開始します...');
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
        }
      }
    });
    
    console.log(`📊 処理対象: ${lawVersions.length}法令`);
    
    let totalReferences = 0;
    let processedLaws = 0;
    
    for (const lawVersion of lawVersions) {
      const lawId = lawVersion.lawId;
      console.log(`\n[${++processedLaws}/${lawVersions.length}] ${lawId} を処理中...`);
      
      let lawReferences = 0;
      
      // 各条文から参照を検出
      for (const article of lawVersion.articles) {
        const detectedRefs = detector.detectAllReferences(article.content);
        
        // 参照データを投入
        for (const ref of detectedRefs) {
          try {
            await prisma.reference.create({
              data: {
                sourceVersionId: lawVersion.id,
                sourceLawId: lawId,
                sourceArticle: article.articleNumber,
                targetVersionId: null, // TODO: ターゲットバージョンの解決
                targetLawId: ref.targetLawId,
                targetArticle: ref.targetArticle,
                referenceType: ref.type,
                referenceText: ref.text,
                confidence: ref.confidence || 1.0,
                metadata: ref.metadata || {}
              }
            });
            lawReferences++;
          } catch (error) {
            console.error(`  ⚠️ 参照の投入に失敗:`, error);
          }
        }
      }
      
      totalReferences += lawReferences;
      console.log(`  ✅ ${lawReferences}件の参照を検出`);
      
      // 進捗表示
      if (processedLaws % 10 === 0) {
        console.log(`\n📊 進捗: ${processedLaws}/${lawVersions.length} (${Math.round(processedLaws / lawVersions.length * 100)}%)`);
        console.log(`  総参照数: ${totalReferences}件`);
      }
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
      _count: true
    });
    
    console.log('\n📊 参照タイプ別統計:');
    for (const stat of stats) {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理
populateReferences().catch(console.error);