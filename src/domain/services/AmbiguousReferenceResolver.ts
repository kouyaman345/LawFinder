/**
 * 曖昧な参照関係の解決サービス
 * 政令などの曖昧な参照を逆引きやLLMで解決
 */

import { PrismaClient } from '@prisma/client';

interface AmbiguousPattern {
  type: string;
  forwardPattern: RegExp;  // 参照元のパターン
  reversePattern: RegExp;  // 参照先のパターン
  requiresLLM: boolean;
  confidence: number;
}

export class AmbiguousReferenceResolver {
  private prisma: PrismaClient;
  
  // 曖昧な参照パターンのカタログ
  private ambiguousPatterns: AmbiguousPattern[] = [
    {
      type: '政令委任',
      forwardPattern: /政令で(?:定める|規定する|委任する)/,
      reversePattern: /(.+法)(?:の規定に基づき|に基づく|により)/,
      requiresLLM: true,
      confidence: 0.6
    },
    {
      type: '省令委任',
      forwardPattern: /(?:主務)?省令で(?:定める|規定する)/,
      reversePattern: /(.+法)(?:第\d+条)?.*省令/,
      requiresLLM: true,
      confidence: 0.5
    },
    {
      type: '規則委任',
      forwardPattern: /(?:内閣府令|規則)で(?:定める|規定する)/,
      reversePattern: /(.+法).*(?:規則|内閣府令)/,
      requiresLLM: true,
      confidence: 0.5
    },
    {
      type: '告示委任',
      forwardPattern: /告示で(?:定める|規定する)/,
      reversePattern: /(.+)に関する告示/,
      requiresLLM: true,
      confidence: 0.4
    },
    {
      type: '別表参照',
      forwardPattern: /別表(?:第[一二三四五六七八九十]+)?(?:に掲げる|による)/,
      reversePattern: null,
      requiresLLM: false,  // 同一法令内なのでLLM不要
      confidence: 0.9
    },
    {
      type: '附則参照',
      forwardPattern: /附則(?:第[一二三四五六七八九十]+条)?/,
      reversePattern: null,
      requiresLLM: false,
      confidence: 0.9
    },
    {
      type: '条約参照',
      forwardPattern: /条約(?:第[一二三四五六七八九十]+条)?/,
      reversePattern: /(.+)(?:条約|協定|議定書)/,
      requiresLLM: true,
      confidence: 0.5
    },
    {
      type: '協定参照',
      forwardPattern: /(?:協定|取決め)(?:により|に基づき)/,
      reversePattern: /(.+)(?:協定|取決め)/,
      requiresLLM: true,
      confidence: 0.4
    },
    {
      type: '最高裁判所規則',
      forwardPattern: /最高裁判所規則で(?:定める|規定する)/,
      reversePattern: /最高裁判所.*規則/,
      requiresLLM: true,
      confidence: 0.6
    },
    {
      type: '人事院規則',
      forwardPattern: /人事院規則で(?:定める|規定する)/,
      reversePattern: /人事院規則/,
      requiresLLM: true,
      confidence: 0.6
    },
    {
      type: '地方公共団体条例',
      forwardPattern: /(?:都道府県|市町村|地方公共団体)の条例で(?:定める|規定する)/,
      reversePattern: /(.+)条例/,
      requiresLLM: true,
      confidence: 0.3  // 地方条例は多数存在するため信頼度低
    },
    {
      type: '基準・指針参照',
      forwardPattern: /(?:基準|指針|ガイドライン)(?:により|に従い)/,
      reversePattern: /(.+)(?:基準|指針|ガイドライン)/,
      requiresLLM: true,
      confidence: 0.3
    },
    {
      type: '前法参照',
      forwardPattern: /(?:旧|改正前の?)(.+法)/,
      reversePattern: null,
      requiresLLM: true,
      confidence: 0.7
    },
    {
      type: '他法準用',
      forwardPattern: /(.+法).*の規定を準用する/,
      reversePattern: null,
      requiresLLM: false,
      confidence: 0.8
    }
  ];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 曖昧な参照パターンを検出
   */
  async detectAmbiguousReferences(lawId: string, content: string): Promise<any[]> {
    const ambiguousRefs = [];
    
    for (const pattern of this.ambiguousPatterns) {
      if (pattern.forwardPattern.test(content)) {
        const matches = content.matchAll(pattern.forwardPattern);
        for (const match of matches) {
          ambiguousRefs.push({
            lawId,
            type: pattern.type,
            text: match[0],
            requiresLLM: pattern.requiresLLM,
            confidence: pattern.confidence,
            detectionMethod: 'forward'
          });
        }
      }
    }
    
    return ambiguousRefs;
  }

  /**
   * 政令・省令の逆引き参照解決
   */
  async resolveDecreeReferences(): Promise<void> {
    console.log('🔍 政令・省令の逆引き参照解決を開始...');
    
    // 政令・省令を取得
    const decrees = await this.prisma.lawMaster.findMany({
      where: {
        OR: [
          { id: { contains: 'CO' }},  // Cabinet Order
          { id: { contains: 'M' }},   // Ministry Order
          { title: { contains: '政令' }},
          { title: { contains: '施行令' }},
          { title: { contains: '施行規則' }},
          { title: { contains: '省令' }}
        ]
      }
    });
    
    console.log(`📋 ${decrees.length}件の政令・省令を処理`);
    
    for (const decree of decrees) {
      // 1. タイトルから親法令を推定
      const parentLaw = await this.inferParentLawFromTitle(decree.title);
      
      if (parentLaw) {
        // 2. XMLコンテンツから根拠条文を探す
        const version = await this.prisma.lawVersion.findFirst({
          where: { lawId: decree.id, isLatest: true }
        });
        
        if (version) {
          const basisArticles = this.findBasisArticles(version.xmlContent);
          
          // 3. 参照関係を作成（逆引き）
          for (const article of basisArticles) {
            await this.createReverseReference(
              parentLaw.id,
              decree.id,
              article,
              decree.title
            );
          }
        }
      }
    }
  }

