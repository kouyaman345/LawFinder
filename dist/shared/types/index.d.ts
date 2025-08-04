export { LawType, LawStatus } from './enums';
export type ReferenceType = 'APPLY' | 'DEEM' | 'REPLACE' | 'EXCEPT' | 'FOLLOW' | 'LIMIT' | 'REGARDLESS' | 'RELATE' | 'STIPULATE' | 'EXAMPLE' | 'SIMILAR' | 'SUBSTITUTE' | 'ADDITION';
export declare const PRIMARY_REFERENCE_TYPES: ReferenceType[];
export interface LawData {
    lawId: string;
    lawType: string;
    lawTitle: string;
    lawTitleKana: string | null;
    promulgateDate: Date;
    enforceDate: Date | null;
    status: string;
    articleCount: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface ArticleData {
    articleId: string;
    lawId: string;
    articleNum: number;
    articleTitle: string | null;
    content: string;
    paragraphs: ParagraphData[];
}
export interface ParagraphData {
    paragraphId: string;
    articleId: string;
    paragraphNum: number;
    content: string;
    items: ItemData[];
}
export interface ItemData {
    itemId: string;
    paragraphId: string;
    itemNum: number;
    content: string;
}
export interface ReferenceNode {
    type: 'law' | 'article' | 'paragraph' | 'item';
    id: string;
    text?: string;
}
export interface AIAnalysisResult {
    confidence: number;
    model: string;
    analyzedAt: Date;
    reasoning?: string;
    ambiguityNotes?: string;
    verified: boolean;
}
export interface ImpactType {
    DirectApplication: 'direct_application';
    TextReplacement: 'text_replacement';
    LegalFiction: 'legal_fiction';
    Exception: 'exception';
    General: 'general';
}
//# sourceMappingURL=index.d.ts.map