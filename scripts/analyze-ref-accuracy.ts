#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

async function analyzeReferences() {
  // 民法の最初の20条を分析
  const articles = await prisma.article.findMany({
    where: {
      lawId: '129AC0000000089',
    },
    orderBy: { sortOrder: 'asc' },
    take: 20,
    include: {
      paragraphs: true
    }
  });

  let totalRefsExpected = 0;
  let totalRefsInDB = 0;
  const mismatches: any[] = [];

  for (const article of articles) {
    const content = article.content;
    const detected = detector.detectAllReferences(content);
    
    const dbRefs = await prisma.reference.findMany({
      where: {
        sourceLawId: '129AC0000000089',
        sourceArticle: article.articleNumber
      }
    });

    totalRefsExpected += detected.length;
    totalRefsInDB += dbRefs.length;

    if (detected.length !== dbRefs.length) {
      mismatches.push({
        article: article.articleNumber,
        detected: detected.length,
        inDB: dbRefs.length,
        detectedTexts: detected.map(r => r.text),
        dbTexts: dbRefs.map(r => r.referenceText)
      });
    }
  }

  console.log('=== 参照検出精度分析 ===\n');
  console.log(`分析対象: 民法の最初の${articles.length}条`);
  console.log(`検出された参照総数: ${totalRefsExpected}`);
  console.log(`DBに登録された参照総数: ${totalRefsInDB}`);
  console.log(`精度: ${((totalRefsInDB / totalRefsExpected) * 100).toFixed(1)}%\n`);

  if (mismatches.length > 0) {
    console.log('=== 不一致のある条文 ===\n');
    for (const m of mismatches.slice(0, 5)) {
      console.log(`第${m.article}条: 検出=${m.detected}, DB=${m.inDB}`);
      if (m.detected > 0) {
        console.log('  検出:', m.detectedTexts.join(', '));
      }
      if (m.inDB > 0) {
        console.log('  DB:', m.dbTexts.join(', '));
      }
      console.log();
    }
  }

  // 参照タイプ別の統計
  const typeStats = await prisma.reference.groupBy({
    by: ['referenceType'],
    where: {
      sourceLawId: '129AC0000000089'
    },
    _count: true
  });

  console.log('=== 参照タイプ別統計（民法全体）===\n');
  for (const stat of typeStats) {
    console.log(`${stat.referenceType}: ${stat._count}件`);
  }

  await prisma.$disconnect();
}

analyzeReferences().catch(console.error);