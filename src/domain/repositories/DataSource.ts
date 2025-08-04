export interface FetchOptions {
  limit?: number;
  offset?: number;
  updatedSince?: Date;
}

export interface LawListResult {
  laws: LawListItem[];
  hasMore: boolean;
  nextOffset?: number;
}

export interface LawListItem {
  lawId: string;
  lawTitle: string;
  lastModified: string;
  source: 'xml' | 'api';
}

export interface LawData {
  lawId: string;
  lawType: string;
  lawTitle: string;
  lawTitleKana: string | null;
  promulgateDate: Date;
  enforceDate: Date | null;
  articles: ArticleData[];
  source: 'xml' | 'api';
  lastModified: Date;
}

export interface ArticleData {
  articleNum: number;
  articleTitle?: string;
  paragraphs: ParagraphData[];
}

export interface ParagraphData {
  paragraphNum: number;
  content: string;
  items?: string[];
}

export interface LawDataSource {
  readonly type: 'xml' | 'api';
  fetchLawList(options?: FetchOptions): Promise<LawListResult>;
  fetchLawDetail(lawId: string): Promise<LawData>;
  fetchUpdatedLaws(since: Date): Promise<LawListResult>;
}