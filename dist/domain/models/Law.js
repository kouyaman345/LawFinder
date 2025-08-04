"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Law = void 0;
const value_objects_1 = require("@domain/value-objects");
const types_1 = require("@shared/types");
class Law {
    id;
    title;
    type;
    status;
    promulgateDate;
    enforceDate;
    createdAt;
    updatedAt;
    articles = [];
    constructor(id, title, type, status, promulgateDate, enforceDate, createdAt, updatedAt) {
        this.id = id;
        this.title = title;
        this.type = type;
        this.status = status;
        this.promulgateDate = promulgateDate;
        this.enforceDate = enforceDate;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(params) {
        const id = value_objects_1.LawId.generate(params.type, params.year, params.number);
        const title = new value_objects_1.LawTitle(params.title, params.titleKana);
        return new Law(id, title, params.type, types_1.LawStatus.NotYetEnforced, params.promulgateDate, null, new Date(), new Date());
    }
    static reconstruct(data) {
        return new Law(new value_objects_1.LawId(data.lawId), new value_objects_1.LawTitle(data.lawTitle, data.lawTitleKana), data.lawType, data.status, data.promulgateDate, data.enforceDate, data.createdAt, data.updatedAt);
    }
    enforce(date) {
        if (this.status !== types_1.LawStatus.NotYetEnforced) {
            throw new Error('既に施行されている法令です');
        }
        if (date < this.promulgateDate) {
            throw new Error('施行日は公布日より後である必要があります');
        }
        this.enforceDate = date;
        this.status = types_1.LawStatus.Active;
        this.updatedAt = new Date();
    }
    repeal(_date) {
        if (this.status === types_1.LawStatus.Repealed) {
            throw new Error('既に廃止されている法令です');
        }
        this.status = types_1.LawStatus.Repealed;
        this.updatedAt = new Date();
    }
    addArticle(article) {
        const existingArticle = this.articles.find(a => a.number === article.number);
        if (existingArticle) {
            throw new Error(`条番号 ${article.number} は既に存在します`);
        }
        this.articles.push(article);
        this.articles.sort((a, b) => a.number - b.number);
        this.updatedAt = new Date();
    }
    get lawId() {
        return this.id.value;
    }
    get lawTitle() {
        return this.title.value;
    }
    get lawTitleKana() {
        return this.title.kana;
    }
    get lawType() {
        return this.type;
    }
    get lawStatus() {
        return this.status;
    }
    get articleCount() {
        return this.articles.length;
    }
    get allArticles() {
        return [...this.articles];
    }
    toJSON() {
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
exports.Law = Law;
//# sourceMappingURL=Law.js.map