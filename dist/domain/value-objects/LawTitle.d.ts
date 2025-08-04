export declare class LawTitle {
    private readonly _value;
    private readonly _kana;
    constructor(_value: string, _kana?: string | null);
    get value(): string;
    get kana(): string | null;
    getAbbreviation(): string;
    normalize(): string;
    equals(other: LawTitle): boolean;
    toString(): string;
}
//# sourceMappingURL=LawTitle.d.ts.map