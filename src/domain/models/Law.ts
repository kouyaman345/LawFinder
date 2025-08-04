import { LawId, LawTitle } from '@domain/value-objects';
import { LawType, LawStatus, LawData } from '@shared/types';
import { Article } from './Article';

export interface CreateLawParams {
  type: LawType;
  year: number;
  number: number;
  title: string;
  titleKana?: string;
  promulgateDate: Date;
}

export class Law {
  private articles: Article[] = [];

  private constructor(
    private readonly id: LawId,
    private title: LawTitle,
    private type: LawType,
    private status: LawStatus,
    private readonly promulgateDate: Date,
    private enforceDate: Date | null,
    private readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  static create(params: CreateLawParams): Law {
    const id = LawId.generate(params.type, params.year, params.number);
    const title = new LawTitle(params.title, params.titleKana);
    
    return new Law(
      id,
      title,
      params.type,
      LawStatus.NotYetEnforced,
      params.promulgateDate,
      null,
      new Date(),
      new Date()
    );
  }

  static reconstruct(data: any): Law {
    return new Law(
      new LawId(data.lawId),
      new LawTitle(data.lawTitle, data.lawTitleKana),
      data.lawType,
      data.status,
      data.promulgateDate,
      data.enforceDate,
      data.createdAt,
      data.updatedAt
    );
  }

  enforce(date: Date): void {
    if (this.status !== LawStatus.NotYetEnforced) {
      throw new Error('既に施行されている法令です');
    }
    if (date < this.promulgateDate) {
      throw new Error('施行日は公布日より後である必要があります');
    }
    
    this.enforceDate = date;
    this.status = LawStatus.Active;
    this.updatedAt = new Date();
  }

  repeal(_date: Date): void {
    if (this.status === LawStatus.Repealed) {
      throw new Error('既に廃止されている法令です');
    }
    
    this.status = LawStatus.Repealed;
    this.updatedAt = new Date();
  }

  addArticle(article: Article): void {
    const existingArticle = this.articles.find(a => a.number === article.number);
    if (existingArticle) {
      throw new Error(`条番号 ${article.number} は既に存在します`);
    }
    
    this.articles.push(article);
    this.articles.sort((a, b) => a.number - b.number);
    this.updatedAt = new Date();
  }

  get lawId(): string {
    return this.id.value;
  }

  get lawTitle(): string {
    return this.title.value;
  }

  get lawTitleKana(): string | null {
    return this.title.kana;
  }

  get lawType(): LawType {
    return this.type;
  }

  get lawStatus(): LawStatus {
    return this.status;
  }

  get articleCount(): number {
    return this.articles.length;
  }

  get allArticles(): Article[] {
    return [...this.articles];
  }

  toJSON(): LawData {
    return {
      lawId: this.id.value,
      lawType: this.type,
      lawTitle: this.title.value,
      lawTitleKana: this.title.kana,
      status: this.status,
      promulgateDate: this.promulgateDate,
      enforceDate: this.enforceDate,
      articleCount: this.articles.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}