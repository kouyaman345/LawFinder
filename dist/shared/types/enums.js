"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LawStatus = exports.LawType = void 0;
var LawType;
(function (LawType) {
    LawType["Act"] = "Act";
    LawType["CabinetOrder"] = "CabinetOrder";
    LawType["MinisterialOrdinance"] = "MinisterialOrdinance";
    LawType["Rule"] = "Rule";
    LawType["Regulation"] = "Regulation";
})(LawType || (exports.LawType = LawType = {}));
var LawStatus;
(function (LawStatus) {
    LawStatus["Active"] = "active";
    LawStatus["Repealed"] = "repealed";
    LawStatus["NotYetEnforced"] = "not_yet_enforced";
})(LawStatus || (exports.LawStatus = LawStatus = {}));
//# sourceMappingURL=enums.js.map