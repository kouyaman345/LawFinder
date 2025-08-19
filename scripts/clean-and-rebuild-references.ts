#!/usr/bin/env tsx

/**
 * 参照データのクリーンアップと再構築
 * 誤検出を除外して正確な参照のみを抽出
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';

const prisma = new PrismaClient();

interface DetectedReference {
  type: string;
  text: string;
  targetLawId?: string | null;
  targetLawTitle?: string | null;
  targetArticle?: string | null;
  confidence: number;
  metadata?: any;
}

class CleanReferenceDetector {
  private lawCache: Map<string, string> = new Map();
  
  // 主要法令の正確なマッピング
  private readonly MAJOR_LAW_IDS: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '日本国憲法': '321CO0000000000',
    '憲法': '321CO0000000000',
    '行政手続法': '405AC0000000088',
    '行政事件訴訟法': '337AC0000000139',
    '地方自治法': '322AC0000000067',
    '国家公務員法': '322AC0000000120',
    '地方公務員法': '325AC0000000261',
    '所得税法': '340AC0000000033',
    '法人税法': '340AC0000000034',
    '消費税法': '363AC0000000108',
    '著作権法': '345AC0000000048',
    '特許法': '334AC0000000121',
    '商標法': '334AC0000000127',
  };

  async initialize() {
    // データベースから法令情報をキャッシュ
    const laws = await prisma.lawMaster.findMany({
      select: { id: true, title: true }
    });
    
    for (const law of laws) {
      if (law.title) {
        // 完全なタイトル
        this.lawCache.set(law.title, law.id);
        
        // 短縮形（括弧を除去）
        const shortTitle = law.title.replace(/（.+）/g, '').trim();
        if (shortTitle !== law.title) {
          this.lawCache.set(shortTitle, law.id);
        }
        
        // 「法」で終わる部分を抽出
        const lawMatch = law.title.match(/([^（）]+法)/);
        if (lawMatch) {
          this.lawCache.set(lawMatch[1], law.id);
        }
      }
    }
    
    console.log(`✅ ${laws.length}件の法令をキャッシュしました`);
  }

  detectReferences(content: string, sourceLawId: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    
    // 見出し（括弧のみ）を除外
    // 例：（納付方法）（区分経理の方法）などは参照ではない
    const cleanContent = content.replace(/^（[^）]+）$/gm, '');
    
    // 1. 明確な外部法令参照（法令名＋条文）
    // 例：民法第九十条、会社法第二条第一項
    const externalPattern = /([^（）、。\s]{2,}?法)(?:（[^）]+）)?(?:の)?第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?/g;
    let match;
    
    while ((match = externalPattern.exec(cleanContent)) !== null) {
      const lawName = match[1];
      const article = match[2];
      const subArticle = match[3];
      
      // 法令IDを特定
      const targetLawId = this.findLawId(lawName);
      
      if (targetLawId && targetLawId !== sourceLawId) {
        // 信頼度の高い外部参照
        references.push({
          type: 'external',
          text: match[0],
          targetLawId: targetLawId,
          targetLawTitle: lawName,
          targetArticle: `第${article}条${subArticle ? `の${subArticle}` : ''}`,
          confidence: 0.95,
          metadata: { lawName, article, subArticle }
        });
      }
    }
    
    // 2. 括弧内の明確な法令参照
    // 例：（民法第九十条）、（会社法）
    const parenthesisLawPattern = /（([^）]*?法)(?:第([一二三四五六七八九十百千]+)条)?）/g;
    
    while ((match = parenthesisLawPattern.exec(content)) !== null) {
      const lawName = match[1];
      const article = match[2];
      
      // 単なる説明文（「～の方法」など）を除外
      if (lawName.match(/(の方法|する法|よる法|定める法)$/)) {
        continue;
      }
      
      const targetLawId = this.findLawId(lawName);
      
      if (targetLawId && targetLawId !== sourceLawId) {
        references.push({
          type: 'external',
          text: match[0],
          targetLawId: targetLawId,
          targetLawTitle: lawName,
          targetArticle: article ? `第${article}条` : null,
          confidence: 0.9,
          metadata: { lawName, article, inParenthesis: true }
        });
      }
    }
    
    // 3. 内部参照（同一法令内の条文参照）
    // 前後に法令名がない「第○条」は内部参照
    const internalPattern = /(?<![法令].)第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?(?![^（]*法)/g;
    
    while ((match = internalPattern.exec(cleanContent)) !== null) {
      const article = match[1];
      const subArticle = match[2];
      
      // 前後50文字に法令名がないことを確認
      const beforeText = cleanContent.substring(Math.max(0, match.index - 50), match.index);
      const afterText = cleanContent.substring(match.index + match[0].length, Math.min(cleanContent.length, match.index + match[0].length + 50));
      
      if (!beforeText.match(/[^、。\s]+法/) && !afterText.match(/^[^、。\s]*法/)) {
        references.push({
          type: 'internal',
          text: match[0],
          targetLawId: sourceLawId,
          targetArticle: `第${article}条${subArticle ? `の${subArticle}` : ''}`,
          confidence: 0.85,
          metadata: { article, subArticle }
        });
      }
    }
    
    // 4. 相対参照（前条、次条など）
    const relativePatterns = [
      { pattern: /前条/g, type: 'relative', metadata: { direction: 'previous', unit: 'article' } },
      { pattern: /次条/g, type: 'relative', metadata: { direction: 'next', unit: 'article' } },
      { pattern: /前項/g, type: 'relative', metadata: { direction: 'previous', unit: 'paragraph' } },
      { pattern: /次項/g, type: 'relative', metadata: { direction: 'next', unit: 'paragraph' } },
      { pattern: /前各項/g, type: 'relative', metadata: { direction: 'previous', unit: 'paragraphs' } },
      { pattern: /同条/g, type: 'relative', metadata: { direction: 'same', unit: 'article' } },
      { pattern: /同項/g, type: 'relative', metadata: { direction: 'same', unit: 'paragraph' } }
    ];
    
    for (const { pattern, type, metadata } of relativePatterns) {
      while ((match = pattern.exec(cleanContent)) !== null) {
        references.push({
          type,
          text: match[0],
          targetLawId: sourceLawId,
          confidence: 0.8,
          metadata
        });
      }
    }
    
    // 5. 準用・適用（法的な参照関係）
    const applicationPattern = /([^。]{0,30})(準用|適用|読み替え)(?:する|される|して)/g;
    
    while ((match = applicationPattern.exec(cleanContent)) !== null) {
      // 前後の文脈から条文を抽出
      const context = match[1];
      const applicationType = match[2];
      
      if (context.includes('第') && context.includes('条')) {
        references.push({
          type: 'application',
          text: match[0],
          targetLawId: sourceLawId,
          confidence: 0.75,
          metadata: { applicationType, context }
        });
      }
    }
    
    return references;
  }

  private findLawId(lawName: string): string | null {
    // クリーンアップ
    lawName = lawName.trim();
    
    // 主要法令の直接マッピング
    if (this.MAJOR_LAW_IDS[lawName]) {
      return this.MAJOR_LAW_IDS[lawName];
    }
    
    // キャッシュから完全一致
    if (this.lawCache.has(lawName)) {
      return this.lawCache.get(lawName)!;
    }
    
    // 部分一致（より厳密に）
    for (const [title, id] of this.lawCache.entries()) {
      // 法令名が完全に含まれる場合のみ
      if (title === lawName || title.startsWith(lawName + '（') || title.endsWith('）' + lawName)) {
        return id;
      }
    }
    
    return null;
  }
}

async function cleanAndRebuild() {
  console.log('='.repeat(80));
  console.log('🧹 参照データのクリーンアップと再構築');
  console.log('='.repeat(80));
  
  const detector = new CleanReferenceDetector();
  await detector.initialize();
  
  try {
    // 1. 既存データをクリア
    console.log('\n🗑️ 既存の参照データをクリア...');
    await prisma.reference.deleteMany();
    console.log('✅ クリア完了');
    
    // 2. 法令データを取得
    const laws = await prisma.lawMaster.findMany();
    console.log(`\n📊 処理対象: ${laws.length}法令`);
    
    let totalReferences = 0;
    let externalCount = 0;
    let internalCount = 0;
    let processedLaws = 0;
    const batchSize = 500;
    const references: any[] = [];
    
    // 3. 各法令から参照を検出
    for (const law of laws) {
      processedLaws++;
      
      // 条文を取得
      const articles = await prisma.article.findMany({
        where: {
          versionId: {
            startsWith: law.id
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: 300 // メモリ対策
      });
      
      // 参照検出
      for (const article of articles) {
        const detectedRefs = detector.detectReferences(article.content, law.id);
        
        for (const ref of detectedRefs) {
          references.push({
            sourceVersionId: article.versionId,
            sourceLawId: law.id,
            sourceArticle: article.articleNumber,
            targetVersionId: null,
            targetLawId: ref.targetLawId,
            targetArticle: ref.targetArticle,
            referenceType: ref.type,
            referenceText: ref.text,
            confidence: ref.confidence,
            metadata: ref.metadata || {}
          });
          
          if (ref.type === 'external' && ref.targetLawId && ref.targetLawId !== law.id) {
            externalCount++;
          } else if (ref.type === 'internal') {
            internalCount++;
          }
          
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
      if (processedLaws % 100 === 0) {
        console.log(`[${processedLaws}/${laws.length}] 処理中... (総: ${totalReferences}, 外部: ${externalCount}, 内部: ${internalCount})`);
      }
    }
    
    // 残りを処理
    if (references.length > 0) {
      await prisma.reference.createMany({
        data: references,
        skipDuplicates: true
      });
      totalReferences += references.length;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ 参照データ再構築完了');
    console.log(`  総参照数: ${totalReferences}`);
    console.log(`  外部参照: ${externalCount}`);
    console.log(`  内部参照: ${internalCount}`);
    console.log('='.repeat(80));
    
    // 4. 統計確認
    const stats = await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true,
      orderBy: { _count: { referenceType: 'desc' } }
    });
    
    console.log('\n📊 参照タイプ別統計:');
    stats.forEach(stat => {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    });
    
    // 5. 誤検出の確認
    const suspiciousTarget = await prisma.$queryRaw`
      SELECT "targetLawId", COUNT(*) as count
      FROM "Reference"
      WHERE "targetLawId" IS NOT NULL
      GROUP BY "targetLawId"
      ORDER BY count DESC
      LIMIT 10
    ` as any[];
    
    console.log('\n📝 最も参照されている法令TOP10:');
    for (const target of suspiciousTarget) {
      const law = await prisma.lawMaster.findUnique({
        where: { id: target.targetLawId },
        select: { title: true }
      });
      console.log(`  ${law?.title || target.targetLawId}: ${target.count}件`);
    }
    
    // 特定の問題法令への参照を確認
    const problemLawRefs = await prisma.reference.count({
      where: { targetLawId: '507M60400000008' }
    });
    
    if (problemLawRefs > 100) {
      console.log(`\n⚠️ 警告: 507M60400000008への参照が${problemLawRefs}件残っています`);
    } else {
      console.log(`\n✅ 507M60400000008への誤検出を除去: ${problemLawRefs}件のみ`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理
cleanAndRebuild().catch(console.error);