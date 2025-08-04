"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArticleId = void 0;
class ArticleId {
    _value;
    static PATTERN = /^[0-9A-Z]{15}_art\d+$/;
    constructor(_value) {
        this._value = _value;
        if (!ArticleId.isValid(_value)) {
            throw new Error(`不正な条文IDです: ${_value}`);
        }
    }
    static generate(lawId, articleNum) {
        return new ArticleId(`${lawId.value}_art${articleNum}`);
    }
    static isValid(value) {
        return ArticleId.PATTERN.test(value);
    }
    get value() {
        return this._value;
    }
    get lawId() {
        return this._value.split('_')[0];
    }
    get articleNumber() {
        const match = this._value.match(/_art(\d+)$/);
        return match ? parseInt(match[1]) : 0;
    }
    equals(other) {
        return this._value === other._value;
    }
    toString() {
        return this._value;
    }
}
exports.ArticleId = ArticleId;
//# sourceMappingURL=ArticleId.js.map