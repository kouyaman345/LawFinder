import { LawType, LawStatus, LawData } from '@shared/types';
import { Article } from './Article';
export interface CreateLawParams {
    type: LawType;
    year: number;
    number: number;
    title: string;
    titleKana?: string;
    promulgateDate: Date;
}
export declare class Law {
    private readonly id;
    private title;
    private type;
    private status;
    private readonly promulgateDate;
    private enforceDate;
    private readonly createdAt;
    private updatedAt;
    private articles;
    private constructor();
    static create(params: CreateLawParams): Law;
    static reconstruct(data: any): Law;
    enforce(date: Date): void;
    repeal(_date: Date): void;
    addArticle(article: Article): void;
    get lawId(): string;
    get lawTitle(): string;
    get lawTitleKana(): string | null;
    get lawType(): LawType;
    get lawStatus(): LawStatus;
    get articleCount(): number;
    get allArticles(): Article[];
    toJSON(): LawData;
}
//# sourceMappingURL=Law.d.ts.map