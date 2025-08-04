import { Law } from '@domain/models';
import { LawId, LawType, LawStatus } from '@domain/value-objects';
export interface FindOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
}
export interface LawRepository {
    findById(id: LawId): Promise<Law | null>;
    findByIds(ids: LawId[]): Promise<Law[]>;
    findByType(type: LawType, options?: FindOptions): Promise<Law[]>;
    findUpdatedSince(date: Date, options?: FindOptions): Promise<Law[]>;
    save(law: Law): Promise<void>;
    saveAll(laws: Law[]): Promise<void>;
    count(): Promise<number>;
    countByStatus(status: LawStatus): Promise<number>;
    countBySource(source: string, month?: Date): Promise<number>;
}
//# sourceMappingURL=LawRepository.d.ts.map