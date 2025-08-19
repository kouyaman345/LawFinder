#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';

const prisma = new PrismaClient();
const detector = new ImprovedReferenceDetector();

async function testInsert() {
  console.log('参照データ投入テスト');
  
  // 商法第1条を取得
  const article = await prisma.article.findFirst({
    where: {
      versionId: '132AC0000000048_20230401',
      articleNumber: '1'
    }
  });
  
  if (!article) {
    console.log('条文が見つかりません');
    return;
  }
  
  console.log('条文内容:', article.content.substring(0, 100) + '...');
  
  // 参照を検出
  const refs = detector.detectAllReferences(article.content);
  console.log(`\n検出された参照: ${refs.length}件`);
  
  // 1件ずつ投入テスト
  for (const ref of refs) {
    console.log(`\n参照: ${ref.text}`);
    console.log(`  タイプ: ${ref.type}`);
    
    try {
      const data = {
        sourceVersionId: article.versionId,
        sourceLawId: '132AC0000000048',
        sourceArticle: article.articleNumber,
        targetVersionId: null,
        targetLawId: ref.targetLawId || null,
        targetArticle: ref.targetArticle || null,
        referenceType: ref.type,
        referenceText: ref.text,
        confidence: ref.confidence || 1.0,
        metadata: ref.metadata || {}
      };
      
      console.log('  投入データ:', JSON.stringify(data, null, 2));
      
      await prisma.reference.create({ data });
      console.log('  ✅ 投入成功');
    } catch (error: any) {
      console.error('  ❌ エラー:', error.message);
    }
  }
  
  // 投入結果を確認
  const count = await prisma.reference.count({
    where: {
      sourceLawId: '132AC0000000048',
      sourceArticle: '1'
    }
  });
  
  console.log(`\n商法第1条の参照: ${count}件`);
  
  await prisma.$disconnect();
}

testInsert().catch(console.error);