"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Article = void 0;
const value_objects_1 = require("@domain/value-objects");
const Paragraph_1 = require("./Paragraph");
class Article {
    id;
    lawId;
    number;
    title;
    _createdAt;
    paragraphs = [];
    references = [];
    constructor(id, lawId, number, title, _createdAt) {
        this.id = id;
        this.lawId = lawId;
        this.number = number;
        this.title = title;
        this._createdAt = _createdAt;
    }
    static create(lawId, number, title) {
        const id = value_objects_1.ArticleId.generate(lawId, number);
        return new Article(id, lawId, number, title || null, new Date());
    }
    static reconstruct(data) {
        return new Article(new value_objects_1.ArticleId(data.articleId), new value_objects_1.LawId(data.lawId), data.articleNum, data.articleTitle, data.createdAt);
    }
    addParagraph(content) {
        const number = this.paragraphs.length + 1;
        const paragraph = Paragraph_1.Paragraph.create(this.id, number, content);
        this.paragraphs.push(paragraph);
        return paragraph;
    }
    addReference(reference) {
        this.references.push(reference);
    }
    getOutgoingReferences() {
        return this.references.filter(ref => ref.isOutgoing(this.id.value));
    }
    getIncomingReferences() {
        return this.references.filter(ref => ref.isIncoming(this.id.value));
    }
    get articleId() {
        return this.id.value;
    }
    get articleTitle() {
        return this.title;
    }
    get fullText() {
        return this.paragraphs.map(p => p.content).join('\n');
    }
    get allParagraphs() {
        return [...this.paragraphs];
    }
    toJSON() {
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
exports.Article = Article;
//# sourceMappingURL=Article.js.map