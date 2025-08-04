import { ArticleId, LawId } from '@domain/value-objects';
import { Paragraph } from './Paragraph';
import { Reference } from './Reference';
import { ArticleData } from '@shared/types';
export declare class Article {
    private readonly id;
    private readonly lawId;
    readonly number: number;
    private title;
    private readonly _createdAt;
    private paragraphs;
    private references;
    constructor(id: ArticleId, lawId: LawId, number: number, title: string | null, _createdAt: Date);
    static create(lawId: LawId, number: number, title?: string): Article;
    static reconstruct(data: any): Article;
    addParagraph(content: string): Paragraph;
    addReference(reference: Reference): void;
    getOutgoingReferences(): Reference[];
    getIncomingReferences(): Reference[];
    get articleId(): string;
    get articleTitle(): string | null;
    get fullText(): string;
    get allParagraphs(): Paragraph[];
    toJSON(): ArticleData;
}
//# sourceMappingURL=Article.d.ts.map