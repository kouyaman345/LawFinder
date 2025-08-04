import { InvalidLawTitleError } from '@shared/errors';

export class LawTitle {
  constructor(
    private readonly _value: string,
    private readonly _kana: string | null = null
  ) {
    if (!_value || _value.length > 500) {
      throw new InvalidLawTitleError(_value);
    }
  }

  get value(): string {
    return this._value;
  }

  get kana(): string | null {
    return this._kana;
  }

  getAbbreviation(): string {
    // 法令名の略称生成ロジック
    return this._value
      .replace(/に関する法律$/, '法')
      .replace(/の一部を改正する法律$/, '改正法')
      .replace(/等に関する法律$/, '等法');
  }

  normalize(): string {
    // 空白や記号の正規化
    return this._value
      .replace(/\s+/g, '')
      .replace(/（(.+)）/g, '($1)')
      .replace(/附則/g, '付則');
  }

  equals(other: LawTitle): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}