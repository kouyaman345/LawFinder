#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

async function debug() {
  // テスト用の条文を取得
  const article = await prisma.article.findFirst({
    where: {
      lawId: '129AC0000000089',
      articleNumber: '十'
    },
    include: {
      paragraphs: true
    }
  });

  if (!article) {
    console.log('条文が見つかりません');
    return;
  }

  console.log('=== 第10条の内容 ===');
  console.log(article.content);
  console.log('\n=== 項の内容 ===');
  article.paragraphs.forEach((p, i) => {
    console.log(`項${i + 1}: ${p.content}`);
  });

  // 検出テスト
  console.log('\n=== 参照検出テスト ===');
  const refs = detector.detectAllReferences(article.content);
  console.log(`検出数: ${refs.length}`);
  
  refs.forEach((ref, i) => {
    console.log(`\n参照${i + 1}:`);
    console.log('  type:', ref.type);
    console.log('  text:', ref.text);
    console.log('  targetArticle:', ref.targetArticle);
    console.log('  confidence:', ref.confidence);
  });

  // データベースの参照を確認
  console.log('\n=== データベースの参照 ===');
  const dbRefs = await prisma.reference.findMany({
    where: {
      sourceLawId: '129AC0000000089',
      sourceArticle: '十'
    }
  });

  console.log(`DB参照数: ${dbRefs.length}`);
  dbRefs.forEach((ref, i) => {
    console.log(`\nDB参照${i + 1}:`);
    console.log('  referenceText:', ref.referenceText);
    console.log('  referenceType:', ref.referenceType);
    console.log('  targetArticle:', ref.targetArticle);
  });

  await prisma.$disconnect();
}

debug().catch(console.error);