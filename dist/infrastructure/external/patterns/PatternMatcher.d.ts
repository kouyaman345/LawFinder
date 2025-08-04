import { PatternMatcher, MatchedPattern } from '@domain/services/ReferenceAnalysisService';
export interface ExtractedPattern {
    text: string;
    type: string;
    position: number;
    category: string;
    metadata?: Record<string, any>;
}
export declare class RegexPatternMatcher implements PatternMatcher {
    findPatterns(text: string): MatchedPattern[];
    private applyPatterns;
    private applyCompoundPatterns;
    private extractMetadata;
    private consolidatePatterns;
    private calculateConfidence;
}
//# sourceMappingURL=PatternMatcher.d.ts.map