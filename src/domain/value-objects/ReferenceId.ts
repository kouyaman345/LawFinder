import { v4 as uuidv4 } from 'uuid';

export class ReferenceId {
  constructor(private readonly _value: string) {
    if (!_value || _value.length === 0) {
      throw new Error('参照IDが空です');
    }
  }

  static generate(): ReferenceId {
    return new ReferenceId(`ref_${uuidv4()}`);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ReferenceId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}