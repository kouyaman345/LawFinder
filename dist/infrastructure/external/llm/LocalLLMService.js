"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLLMService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@infrastructure/config");
const models_1 = require("@domain/models");
class LocalLLMService {
    config = config_1.Configuration.getInstance();
    async resolve(pattern, article) {
        try {
            const prompt = this.generatePrompt(pattern, article);
            const response = await this.callLLM(prompt);
            if (!response || response.confidence < 0.5) {
                return null;
            }
            return this.buildReference(pattern, article, response);
        }
        catch (error) {
            console.error('LLM resolution failed:', error);
            return null;
        }
    }
    generatePrompt(pattern, article) {
        return `
法令の参照関係を解決してください。

現在の法令ID: ${article.articleId.split('_')[0]}
現在の条文: 第${article.number}条
参照テキスト: ${pattern.text}
前後の文脈（100文字）: ${this.extractContext(article.fullText, pattern.position)}

以下の形式でJSONを返してください：
{
  "targetLawTitle": "参照先の法令名（分かる場合）",
  "targetLawId": "参照先の法令ID（分かる場合）",
  "targetArticleNum": 参照先の条番号（数値）,
  "targetParagraphNum": 参照先の項番号（該当する場合、数値）,
  "reasoning": "判断の根拠",
  "confidence": 0.0〜1.0の信頼度
}

参照先が不明確な場合は、confidenceを低く設定してください。
同じ法令内の参照の場合は、targetLawIdは現在の法令IDと同じになります。`;
    }
    extractContext(fullText, position) {
        const contextLength = 50;
        const start = Math.max(0, position - contextLength);
        const end = Math.min(fullText.length, position + contextLength);
        return fullText.substring(start, end);
    }
    async callLLM(prompt) {
        try {
            const response = await axios_1.default.post(`${this.config.llm.endpoint}/api/generate`, {
                model: this.config.llm.model,
                prompt: prompt,
                format: 'json',
                stream: false,
                options: {
                    temperature: 0.1,
                    max_tokens: 500
                }
            }, {
                timeout: this.config.llm.timeout
            });
            const result = response.data.response;
            return JSON.parse(result);
        }
        catch (error) {
            console.error('LLM API call failed:', error);
            return null;
        }
    }
    buildReference(pattern, sourceArticle, llmResponse) {
        // ターゲットノードの構築
        const targetId = this.buildTargetId(sourceArticle, llmResponse);
        if (!targetId)
            return null;
        const ref = models_1.Reference.create({
            source: {
                type: 'article',
                id: sourceArticle.articleId,
                text: sourceArticle.fullText
            },
            target: {
                type: 'article',
                id: targetId,
                text: ''
            },
            type: this.mapPatternToReferenceType(pattern.type),
            sourceText: pattern.text,
            confidence: llmResponse.confidence
        });
        // AI解析結果を更新
        ref.updateAIAnalysis({
            confidence: llmResponse.confidence,
            model: this.config.llm.model,
            analyzedAt: new Date(),
            reasoning: llmResponse.reasoning,
            verified: false
        });
        return ref;
    }
    buildTargetId(article, response) {
        // 法令IDの決定
        const lawId = response.targetLawId || article.articleId.split('_')[0];
        // 条番号が不明な場合はnull
        if (!response.targetArticleNum) {
            return null;
        }
        return `${lawId}_art${response.targetArticleNum}`;
    }
    mapPatternToReferenceType(patternType) {
        const typeMap = {
            'APPLY': 'APPLY',
            'DEEM': 'DEEM',
            'REPLACE': 'REPLACE',
            'EXCEPT': 'EXCEPT',
            'FOLLOW': 'FOLLOW',
            'LIMIT': 'LIMIT',
            'REGARDLESS': 'REGARDLESS',
            'STIPULATE': 'STIPULATE',
            'RELATE': 'RELATE'
        };
        return typeMap[patternType] || 'RELATE';
    }
}
exports.LocalLLMService = LocalLLMService;
//# sourceMappingURL=LocalLLMService.js.map