"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceId = void 0;
const uuid_1 = require("uuid");
class ReferenceId {
    _value;
    constructor(_value) {
        this._value = _value;
        if (!_value || _value.length === 0) {
            throw new Error('参照IDが空です');
        }
    }
    static generate() {
        return new ReferenceId(`ref_${(0, uuid_1.v4)()}`);
    }
    get value() {
        return this._value;
    }
    equals(other) {
        return this._value === other._value;
    }
    toString() {
        return this._value;
    }
}
exports.ReferenceId = ReferenceId;
//# sourceMappingURL=ReferenceId.js.map