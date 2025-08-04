export declare class ReferenceId {
    private readonly _value;
    constructor(_value: string);
    static generate(): ReferenceId;
    get value(): string;
    equals(other: ReferenceId): boolean;
    toString(): string;
}
//# sourceMappingURL=ReferenceId.d.ts.map