import { LawDataSource, FetchOptions, LawListResult, LawData } from '@domain/repositories';
export declare class XMLFileDataSource implements LawDataSource {
    private readonly xmlDirectory;
    readonly type: "xml";
    private parser;
    constructor(xmlDirectory: string);
    fetchLawList(options?: FetchOptions): Promise<LawListResult>;
    fetchLawDetail(lawId: string): Promise<LawData>;
    fetchUpdatedLaws(_since: Date): Promise<LawListResult>;
    private extractLawId;
    private extractLawTitle;
    private parseLaw;
    private generateLawId;
    private mapLawType;
    private extractArticles;
    private extractParagraphs;
    private extractItems;
}
//# sourceMappingURL=XMLFileDataSource.d.ts.map