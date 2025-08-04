import { LawId } from './LawId';
export declare class ArticleId {
    private readonly _value;
    private static readonly PATTERN;
    constructor(_value: string);
    static generate(lawId: LawId, articleNum: number): ArticleId;
    static isValid(value: string): boolean;
    get value(): string;
    get lawId(): string;
    get articleNumber(): number;
    equals(other: ArticleId): boolean;
    toString(): string;
}
//# sourceMappingURL=ArticleId.d.ts.map