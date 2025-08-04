import { LawId } from '@domain/value-objects';
import { ReferenceRepository, LawRepository } from '@domain/repositories';
export interface ImpactAnalysisOptions {
    depth?: number;
    includeIndirect?: boolean;
    confidenceThreshold?: number;
}
export interface ImpactedNode {
    nodeId: string;
    nodeType: string;
    impactType: ImpactType;
    impactPath: string[];
    confidence: number;
    depth: number;
}
export interface ImpactAnalysisResult {
    amendedLawId: string;
    amendedArticles: number[];
    summary: {
        totalAffectedLaws: number;
        totalAffectedArticles: number;
        directImpacts: number;
        indirectImpacts: number;
        maxDepthReached: number;
    };
    affectedItems: AffectedItem[];
    executedAt: Date;
}
export interface AffectedItem {
    lawId: string;
    lawTitle: string;
    affectedArticles: AffectedArticle[];
}
export interface AffectedArticle {
    articleId: string;
    articleNum: number;
    impactType: ImpactType;
    impactPath: string[];
    confidence: number;
}
export type ImpactType = 'DirectApplication' | 'TextReplacement' | 'LegalFiction' | 'Exception' | 'General';
export declare class ImpactAnalysisService {
    private readonly referenceRepository;
    private readonly lawRepository;
    constructor(referenceRepository: ReferenceRepository, lawRepository: LawRepository);
    analyzeAmendmentImpact(amendedLawId: LawId, amendedArticles: number[], options?: ImpactAnalysisOptions): Promise<ImpactAnalysisResult>;
    private determineImpactType;
    private buildAnalysisResult;
}
//# sourceMappingURL=ImpactAnalysisService.d.ts.map