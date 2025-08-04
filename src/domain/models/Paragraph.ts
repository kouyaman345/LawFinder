import { ArticleId } from '@domain/value-objects';
import { ParagraphData } from '@shared/types';

export class Paragraph {
  private items: string[] = [];

  constructor(
    private readonly id: string,
    private readonly articleId: ArticleId,
    public readonly number: number,
    public readonly content: string,
    private readonly _createdAt: Date
  ) {}

  static create(articleId: ArticleId, number: number, content: string): Paragraph {
    const id = `${articleId.value}_para${number}`;
    return new Paragraph(id, articleId, number, content, new Date());
  }

  static reconstruct(data: any): Paragraph {
    return new Paragraph(
      data.paragraphId,
      new ArticleId(data.articleId),
      data.paragraphNum,
      data.content,
      data.createdAt
    );
  }

  addItem(item: string): void {
    this.items.push(item);
  }

  get paragraphId(): string {
    return this.id;
  }

  get allItems(): string[] {
    return [...this.items];
  }

  toJSON(): ParagraphData {
    return {
      paragraphId: this.id,
      articleId: this.articleId.value,
      paragraphNum: this.number,
      content: this.content,
      items: this.items.map((item, index) => ({
        itemId: `${this.id}_item${index + 1}`,
        paragraphId: this.id,
        itemNum: index + 1,
        content: item
      }))
    };
  }
}