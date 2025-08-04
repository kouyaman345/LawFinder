import { InvalidLawIdError } from '@shared/errors';
import { LawType } from '@shared/types';

const LAW_TYPE_CODES: Record<LawType, string> = {
  Act: 'AC',
  CabinetOrder: 'CO',
  MinisterialOrdinance: 'MO',
  Rule: 'RL',
  Regulation: 'RG'
};

export class LawId {
  private static readonly PATTERN = /^\d{3}[A-Z]{2}\d{10}$/;
  
  constructor(private readonly _value: string) {
    if (!LawId.isValid(_value)) {
      throw new InvalidLawIdError(_value);
    }
  }

  static generate(type: LawType, year: number, number: number): LawId {
    const typeCode = LAW_TYPE_CODES[type];
    const yearStr = year.toString().padStart(3, '0');
    const numStr = number.toString().padStart(10, '0');
    return new LawId(`${yearStr}${typeCode}${numStr}`);
  }

  static isValid(value: string): boolean {
    return LawId.PATTERN.test(value);
  }

  get value(): string {
    return this._value;
  }

  get year(): number {
    return parseInt(this._value.substring(0, 3));
  }

  get typeCode(): string {
    return this._value.substring(3, 5);
  }

  get number(): number {
    return parseInt(this._value.substring(5));
  }

  equals(other: LawId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}