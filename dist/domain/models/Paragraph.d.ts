import { ArticleId } from '@domain/value-objects';
import { ParagraphData } from '@shared/types';
export declare class Paragraph {
    private readonly id;
    private readonly articleId;
    readonly number: number;
    readonly content: string;
    private readonly _createdAt;
    private items;
    constructor(id: string, articleId: ArticleId, number: number, content: string, _createdAt: Date);
    static create(articleId: ArticleId, number: number, content: string): Paragraph;
    static reconstruct(data: any): Paragraph;
    addItem(item: string): void;
    get paragraphId(): string;
    get allItems(): string[];
    toJSON(): ParagraphData;
}
//# sourceMappingURL=Paragraph.d.ts.map