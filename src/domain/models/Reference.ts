import { ReferenceId, ReferenceType, PRIMARY_REFERENCE_TYPES } from '@domain/value-objects';
import { ReferenceNode, AIAnalysisResult } from '@shared/types';

export interface CreateReferenceParams {
  source: ReferenceNode;
  target: ReferenceNode;
  type: ReferenceType;
  sourceText: string;
  confidence?: number;
}

export class Reference {
  constructor(
    private readonly id: ReferenceId,
    private readonly source: ReferenceNode,
    private readonly target: ReferenceNode,
    private readonly type: ReferenceType,
    private readonly sourceText: string,
    private confidence: number,
    private aiAnalysis: AIAnalysisResult | null,
    private humanVerified: boolean,
    private readonly createdAt: Date
  ) {}

  static create(params: CreateReferenceParams): Reference {
    const id = ReferenceId.generate();
    return new Reference(
      id,
      params.source,
      params.target,
      params.type,
      params.sourceText,
      params.confidence || 0,
      null,
      false,
      new Date()
    );
  }

  static reconstruct(data: any): Reference {
    return new Reference(
      new ReferenceId(data.referenceId),
      data.source,
      data.target,
      data.primaryType,
      data.sourceText,
      data.confidence,
      data.aiAnalysis,
      data.humanVerified,
      data.createdAt
    );
  }

  verify(_userId: string, _notes?: string): void {
    this.humanVerified = true;
    this.confidence = 1.0;
  }

  updateAIAnalysis(analysis: AIAnalysisResult): void {
    this.aiAnalysis = analysis;
    this.confidence = analysis.confidence;
  }

  isOutgoing(nodeId: string): boolean {
    return this.source.id === nodeId;
  }

  isIncoming(nodeId: string): boolean {
    return this.target.id === nodeId;
  }

  get referenceId(): string {
    return this.id.value;
  }

  get referenceType(): ReferenceType {
    return this.type;
  }

  get referenceConfidence(): number {
    return this.confidence;
  }

  get isPrimaryType(): boolean {
    return PRIMARY_REFERENCE_TYPES.includes(this.type);
  }

  get needsReview(): boolean {
    return this.confidence < 0.7 && !this.humanVerified;
  }

  get sourceNode(): ReferenceNode {
    return this.source;
  }

  get targetNode(): ReferenceNode {
    return this.target;
  }

  toJSON(): any {
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