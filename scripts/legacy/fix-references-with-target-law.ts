#!/usr/bin/env tsx

/**
 * 参照検出を修正してtargetLawIdを正しく抽出する
 * 外部参照の対象法令を特定して相互参照を可能にする
 */

import { PrismaClient } from '@prisma/client';

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

class FixedReferenceDetector {
  // 法令名パターンのマッピング（法令名から法令IDを推定）
  private readonly LAW_NAME_PATTERNS: Record<string, RegExp> = {
    '民法': /民法/,
    '刑法': /刑法/,
    '商法': /商法/,
    '会社法': /会社法/,
    '労働基準法': /労働基準法/,
    '民事訴訟法': /民事訴訟法/,
    '刑事訴訟法': /刑事訴訟法/,
    '憲法': /憲法|日本国憲法/,
    '行政法': /行政法/,
    '税法': /税法|所得税法|法人税法|消費税法/,
    '労働契約法': /労働契約法/,
    '著作権法': /著作権法/,
    '特許法': /特許法/,
    '破産法': /破産法/,
    '民事執行法': /民事執行法/,
  };

  // 既知の主要法令IDマッピング
  private readonly KNOWN_LAW_IDS: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '日本国憲法': '321CO0000000000',
    '憲法': '321CO0000000000',
  };

  private lawCache: Map<string, string> = new Map();

  async initialize() {
    // 法令タイトルとIDのキャッシュを作成
    const laws = await prisma.lawMaster.findMany({
      select: { id: true, title: true }
    });
    
    for (const law of laws) {
      // タイトルから法令を特定しやすくする
      const shortTitle = this.extractShortTitle(law.title);
      this.lawCache.set(shortTitle, law.id);
      this.lawCache.set(law.title, law.id);
    }
    
    console.log(`✅ ${laws.length}件の法令をキャッシュしました`);
  }

  private extractShortTitle(fullTitle: string): string {
    // 括弧内の情報を除去して短縮名を取得
    const match = fullTitle.match(/^([^（]+)/);
    return match ? match[1].trim() : fullTitle;
  }

  detectReferences(content: string, sourceLawId: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    
    // 1. 外部法令参照（法令名＋条文）
    const externalPattern = /([^（）、。\s]+?法)(?:（[^）]+）)?(?:の)?第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?/g;
    let match;
    
    while ((match = externalPattern.exec(content)) !== null) {
      const lawName = match[1];
      const article = match[2];
      const subArticle = match[3];
      
      // 法令IDを特定
      const targetLawId = this.findLawId(lawName);
      
      if (targetLawId && targetLawId !== sourceLawId) {
        references.push({
          type: 'external',
          text: match[0],
          targetLawId: targetLawId,
          targetLawTitle: lawName,
          targetArticle: `第${article}条${subArticle ? `の${subArticle}` : ''}`,
          confidence: 0.9,
          metadata: { lawName, article, subArticle }
        });
      }
    }
    
    // 2. 内部参照（条文のみ、同一法令内）
    const internalPattern = /(?<!法)第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?(?!.*法)/g;
    
    while ((match = internalPattern.exec(content)) !== null) {
      const article = match[1];
      const subArticle = match[2];
      
      // 前後に法令名がない場合は内部参照
      const beforeText = content.substring(Math.max(0, match.index - 50), match.index);
      const afterText = content.substring(match.index + match[0].length, Math.min(content.length, match.index + match[0].length + 50));
      
      if (!beforeText.match(/[^、。\s]+法/) && !afterText.match(/の[^、。\s]+法/)) {
        references.push({
          type: 'internal',
          text: match[0],
          targetLawId: sourceLawId,
          targetArticle: `第${article}条${subArticle ? `の${subArticle}` : ''}`,
          confidence: 0.8,
          metadata: { article, subArticle }
        });
      }
    }
    
    // 3. 括弧内の法令参照（例：（労働基準法第三十六条））
    const parenthesisPattern = /（([^）]+法)(?:第([一二三四五六七八九十百千]+)条)?）/g;
    
    while ((match = parenthesisPattern.exec(content)) !== null) {
      const lawName = match[1];
      const article = match[2];
      
      const targetLawId = this.findLawId(lawName);
      
      if (targetLawId && targetLawId !== sourceLawId) {
        references.push({
          type: 'external',
          text: match[0],
          targetLawId: targetLawId,
          targetLawTitle: lawName,
          targetArticle: article ? `第${article}条` : null,
          confidence: 0.85,
          metadata: { lawName, article, inParenthesis: true }
        });
      }
    }
    
    // 4. 相対参照
    const relativePatterns = [
      { pattern: /前条/g, type: 'relative' },
      { pattern: /次条/g, type: 'relative' },
      { pattern: /前項/g, type: 'relative' },
      { pattern: /次項/g, type: 'relative' },
      { pattern: /同条/g, type: 'relative' },
      { pattern: /同項/g, type: 'relative' }
    ];
    
    for (const { pattern, type } of relativePatterns) {
      while ((match = pattern.exec(content)) !== null) {
        references.push({
          type: type,
          text: match[0],
          targetLawId: sourceLawId,
          confidence: 0.7,
          metadata: { relativeType: match[0] }
        });
      }
    }
    
    // 5. 構造参照（章、節など）
    const structurePattern = /第([一二三四五六七八九十]+)(編|章|節|款|目)/g;
    
    while ((match = structurePattern.exec(content)) !== null) {
      references.push({
        type: 'structural',
        text: match[0],
        targetLawId: sourceLawId,
        confidence: 0.7,
        metadata: { structureType: match[2], structureNumber: match[1] }
      });
    }
    
    // 6. 準用・適用
    const applicationPattern = /(準用|適用|読み替え)(?:する|される|して)/g;
    
    while ((match = applicationPattern.exec(content)) !== null) {
      references.push({
        type: 'application',
        text: match[0],
        targetLawId: sourceLawId,
        confidence: 0.6,
        metadata: { applicationType: match[1] }
      });
    }
    
    return references;
  }

  private findLawId(lawName: string): string | null {
    // 既知の法令IDをチェック
    if (this.KNOWN_LAW_IDS[lawName]) {
      return this.KNOWN_LAW_IDS[lawName];
    }
    
    // キャッシュから検索
    if (this.lawCache.has(lawName)) {
      return this.lawCache.get(lawName)!;
    }
    
    // 部分一致で検索
    for (const [title, id] of this.lawCache.entries()) {
      if (title.includes(lawName) || lawName.includes(title)) {
        return id;
      }
    }
    
    return null;
  }
}

