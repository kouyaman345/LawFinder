import { ReferenceId, ReferenceType } from '@domain/value-objects';
import { ReferenceNode, AIAnalysisResult } from '@shared/types';
export interface CreateReferenceParams {
    source: ReferenceNode;
    target: ReferenceNode;
    type: ReferenceType;
    sourceText: string;
    confidence?: number;
}
export declare class Reference {
    private readonly id;
    private readonly source;
    private readonly target;
    private readonly type;
    private readonly sourceText;
    private confidence;
    private aiAnalysis;
    private humanVerified;
    private readonly createdAt;
    constructor(id: ReferenceId, source: ReferenceNode, target: ReferenceNode, type: ReferenceType, sourceText: string, confidence: number, aiAnalysis: AIAnalysisResult | null, humanVerified: boolean, createdAt: Date);
    static create(params: CreateReferenceParams): Reference;
    static reconstruct(data: any): Reference;
    verify(_userId: string, _notes?: string): void;
    updateAIAnalysis(analysis: AIAnalysisResult): void;
    isOutgoing(nodeId: string): boolean;
    isIncoming(nodeId: string): boolean;
    get referenceId(): string;
    get referenceType(): ReferenceType;
    get referenceConfidence(): number;
    get isPrimaryType(): boolean;
    get needsReview(): boolean;
    get sourceNode(): ReferenceNode;
    get targetNode(): ReferenceNode;
    toJSON(): any;
}
//# sourceMappingURL=Reference.d.ts.map