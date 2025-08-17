#!/usr/bin/env npx tsx
/**
 * 参照登録スクリプト
 * 法令データから参照を検出してデータベースに登録
 */

import { PrismaClient } from '@prisma/client';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

interface RegisterStats {
  laws: number;
  articles: number;
  references: number;
  internalRefs: number;
  externalRefs: number;
  relativeRefs: number;
  startTime: number;
}

async function registerReferences(lawId?: string) {
  console.log('🚀 参照データの登録を開始します...\n');
  
  const stats: RegisterStats = {
    laws: 0,
    articles: 0,
    references: 0,
    internalRefs: 0,
    externalRefs: 0,
    relativeRefs: 0,
    startTime: Date.now()
  };

  try {
    // 既存の参照データをクリア（指定された法令のみ、または全て）
    if (lawId) {
      console.log(`🗑️  法令 ${lawId} の既存参照データをクリア中...`);
      await prisma.reference.deleteMany({
        where: { sourceLawId: lawId }
      });
    } else {
      console.log('🗑️  全ての既存参照データをクリア中...');
      await prisma.reference.deleteMany();
    }

    // 法令データの取得
    console.log('📚 法令データを取得中...');
    const laws = await prisma.law.findMany({
      where: lawId ? { id: lawId } : undefined,
      include: {
        articles: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    console.log(`  ${laws.length}法令、${laws.reduce((sum, l) => sum + l.articles.length, 0)}条文を処理します\n`);

    // 各法令を処理
    for (const law of laws) {
      console.log(`\n📖 ${law.title}（${law.id}）を処理中...`);
      stats.laws++;

      let lawReferences = 0;
      const referencesToCreate = [];

      for (const article of law.articles) {
        if (article.isDeleted) continue;
        
        stats.articles++;
        
        // 参照検出
        const references = detector.detectAllReferences(article.content);
        
        for (const ref of references) {
          const referenceData: any = {
            sourceLawId: law.id,
            sourceArticle: article.articleNumber,
            referenceType: ref.type,
            referenceText: ref.text,
            confidence: ref.confidence,
            metadata: {}
          };

          // タイプ別の処理
          switch (ref.type) {
            case 'internal':
              // 内部参照
              referenceData.targetLawId = law.id;
              referenceData.targetArticle = ref.targetArticle || null;
              stats.internalRefs++;
              break;

            case 'external':
              // 外部参照
              referenceData.targetLawId = ref.targetLaw || null;
              referenceData.targetArticle = ref.targetArticle || null;
              referenceData.metadata.lawName = ref.targetLaw;
              stats.externalRefs++;
              break;

            case 'relative':
              // 相対参照
              referenceData.metadata.relativeType = ref.relativeType;
              referenceData.metadata.distance = ref.relativeDistance;
              
              // 相対参照の解決を試みる
              if (ref.relativeType === 'previous' && ref.relativeDistance) {
                const currentArticleNum = parseInt(article.articleNumber.replace(/[^0-9]/g, ''));
                const targetArticleNum = currentArticleNum - ref.relativeDistance;
                if (targetArticleNum > 0) {
                  referenceData.targetLawId = law.id;
                  referenceData.targetArticle = `第${targetArticleNum}条`;
                }
              } else if (ref.relativeType === 'next' && ref.relativeDistance) {
                const currentArticleNum = parseInt(article.articleNumber.replace(/[^0-9]/g, ''));
                const targetArticleNum = currentArticleNum + ref.relativeDistance;
                referenceData.targetLawId = law.id;
                referenceData.targetArticle = `第${targetArticleNum}条`;
              }
              stats.relativeRefs++;
              break;

            case 'range':
              // 範囲参照
              referenceData.metadata.rangeStart = ref.rangeStart;
              referenceData.metadata.rangeEnd = ref.rangeEnd;
              break;

            case 'multiple':
              // 複数参照
              referenceData.metadata.targets = ref.targets;
              break;

            case 'structural':
              // 構造参照（項、号など）
              referenceData.metadata.structureType = ref.structureType;
              referenceData.metadata.structureNumber = ref.structureNumber;
              break;

            case 'application':
              // 準用・適用参照
              referenceData.metadata.applicationType = ref.applicationType;
              break;
          }

          referencesToCreate.push(referenceData);
          lawReferences++;
        }
      }

      // バッチ挿入
      if (referencesToCreate.length > 0) {
        await prisma.reference.createMany({
          data: referencesToCreate
        });
        stats.references += referencesToCreate.length;
      }

      console.log(`  ✅ ${law.articles.length}条、${lawReferences}参照を登録`);
    }

    // 統計表示
    const elapsed = (Date.now() - stats.startTime) / 1000;
    console.log('\n' + '='.repeat(60));
    console.log('📊 参照登録完了');
    console.log('='.repeat(60));
    console.log(`法令数: ${stats.laws}`);
    console.log(`条文数: ${stats.articles}`);
    console.log(`総参照数: ${stats.references}`);
    console.log(`  内部参照: ${stats.internalRefs}`);
    console.log(`  外部参照: ${stats.externalRefs}`);
    console.log(`  相対参照: ${stats.relativeRefs}`);
    console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
    console.log('='.repeat(60));

    // データベース統計
    const dbStats = await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true
    });

    console.log('\n📈 データベース統計:');
    for (const stat of dbStats) {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    }

  } catch (error) {
    console.error('\n❌ エラー:', error);
    throw error;
  }
}

// メイン実行
if (require.main === module) {
  const lawId = process.argv[2];
  
  registerReferences(lawId)
    .then(async () => {
      console.log('\n✅ 参照登録が完了しました！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ エラー:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { registerReferences };