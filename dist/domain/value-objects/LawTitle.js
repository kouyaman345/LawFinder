"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LawTitle = void 0;
const errors_1 = require("@shared/errors");
class LawTitle {
    _value;
    _kana;
    constructor(_value, _kana = null) {
        this._value = _value;
        this._kana = _kana;
        if (!_value || _value.length > 500) {
            throw new errors_1.InvalidLawTitleError(_value);
        }
    }
    get value() {
        return this._value;
    }
    get kana() {
        return this._kana;
    }
    getAbbreviation() {
        // 法令名の略称生成ロジック
        return this._value
            .replace(/に関する法律$/, '法')
            .replace(/の一部を改正する法律$/, '改正法')
            .replace(/等に関する法律$/, '等法');
    }
    normalize() {
        // 空白や記号の正規化
        return this._value
            .replace(/\s+/g, '')
            .replace(/（(.+)）/g, '($1)')
            .replace(/附則/g, '付則');
    }
    equals(other) {
        return this._value === other._value;
    }
    toString() {
        return this._value;
    }
}
exports.LawTitle = LawTitle;
//# sourceMappingURL=LawTitle.js.map