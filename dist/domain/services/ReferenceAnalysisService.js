"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceAnalysisService = void 0;
const models_1 = require("@domain/models");
class ReferenceAnalysisService {
    patternMatcher;
    aiResolver;
    _referenceRepository;
    constructor(patternMatcher, aiResolver, _referenceRepository) {
        this.patternMatcher = patternMatcher;
        this.aiResolver = aiResolver;
        this._referenceRepository = _referenceRepository;
    }
    async analyzeArticle(article) {
        const references = [];
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
    async resolveReference(pattern, sourceArticle) {
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
    tryBasicResolution(pattern, sourceArticle) {
        // 明確なパターンの場合は直接解決
        if (pattern.type === 'ARTICLE' && pattern.confidence > 0.95) {
            // 簡単な実装例
            const articleNumMatch = pattern.text.match(/第(\d+)条/);
            if (articleNumMatch) {
                return models_1.Reference.create({
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
                    type: 'RELATE',
                    sourceText: pattern.text,
                    confidence: pattern.confidence
                });
            }
        }
        return null;
    }
    consolidateReferences(references) {
        // 同一参照の統合ロジック
        const grouped = new Map();
        for (const ref of references) {
            const key = `${ref.sourceNode.id}_${ref.targetNode.id}_${ref.referenceType}`;
            const group = grouped.get(key) || [];
            group.push(ref);
            grouped.set(key, group);
        }
        return Array.from(grouped.values()).map(group => {
            if (group.length === 1)
                return group[0];
            // 最も信頼度の高いものを選択
            return group.reduce((best, current) => current.referenceConfidence > best.referenceConfidence ? current : best);
        });
    }
}
exports.ReferenceAnalysisService = ReferenceAnalysisService;
//# sourceMappingURL=ReferenceAnalysisService.js.map