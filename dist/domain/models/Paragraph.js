"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Paragraph = void 0;
const value_objects_1 = require("@domain/value-objects");
class Paragraph {
    id;
    articleId;
    number;
    content;
    _createdAt;
    items = [];
    constructor(id, articleId, number, content, _createdAt) {
        this.id = id;
        this.articleId = articleId;
        this.number = number;
        this.content = content;
        this._createdAt = _createdAt;
    }
    static create(articleId, number, content) {
        const id = `${articleId.value}_para${number}`;
        return new Paragraph(id, articleId, number, content, new Date());
    }
    static reconstruct(data) {
        return new Paragraph(data.paragraphId, new value_objects_1.ArticleId(data.articleId), data.paragraphNum, data.content, data.createdAt);
    }
    addItem(item) {
        this.items.push(item);
    }
    get paragraphId() {
        return this.id;
    }
    get allItems() {
        return [...this.items];
    }
    toJSON() {
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
exports.Paragraph = Paragraph;
//# sourceMappingURL=Paragraph.js.map