async function fixAndPopulateReferences() {
  console.log('='.repeat(80));
  console.log('🔧 参照検出の修正と再生成');
  console.log('='.repeat(80));
  
  const detector = new FixedReferenceDetector();
  await detector.initialize();
  
  try {
    // 既存の参照データをクリア
    console.log('既存の参照データをクリア中...');
    await prisma.reference.deleteMany();
    console.log('✅ クリア完了');
    
    // 法令マスターを取得
    const laws = await prisma.lawMaster.findMany();
    console.log(`📊 処理対象: ${laws.length}法令`);
    
    let totalReferences = 0;
    let externalReferences = 0;
    let processedLaws = 0;
    const batchSize = 500;
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
        take: 500 // メモリ対策
      });
      
      // 各条文から参照を検出
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
            externalReferences++;
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
        console.log(`[${processedLaws}/${laws.length}] 処理中... (総参照: ${totalReferences}, 外部: ${externalReferences})`);
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
    console.log('✅ 参照データの修正完了！');
    console.log(`  処理法令数: ${laws.length}`);
    console.log(`  総参照数: ${totalReferences}`);
    console.log(`  外部参照数: ${externalReferences}`);
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
    
    // 外部参照の確認
    const externalRefs = await prisma.reference.findMany({
      where: {
        referenceType: 'external',
        targetLawId: {
          not: null
        },
        NOT: {
          sourceLawId: {
            equals: prisma.reference.fields.targetLawId
          }
        }
      },
      take: 10
    });
    
    console.log('\n📝 外部参照サンプル:');
    for (const ref of externalRefs) {
      if (ref.sourceLawId !== ref.targetLawId) {
        const sourceLaw = await prisma.lawMaster.findUnique({
          where: { id: ref.sourceLawId },
          select: { title: true }
        });
        const targetLaw = ref.targetLawId ? await prisma.lawMaster.findUnique({
          where: { id: ref.targetLawId },
          select: { title: true }
        }) : null;
        
        console.log(`  ${sourceLaw?.title} → ${targetLaw?.title || ref.targetLawId}`);
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理
fixAndPopulateReferences().catch(console.error);