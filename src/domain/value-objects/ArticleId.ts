import { LawId } from './LawId';

export class ArticleId {
  private static readonly PATTERN = /^[0-9A-Z]{15}_art\d+$/;

  constructor(private readonly _value: string) {
    if (!ArticleId.isValid(_value)) {
      throw new Error(`不正な条文IDです: ${_value}`);
    }
  }

  static generate(lawId: LawId, articleNum: number): ArticleId {
    return new ArticleId(`${lawId.value}_art${articleNum}`);
  }

  static isValid(value: string): boolean {
    return ArticleId.PATTERN.test(value);
  }

  get value(): string {
    return this._value;
  }

  get lawId(): string {
    return this._value.split('_')[0];
  }

  get articleNumber(): number {
    const match = this._value.match(/_art(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  }

  equals(other: ArticleId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}