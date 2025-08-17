#!/usr/bin/env npx tsx
/**
 * 参照登録スクリプト（改善版v3）
 * より包括的な参照検出を実現
 */

import { PrismaClient } from '@prisma/client';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const detector = new ImprovedReferenceDetector();

interface RegisterStats {
  laws: number;
  articles: number;
  paragraphs: number;
  references: number;
  internalRefs: number;
  externalRefs: number;
  relativeRefs: number;
  startTime: number;
}

async function registerReferences(lawId?: string) {
  console.log('🚀 参照データの登録を開始します（改善版v3 - より包括的）...\n');
  
  const stats: RegisterStats = {
    laws: 0,
    articles: 0,
    paragraphs: 0,
    references: 0,
    internalRefs: 0,
    externalRefs: 0,
    relativeRefs: 0,
    startTime: Date.now()
  };

  try {
    // 既存の参照データをクリア
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
          include: {
            paragraphs: true
          },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    const totalArticles = laws.reduce((sum, l) => sum + l.articles.length, 0);
    const totalParagraphs = laws.reduce((sum, l) => 
      sum + l.articles.reduce((s, a) => s + a.paragraphs.length, 0), 0
    );
    
    console.log(`  ${laws.length}法令、${totalArticles}条文、${totalParagraphs}項を処理します\n`);

    // 各法令を処理
    for (const law of laws) {
      console.log(`\n📖 ${law.title}（${law.id}）を処理中...`);
      stats.laws++;

      let lawReferences = 0;
      const referencesToCreate = [];
      const processedRefs = new Set<string>();

      for (const article of law.articles) {
        if (article.isDeleted) continue;
        
        stats.articles++;
        
        // 条文全体から参照を検出
        const articleRefs = detector.detectAllReferences(article.content);
        
        for (const ref of articleRefs) {
          const refKey = `${article.articleNumber}:${ref.text}:${ref.type}`;
          if (!processedRefs.has(refKey)) {
            processedRefs.add(refKey);
            const referenceData = createReferenceData(law.id, article.articleNumber, ref, stats);
            if (referenceData) {
              referencesToCreate.push(referenceData);
              lawReferences++;
            }
          }
        }
        
        // 各項からも参照を検出
        for (const paragraph of article.paragraphs) {
          stats.paragraphs++;
          
          const paragraphRefs = detector.detectAllReferences(paragraph.content);
          
          for (const ref of paragraphRefs) {
            const refKey = `${article.articleNumber}:${ref.text}:${ref.type}`;
            if (!processedRefs.has(refKey)) {
              processedRefs.add(refKey);
              const referenceData = createReferenceData(law.id, article.articleNumber, ref, stats);
              if (referenceData) {
                referencesToCreate.push(referenceData);
                lawReferences++;
              }
            }
          }
        }
      }

      // バッチ挿入
      if (referencesToCreate.length > 0) {
        await prisma.reference.createMany({
          data: referencesToCreate,
          skipDuplicates: true
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
    console.log(`項数: ${stats.paragraphs}`);
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

    // 最長参照の例を表示
    const longestRef = await prisma.reference.findFirst({
      orderBy: {
        referenceText: 'desc'
      }
    });
    
    if (longestRef) {
      console.log('\n📏 最も包括的な参照の例:');
      console.log(`  "${longestRef.referenceText}"`);
      console.log(`  長さ: ${longestRef.referenceText.length}文字`);
    }

  } catch (error) {
    console.error('\n❌ エラー:', error);
    throw error;
  }
}

function createReferenceData(lawId: string, articleNumber: string, ref: any, stats: RegisterStats): any {
  const referenceData: any = {
    sourceLawId: lawId,
    sourceArticle: articleNumber,
    referenceType: ref.type,
    referenceText: ref.text,
    confidence: ref.confidence,
    metadata: {}
  };

  // タイプ別の処理
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