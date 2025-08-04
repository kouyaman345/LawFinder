import { ArticleId, LawId } from '@domain/value-objects';
import { Paragraph } from './Paragraph';
import { Reference } from './Reference';
import { ArticleData } from '@shared/types';

export class Article {
  private paragraphs: Paragraph[] = [];
  private references: Reference[] = [];

  constructor(
    private readonly id: ArticleId,
    private readonly lawId: LawId,
    public readonly number: number,
    private title: string | null,
    private readonly _createdAt: Date
  ) {}

  static create(lawId: LawId, number: number, title?: string): Article {
    const id = ArticleId.generate(lawId, number);
    return new Article(id, lawId, number, title || null, new Date());
  }

  static reconstruct(data: any): Article {
    return new Article(
      new ArticleId(data.articleId),
      new LawId(data.lawId),
      data.articleNum,
      data.articleTitle,
      data.createdAt
    );
  }

  addParagraph(content: string): Paragraph {
    const number = this.paragraphs.length + 1;
    const paragraph = Paragraph.create(this.id, number, content);
    this.paragraphs.push(paragraph);
    return paragraph;
  }

  addReference(reference: Reference): void {
    this.references.push(reference);
  }

  getOutgoingReferences(): Reference[] {
    return this.references.filter(ref => ref.isOutgoing(this.id.value));
  }

  getIncomingReferences(): Reference[] {
    return this.references.filter(ref => ref.isIncoming(this.id.value));
  }

  get articleId(): string {
    return this.id.value;
  }

  get articleTitle(): string | null {
    return this.title;
  }

  get fullText(): string {
    return this.paragraphs.map(p => p.content).join('\n');
  }

  get allParagraphs(): Paragraph[] {
    return [...this.paragraphs];
  }

  toJSON(): ArticleData {
    return {
      articleId: this.id.value,
      lawId: this.lawId.value,
      articleNum: this.number,
      articleTitle: this.title,
      content: this.fullText,
      paragraphs: this.paragraphs.map(p => p.toJSON())
    };
  }
}