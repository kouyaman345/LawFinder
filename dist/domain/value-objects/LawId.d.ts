import { LawType } from '@shared/types';
export declare class LawId {
    private readonly _value;
    private static readonly PATTERN;
    constructor(_value: string);
    static generate(type: LawType, year: number, number: number): LawId;
    static isValid(value: string): boolean;
    get value(): string;
    get year(): number;
    get typeCode(): string;
    get number(): number;
    equals(other: LawId): boolean;
    toString(): string;
}
//# sourceMappingURL=LawId.d.ts.map