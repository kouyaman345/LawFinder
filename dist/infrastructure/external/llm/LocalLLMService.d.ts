import { AIReferenceResolver } from '@domain/services/ReferenceAnalysisService';
import { Article, Reference } from '@domain/models';
import { MatchedPattern } from '@domain/services/ReferenceAnalysisService';
export declare class LocalLLMService implements AIReferenceResolver {
    private readonly config;
    resolve(pattern: MatchedPattern, article: Article): Promise<Reference | null>;
    private generatePrompt;
    private extractContext;
    private callLLM;
    private buildReference;
    private buildTargetId;
    private mapPatternToReferenceType;
}
//# sourceMappingURL=LocalLLMService.d.ts.map