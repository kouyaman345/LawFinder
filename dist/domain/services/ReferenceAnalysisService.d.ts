import { Article, Reference } from '@domain/models';
import { ReferenceRepository } from '@domain/repositories';
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
export declare class ReferenceAnalysisService {
    private readonly patternMatcher;
    private readonly aiResolver;
    private readonly _referenceRepository;
    constructor(patternMatcher: PatternMatcher, aiResolver: AIReferenceResolver, _referenceRepository: ReferenceRepository);
    analyzeArticle(article: Article): Promise<Reference[]>;
    private resolveReference;
    private tryBasicResolution;
    private consolidateReferences;
}
//# sourceMappingURL=ReferenceAnalysisService.d.ts.map