#!/usr/bin/env npx tsx
/**
 * PostgreSQLのReferenceテーブルに参照データを投入するスクリプト
 * 既存のスキーマに合わせたシンプルな実装
 */

import { PrismaClient } from '@prisma/client';
import { ReferenceDetector } from '../src/utils/reference-detector';

const prisma = new PrismaClient();
const detector = new ReferenceDetector();

async function populateReferences() {
  console.log('📝 参照データの投入を開始します...\n');
  
  try {
    // 既存の参照データをクリア
    await prisma.reference.deleteMany();
    console.log('✅ 既存の参照データをクリアしました');
    
    // 全法令を取得
    const laws = await prisma.law.findMany({
      include: {
        articles: {
          include: {
            paragraphs: true
          }
        }
      }
    });
    
    console.log(`📚 ${laws.length}件の法令を処理します\n`);
    
    let totalReferences = 0;
    
    for (const law of laws) {
      console.log(`\n処理中: ${law.title} (${law.articles.length}条文)`);
      let lawReferences = 0;
      
      for (const article of law.articles) {
        // 条文のテキストを結合
        let articleText = '';
        for (const paragraph of article.paragraphs) {
          articleText += paragraph.content + ' ';
        }
        
        // 参照を検出
        const references = detector.detectReferences(
          articleText,
          article.articleNumber
        );
        
        // 参照をデータベースに保存
        for (const ref of references) {
          const metadata: any = {};
          
          // メタデータを構築
          if (ref.relativeDirection) {
            metadata.relativeDirection = ref.relativeDirection;
          }
          if (ref.relativeCount) {
            metadata.relativeCount = ref.relativeCount;
          }
          if (ref.structureType) {
            metadata.structureType = ref.structureType;
          }
          if (ref.targetParagraphNumber) {
            metadata.targetParagraphNumber = ref.targetParagraphNumber;
          }
          if (ref.targetItemNumber) {
            metadata.targetItemNumber = ref.targetItemNumber;
          }
          
          await prisma.reference.create({
            data: {
              sourceLawId: law.id,
              sourceArticle: article.articleNumber,
              targetLawId: ref.targetLawId || null,
              targetArticle: ref.targetArticleNumber || null,
              referenceType: ref.type,
              referenceText: ref.sourceText,
              confidence: ref.confidence,
              metadata: Object.keys(metadata).length > 0 ? metadata : null
            }
          });
          
          lawReferences++;
          totalReferences++;
        }
      }
      
      console.log(`  → ${lawReferences}件の参照を検出`);
    }
    
    console.log(`\n✅ 完了: 合計${totalReferences}件の参照を登録しました`);
    
    // 統計情報を表示
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
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
populateReferences().catch(console.error);