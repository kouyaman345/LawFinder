"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpactAnalysisService = void 0;
const value_objects_1 = require("@domain/value-objects");
class ImpactAnalysisService {
    referenceRepository;
    lawRepository;
    constructor(referenceRepository, lawRepository) {
        this.referenceRepository = referenceRepository;
        this.lawRepository = lawRepository;
    }
    async analyzeAmendmentImpact(amendedLawId, amendedArticles, options = {}) {
        const depth = options.depth || 3;
        const includeIndirect = options.includeIndirect ?? true;
        const confidenceThreshold = options.confidenceThreshold || 0.7;
        const impactedNodes = new Map();
        const toProcess = [];
        // 初期ノードの設定
        for (const articleNum of amendedArticles) {
            const articleId = value_objects_1.ArticleId.generate(amendedLawId, articleNum);
            toProcess.push({
                nodeId: articleId.value,
                nodeType: 'article',
                depth: 0,
                path: [articleId.value]
            });
        }
        // 幅優先探索で影響を分析
        while (toProcess.length > 0) {
            const current = toProcess.shift();
            if (current.depth >= depth)
                continue;
            // 参照元を取得
            const references = await this.referenceRepository.findIncoming(current.nodeId, { minConfidence: confidenceThreshold });
            for (const ref of references) {
                const impactedId = ref.sourceNode.id;
                if (!impactedNodes.has(impactedId)) {
                    const impacted = {
                        nodeId: impactedId,
                        nodeType: ref.sourceNode.type,
                        impactType: this.determineImpactType(ref),
                        impactPath: [...current.path, impactedId],
                        confidence: ref.referenceConfidence * (0.9 ** current.depth),
                        depth: current.depth + 1
                    };
                    impactedNodes.set(impactedId, impacted);
                    if (includeIndirect) {
                        toProcess.push({
                            nodeId: impactedId,
                            nodeType: ref.sourceNode.type,
                            depth: current.depth + 1,
                            path: impacted.impactPath
                        });
                    }
                }
            }
        }
        return this.buildAnalysisResult(impactedNodes, amendedLawId, amendedArticles);
    }
    determineImpactType(reference) {
        switch (reference.referenceType) {
            case 'APPLY':
                return 'DirectApplication';
            case 'REPLACE':
                return 'TextReplacement';
            case 'DEEM':
                return 'LegalFiction';
            case 'EXCEPT':
                return 'Exception';
            default:
                return 'General';
        }
    }
    async buildAnalysisResult(impactedNodes, amendedLawId, amendedArticles) {
        const affectedByLaw = new Map();
        let maxDepth = 0;
        let directCount = 0;
        let indirectCount = 0;
        for (const [_, node] of impactedNodes) {
            maxDepth = Math.max(maxDepth, node.depth);
            if (node.depth === 1) {
                directCount++;
            }
            else {
                indirectCount++;
            }
            const lawId = node.nodeId.split('_')[0];
            const articles = affectedByLaw.get(lawId) || [];
            if (node.nodeType === 'article') {
                articles.push({
                    articleId: node.nodeId,
                    articleNum: parseInt(node.nodeId.split('_art')[1]),
                    impactType: node.impactType,
                    impactPath: node.impactPath,
                    confidence: node.confidence
                });
            }
            affectedByLaw.set(lawId, articles);
        }
        const affectedItems = [];
        for (const [lawId, articles] of affectedByLaw) {
            const law = await this.lawRepository.findById(new value_objects_1.LawId(lawId));
            if (law) {
                affectedItems.push({
                    lawId: lawId,
                    lawTitle: law.lawTitle,
                    affectedArticles: articles
                });
            }
        }
        return {
            amendedLawId: amendedLawId.value,
            amendedArticles: amendedArticles,
            summary: {
                totalAffectedLaws: affectedByLaw.size,
                totalAffectedArticles: impactedNodes.size,
                directImpacts: directCount,
                indirectImpacts: indirectCount,
                maxDepthReached: maxDepth
            },
            affectedItems: affectedItems,
            executedAt: new Date()
        };
    }
}
exports.ImpactAnalysisService = ImpactAnalysisService;
//# sourceMappingURL=ImpactAnalysisService.js.map