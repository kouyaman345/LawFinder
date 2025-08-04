import { Article, Reference } from '@domain/models';
import { ReferenceRepository } from '@domain/repositories';
import { ReferenceType } from '@domain/value-objects';

export interface MatchedPattern {
  text: string;
  type: string;
  position: number;
  confidence: number;
}

export interface PatternMatcher {
  findPatterns(text: string): MatchedPattern[];
}

export interface AIReferenceResolver {
  resolve(pattern: MatchedPattern, article: Article): Promise<Reference | null>;
}

export class ReferenceAnalysisService {
  constructor(
    private readonly patternMatcher: PatternMatcher,
    private readonly aiResolver: AIReferenceResolver,
    private readonly _referenceRepository: ReferenceRepository
  ) {}

  async analyzeArticle(article: Article): Promise<Reference[]> {
    const references: Reference[] = [];
    
    // 1. パターンマッチング
    const patterns = this.patternMatcher.findPatterns(article.fullText);
    
    // 2. 参照解決
    for (const pattern of patterns) {
      const resolved = await this.resolveReference(pattern, article);
      if (resolved) {
        references.push(resolved);
      }
    }
    
    // 3. 重複除去と統合
    return this.consolidateReferences(references);
  }

  private async resolveReference(
    pattern: MatchedPattern,
    sourceArticle: Article
  ): Promise<Reference | null> {
    // 基本的な解決を試みる
    const basicResolution = this.tryBasicResolution(pattern, sourceArticle);
    
    if (basicResolution && basicResolution.referenceConfidence > 0.9) {
      return basicResolution;
    }
    
    // AI による解決
    const aiResolution = await this.aiResolver.resolve(pattern, sourceArticle);
    
    if (!aiResolution || aiResolution.referenceConfidence < 0.5) {
      return null; // 信頼度が低すぎる場合は除外
    }
    
    return aiResolution;
  }

  private tryBasicResolution(pattern: MatchedPattern, sourceArticle: Article): Reference | null {
    // 明確なパターンの場合は直接解決
    if (pattern.type === 'ARTICLE' && pattern.confidence > 0.95) {
      // 簡単な実装例
      const articleNumMatch = pattern.text.match(/第(\d+)条/);
      if (articleNumMatch) {
        return Reference.create({
          source: {
            type: 'article',
            id: sourceArticle.articleId,
            text: sourceArticle.fullText
          },
          target: {
            type: 'article',
            id: `${sourceArticle.articleId.split('_')[0]}_art${articleNumMatch[1]}`,
            text: ''
          },
          type: 'RELATE' as ReferenceType,
          sourceText: pattern.text,
          confidence: pattern.confidence
        });
      }
    }
    
    return null;
  }

  private consolidateReferences(references: Reference[]): Reference[] {
    // 同一参照の統合ロジック
    const grouped = new Map<string, Reference[]>();
    
    for (const ref of references) {
      const key = `${ref.sourceNode.id}_${ref.targetNode.id}_${ref.referenceType}`;
      const group = grouped.get(key) || [];
      group.push(ref);
      grouped.set(key, group);
    }
    
    return Array.from(grouped.values()).map(group => {
      if (group.length === 1) return group[0];
      
      // 最も信頼度の高いものを選択
      return group.reduce((best, current) => 
        current.referenceConfidence > best.referenceConfidence ? current : best
      );
    });
  }
}