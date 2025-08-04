"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LawId = void 0;
const errors_1 = require("@shared/errors");
const LAW_TYPE_CODES = {
    Act: 'AC',
    CabinetOrder: 'CO',
    MinisterialOrdinance: 'MO',
    Rule: 'RL',
    Regulation: 'RG'
};
class LawId {
    _value;
    static PATTERN = /^\d{3}[A-Z]{2}\d{10}$/;
    constructor(_value) {
        this._value = _value;
        if (!LawId.isValid(_value)) {
            throw new errors_1.InvalidLawIdError(_value);
        }
    }
    static generate(type, year, number) {
        const typeCode = LAW_TYPE_CODES[type];
        const yearStr = year.toString().padStart(3, '0');
        const numStr = number.toString().padStart(10, '0');
        return new LawId(`${yearStr}${typeCode}${numStr}`);
    }
    static isValid(value) {
        return LawId.PATTERN.test(value);
    }
    get value() {
        return this._value;
    }
    get year() {
        return parseInt(this._value.substring(0, 3));
    }
    get typeCode() {
        return this._value.substring(3, 5);
    }
    get number() {
        return parseInt(this._value.substring(5));
    }
    equals(other) {
        return this._value === other._value;
    }
    toString() {
        return this._value;
    }
}
exports.LawId = LawId;
//# sourceMappingURL=LawId.js.map