  /**
   * タイトルから親法令を推定
   */
  private async inferParentLawFromTitle(title: string): Promise<any> {
    const patterns = [
      // "○○法施行令" → "○○法"
      /^(.+法)施行令$/,
      /^(.+法)施行規則$/,
      /^(.+法)の施行に関する(?:政令|省令)$/,
      /^(.+)に関する(?:政令|省令|規則)$/,
      /^(.+法)第.+条.*の(?:政令|省令)$/
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const parentTitle = match[1];
        
        // データベースから該当法令を検索
        const parentLaw = await this.prisma.lawMaster.findFirst({
          where: {
            OR: [
              { title: parentTitle },
              { title: { contains: parentTitle }}
            ]
          }
        });
        
        if (parentLaw) {
          console.log(`✅ 親法令を特定: ${title} → ${parentLaw.title}`);
          return parentLaw;
        }
      }
    }
    
    return null;
  }

  /**
   * XMLから根拠条文を抽出
   */
  private findBasisArticles(xmlContent: string): string[] {
    const articles = [];
    const patterns = [
      /(.+法)第([一二三四五六七八九十百千万\d]+)条/g,
      /(.+法).*の規定に基づき/g,
      /(.+法).*により/g
    ];
    
    for (const pattern of patterns) {
      const matches = xmlContent.matchAll(pattern);
      for (const match of matches) {
        if (match[2]) {
          articles.push(`第${match[2]}条`);
        }
      }
    }
    
    return [...new Set(articles)];  // 重複を除去
  }

  /**
   * 逆引き参照を作成
   */
  private async createReverseReference(
    parentLawId: string,
    decreeLawId: string,
    article: string,
    decreeTitle: string
  ): Promise<void> {
    // 参照関係を作成
    await this.prisma.reference.create({
      data: {
        sourceLawId: parentLawId,
        sourceArticle: article || '全体',
        targetLawId: decreeLawId,
        targetArticle: '全体',
        referenceType: 'delegation',  // 委任関係
        referenceText: `${decreeTitle}への委任`,
        confidence: 0.8,
        detectionMethod: 'reverse',  // 逆引き
        requiresLLMCheck: true,      // LLMチェック必須
        isAmbiguous: true,           // 曖昧な参照
        metadata: {
          method: 'title_inference',
          decreeTitle: decreeTitle
        }
      }
    });
  }

  /**
   * LLMによる参照関係の検証
   */
  async validateWithLLM(referenceId: string): Promise<void> {
    const reference = await this.prisma.reference.findUnique({
      where: { id: referenceId }
    });
    
    if (!reference || !reference.requiresLLMCheck) {
      return;
    }
    
    // LLMに検証を依頼
    const prompt = `
以下の法令間の参照関係が正しいか検証してください：

参照元: ${reference.sourceLawId} ${reference.sourceArticle}
参照先: ${reference.targetLawId} ${reference.targetArticle}
参照タイプ: ${reference.referenceType}
検出方法: ${reference.detectionMethod}

この参照関係は妥当ですか？信頼度スコア（0-1）と理由を回答してください。
`;
    
    try {
      // Ollama APIを呼び出し
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral',
          prompt: prompt,
          stream: false
        })
      });
      
      const result = await response.json();
      
      // LLMの結果を保存
      await this.prisma.reference.update({
        where: { id: referenceId },
        data: {
          llmCheckResult: result,
          llmCheckedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error('LLM検証エラー:', error);
    }
  }

  /**
   * 全体の曖昧性分析レポート
   */
  async generateAmbiguityReport(): Promise<any> {
    const stats = {
      totalReferences: 0,
      ambiguousReferences: 0,
      requiresLLMCheck: 0,
      byType: {},
      byDetectionMethod: {}
    };
    
    // 統計を収集
    const references = await this.prisma.reference.findMany({
      where: { isAmbiguous: true }
    });
    
    stats.totalReferences = await this.prisma.reference.count();
    stats.ambiguousReferences = references.length;
    stats.requiresLLMCheck = await this.prisma.reference.count({
      where: { requiresLLMCheck: true }
    });
    
    // タイプ別集計
    for (const ref of references) {
      stats.byType[ref.referenceType] = (stats.byType[ref.referenceType] || 0) + 1;
      stats.byDetectionMethod[ref.detectionMethod] = (stats.byDetectionMethod[ref.detectionMethod] || 0) + 1;
    }
    
    return {
      ...stats,
      ambiguityRate: (stats.ambiguousReferences / stats.totalReferences * 100).toFixed(2) + '%',
      patterns: this.ambiguousPatterns.map(p => ({
        type: p.type,
        requiresLLM: p.requiresLLM,
        baseConfidence: p.confidence
      }))
    };
  }
}

export default AmbiguousReferenceResolver;