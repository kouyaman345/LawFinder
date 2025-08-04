import axios from 'axios';
import { Configuration } from '@infrastructure/config';
import { AIReferenceResolver } from '@domain/services/ReferenceAnalysisService';
import { Article, Reference } from '@domain/models';
import { MatchedPattern } from '@domain/services/ReferenceAnalysisService';
import { ReferenceType } from '@domain/value-objects';

interface LLMResponse {
  targetLawTitle?: string;
  targetLawId?: string;
  targetArticleNum?: number;
  targetParagraphNum?: number;
  reasoning?: string;
  confidence: number;
}

export class LocalLLMService implements AIReferenceResolver {
  private readonly config = Configuration.getInstance();
  
  async resolve(pattern: MatchedPattern, article: Article): Promise<Reference | null> {
    try {
      const prompt = this.generatePrompt(pattern, article);
      const response = await this.callLLM(prompt);
      
      if (!response || response.confidence < 0.5) {
        return null;
      }
      
      return this.buildReference(pattern, article, response);
    } catch (error) {
      console.error('LLM resolution failed:', error);
      return null;
    }
  }
  
  private generatePrompt(pattern: MatchedPattern, article: Article): string {
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
  
  private extractContext(fullText: string, position: number): string {
    const contextLength = 50;
    const start = Math.max(0, position - contextLength);
    const end = Math.min(fullText.length, position + contextLength);
    return fullText.substring(start, end);
  }
  
  private async callLLM(prompt: string): Promise<LLMResponse | null> {
    try {
      const response = await axios.post(
        `${this.config.llm.endpoint}/api/generate`,
        {
          model: this.config.llm.model,
          prompt: prompt,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1,
            max_tokens: 500
          }
        },
        {
          timeout: this.config.llm.timeout
        }
      );
      
      const result = response.data.response;
      return JSON.parse(result) as LLMResponse;
    } catch (error) {
      console.error('LLM API call failed:', error);
      return null;
    }
  }
  
  private buildReference(
    pattern: MatchedPattern,
    sourceArticle: Article,
    llmResponse: LLMResponse
  ): Reference | null {
    // ターゲットノードの構築
    const targetId = this.buildTargetId(sourceArticle, llmResponse);
    if (!targetId) return null;
    
    const ref = Reference.create({
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
  
  private buildTargetId(article: Article, response: LLMResponse): string | null {
    // 法令IDの決定
    const lawId = response.targetLawId || article.articleId.split('_')[0];
    
    // 条番号が不明な場合はnull
    if (!response.targetArticleNum) {
      return null;
    }
    
    return `${lawId}_art${response.targetArticleNum}`;
  }
  
  private mapPatternToReferenceType(patternType: string): ReferenceType {
    const typeMap: Record<string, ReferenceType> = {
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