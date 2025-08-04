"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reference = void 0;
const value_objects_1 = require("@domain/value-objects");
class Reference {
    id;
    source;
    target;
    type;
    sourceText;
    confidence;
    aiAnalysis;
    humanVerified;
    createdAt;
    constructor(id, source, target, type, sourceText, confidence, aiAnalysis, humanVerified, createdAt) {
        this.id = id;
        this.source = source;
        this.target = target;
        this.type = type;
        this.sourceText = sourceText;
        this.confidence = confidence;
        this.aiAnalysis = aiAnalysis;
        this.humanVerified = humanVerified;
        this.createdAt = createdAt;
    }
    static create(params) {
        const id = value_objects_1.ReferenceId.generate();
        return new Reference(id, params.source, params.target, params.type, params.sourceText, params.confidence || 0, null, false, new Date());
    }
    static reconstruct(data) {
        return new Reference(new value_objects_1.ReferenceId(data.referenceId), data.source, data.target, data.primaryType, data.sourceText, data.confidence, data.aiAnalysis, data.humanVerified, data.createdAt);
    }
    verify(_userId, _notes) {
        this.humanVerified = true;
        this.confidence = 1.0;
    }
    updateAIAnalysis(analysis) {
        this.aiAnalysis = analysis;
        this.confidence = analysis.confidence;
    }
    isOutgoing(nodeId) {
        return this.source.id === nodeId;
    }
    isIncoming(nodeId) {
        return this.target.id === nodeId;
    }
    get referenceId() {
        return this.id.value;
    }
    get referenceType() {
        return this.type;
    }
    get referenceConfidence() {
        return this.confidence;
    }
    get isPrimaryType() {
        return value_objects_1.PRIMARY_REFERENCE_TYPES.includes(this.type);
    }
    get needsReview() {
        return this.confidence < 0.7 && !this.humanVerified;
    }
    get sourceNode() {
        return this.source;
    }
    get targetNode() {
        return this.target;
    }
    toJSON() {
        return {
            referenceId: this.id.value,
            source: this.source,
            target: this.target,
            primaryType: this.type,
            sourceText: this.sourceText,
            confidence: this.confidence,
            aiAnalysis: this.aiAnalysis,
            humanVerified: this.humanVerified,
            createdAt: this.createdAt
        };
    }
}
exports.Reference = Reference;
//# sourceMappingURL=Reference.js.map