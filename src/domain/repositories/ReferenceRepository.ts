import { Reference } from '@domain/models';
import { ReferenceId, LawId, ReferenceType } from '@domain/value-objects';

export interface ReferenceQueryOptions {
  minConfidence?: number;
  referenceTypes?: ReferenceType[];
  verifiedOnly?: boolean;
  limit?: number;
}

export interface ReferenceRepository {
  findById(id: ReferenceId): Promise<Reference | null>;
  findByLaw(lawId: LawId): Promise<Reference[]>;
  findOutgoing(nodeId: string, options?: ReferenceQueryOptions): Promise<Reference[]>;
  findIncoming(nodeId: string, options?: ReferenceQueryOptions): Promise<Reference[]>;
  findLowConfidence(threshold: number): Promise<Reference[]>;
  save(reference: Reference): Promise<void>;
  saveAll(references: Reference[]): Promise<void>;
  update(reference: Reference): Promise<void>;
  delete(id: ReferenceId): Promise<void>;
  countVerified(): Promise<number>;
  countLowConfidence(): Promise<number>;
  countByType(): Promise<Record<ReferenceType, number>>;
}