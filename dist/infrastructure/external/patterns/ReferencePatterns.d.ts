export interface Pattern {
    name: string;
    regex: RegExp;
    type: string;
}
export interface PatternCategory {
    structural: Pattern[];
    basic: Pattern[];
    implicit: Pattern[];
    compound: Pattern[];
}
export declare const REFERENCE_PATTERNS: PatternCategory;
export declare function kanjiToNumber(kanjiStr: string): number;
//# sourceMappingURL=ReferencePatterns.d.ts.map