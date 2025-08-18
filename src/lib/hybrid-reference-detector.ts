/**
 * ハイブリッド参照検出器
 * アルゴリズムとLLMを組み合わせた最適化戦略
 */

import { EnhancedReferenceDetectorV37 } from '../domain/services/EnhancedReferenceDetectorV37';
import { LLMValidator, Reference, LLMValidationResult } from './llm-validator';
import { Ollama } from 'ollama';

export interface HybridDetectionConfig {
  useLLMForAbbreviations: boolean;      // 略称展開にLLM使用
  useLLMForIndirectRefs: boolean;       // 間接参照にLLM使用
  useLLMForRelativeRefs: boolean;       // 相対参照にLLM使用
  useLLMForValidation: boolean;         // 検証にLLM使用
  confidenceThreshold: number;          // LLM信頼度閾値
  cacheEnabled: boolean;                // キャッシュ有効化
  maxLLMCallsPerText: number;          // テキストあたりの最大LLM呼び出し
}

export interface HybridDetectionResult {
  references: Reference[];
  algorithmDetected: number;
  llmEnhanced: number;
  llmValidated: number;
  processingTimeMs: number;
  llmCallsMade: number;
  cacheHits: number;
  strategy: string;
}

export class HybridReferenceDetector {
  private algorithmDetector: EnhancedReferenceDetectorV37;
  private llmValidator: LLMValidator;
  private ollama: Ollama;
  private cache: Map<string, any>;
  private config: HybridDetectionConfig;
  
  constructor(config?: Partial<HybridDetectionConfig>) {
    this.algorithmDetector = new EnhancedReferenceDetectorV37();
    this.llmValidator = new LLMValidator('qwen2.5:7b');
    this.ollama = new Ollama();
    this.cache = new Map();
    
    // デフォルト設定
    this.config = {
      useLLMForAbbreviations: true,
      useLLMForIndirectRefs: true,
      useLLMForRelativeRefs: false, // 7Bでは精度が低いため無効
      useLLMForValidation: false,    // 速度優先で無効
      confidenceThreshold: 0.7,
      cacheEnabled: true,
      maxLLMCallsPerText: 3,
      ...config
    };
  }
  
  /**
   * ハイブリッド検出メイン処理
   */
  async detectReferences(text: string, currentArticle?: string): Promise<HybridDetectionResult> {
    const startTime = Date.now();
    let llmCallsMade = 0;
    let cacheHits = 0;
    const usedStrategies: string[] = [];
    
    // Step 1: アルゴリズムによる基本検出
    const algorithmRefs = this.algorithmDetector.detectReferences(text, currentArticle);
    const algorithmCount = algorithmRefs.length;
    usedStrategies.push('algorithm');
    
    // 結果を管理するMap（重複除去用）
    const referenceMap = new Map<string, Reference>();
    algorithmRefs.forEach(ref => {
      const key = `${ref.sourceText}_${ref.position.start}`;
      referenceMap.set(key, ref);
    });
    
    // Step 2: 選択的LLM適用の判定
    const shouldUseLLM = this.shouldUseLLM(text, algorithmRefs);
    
    if (shouldUseLLM && llmCallsMade < this.config.maxLLMCallsPerText) {
      
      // Step 2a: 略称展開
      if (this.config.useLLMForAbbreviations && this.containsAbbreviations(text)) {
        const expandedRefs = await this.expandAbbreviations(text);
        llmCallsMade++;
        usedStrategies.push('abbreviation_expansion');
        
        expandedRefs.forEach(ref => {
          const key = `${ref.sourceText}_${ref.position?.start || 0}`;
          if (!referenceMap.has(key)) {
            referenceMap.set(key, ref);
          }
        });
      }
      
      // Step 2b: 間接参照の検出
      if (this.config.useLLMForIndirectRefs && this.containsIndirectReferences(text)) {
        const indirectRefs = await this.detectIndirectReferences(text);
        llmCallsMade++;
        usedStrategies.push('indirect_detection');
        
        indirectRefs.forEach(ref => {
          const key = `${ref.sourceText}_${ref.position?.start || 0}`;
          if (!referenceMap.has(key)) {
            referenceMap.set(key, ref);
          }
        });
      }
      
      // Step 2c: 検証（オプション）
      if (this.config.useLLMForValidation && referenceMap.size > 0) {
        const validatedRefs = await this.validateWithLLM(
          Array.from(referenceMap.values()),
          text
        );
        llmCallsMade++;
        usedStrategies.push('validation');
        
        // 信頼度の低い参照を除去
        validatedRefs.forEach(result => {
          if (!result.isValid || result.confidence < this.config.confidenceThreshold) {
            const key = `${result.originalReference.sourceText}_${result.originalReference.position.start}`;
            referenceMap.delete(key);
          }
        });
      }
    }
    
    const finalRefs = Array.from(referenceMap.values());
    const llmEnhanced = finalRefs.length - algorithmCount;
    
    return {
      references: finalRefs,
      algorithmDetected: algorithmCount,
      llmEnhanced: Math.max(0, llmEnhanced),
      llmValidated: this.config.useLLMForValidation ? finalRefs.length : 0,
      processingTimeMs: Date.now() - startTime,
      llmCallsMade,
      cacheHits,
      strategy: usedStrategies.join(' + ')
    };
  }
  
  /**
   * LLM使用の判定
   */
  private shouldUseLLM(text: string, algorithmRefs: Reference[]): boolean {
    // 以下の条件でLLMを使用
    // 1. 略称が含まれる
    // 2. 間接参照が含まれる
    // 3. アルゴリズム検出が少ない（見逃しの可能性）
    
    if (this.containsAbbreviations(text)) return true;
    if (this.containsIndirectReferences(text)) return true;
    if (algorithmRefs.length < 2 && text.length > 100) return true;
    
    return false;
  }
  
  /**
   * 略称を含むかチェック
   */
  private containsAbbreviations(text: string): boolean {
    const abbreviationPatterns = [
      /民訴/,
      /刑訴/,
      /民執/,
      /破産法/,
      /会更法/,
      /特措法/,
      /独禁法/,
      /下請法/
    ];
    
    return abbreviationPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * 間接参照を含むかチェック
   */
  private containsIndirectReferences(text: string): boolean {
    const indirectPatterns = [
      /関係法令/,
      /別に.*定める/,
      /他の法律/,
      /特別の定め/,
      /法令の規定/
    ];
    
    return indirectPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * 略称を展開
   */
  private async expandAbbreviations(text: string): Promise<Reference[]> {
    const cacheKey = `abbr_${text.substring(0, 50)}`;
    
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const prompt = `
以下の文章から法令の略称を正式名称に展開してJSON形式で出力してください。

文章: "${text.substring(0, 300)}"

略称の例:
- 民訴 → 民事訴訟法
- 刑訴 → 刑事訴訟法
- 特措法 → 特別措置法

出力形式:
{
  "expansions": [
    {"abbreviated": "民訴", "full": "民事訴訟法", "article": "第100条"}
  ]
}`;
    
    try {
      const response = await Promise.race([
        this.ollama.generate({
          model: 'qwen2.5:7b',
          prompt,
          stream: false,
          format: 'json'
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 2000)
        )
      ]) as any;
      
      const refs = this.parseAbbreviationResponse(response.response, text);
      
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, refs);
      }
      
      return refs;
    } catch (error) {
      console.error('Abbreviation expansion error:', error.message);
      return [];
    }
  }
  
  /**
   * 間接参照を検出
   */
  private async detectIndirectReferences(text: string): Promise<Reference[]> {
    const cacheKey = `indirect_${text.substring(0, 50)}`;
    
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const prompt = `
以下の文章から間接的な法令参照を検出してください。

文章: "${text.substring(0, 300)}"

間接参照の例:
- "関係法令の定めるところにより" → 具体的な法令を推定
- "別に政令で定める" → 関連する政令を推定

出力形式（JSON）:
{
  "indirect_refs": [
    {"text": "関係法令", "inferred": "○○法施行令"}
  ]
}`;
    
    try {
      const response = await Promise.race([
        this.ollama.generate({
          model: 'qwen2.5:7b',
          prompt,
          stream: false,
          format: 'json'
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 2000)
        )
      ]) as any;
      
      const refs = this.parseIndirectResponse(response.response, text);
      
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, refs);
      }
      
      return refs;
    } catch (error) {
      console.error('Indirect detection error:', error.message);
      return [];
    }
  }
  
  /**
   * LLMで検証
   */
  private async validateWithLLM(
    refs: Reference[],
    text: string
  ): Promise<LLMValidationResult[]> {
    try {
      return await this.llmValidator.validateReferences(
        text.substring(0, 500),
        refs.slice(0, 10)
      );
    } catch (error) {
      // エラー時は全て有効として扱う
      return refs.map(ref => ({
        originalReference: ref,
        isValid: true,
        confidence: 0.5,
        reason: 'Validation skipped'
      }));
    }
  }
  
  /**
   * 略称展開レスポンスをパース
   */
  private parseAbbreviationResponse(jsonResponse: string, originalText: string): Reference[] {
    try {
      const parsed = JSON.parse(jsonResponse);
      const expansions = parsed.expansions || [];
      
      return expansions.map((exp: any) => {
        const position = originalText.indexOf(exp.abbreviated);
        return {
          sourceText: exp.abbreviated,
          type: 'external' as const,
          targetLaw: exp.full,
          targetArticle: exp.article,
          position: {
            start: position >= 0 ? position : 0,
            end: position >= 0 ? position + exp.abbreviated.length : exp.abbreviated.length
          }
        };
      });
    } catch {
      return [];
    }
  }
  
  /**
   * 間接参照レスポンスをパース
   */
  private parseIndirectResponse(jsonResponse: string, originalText: string): Reference[] {
    try {
      const parsed = JSON.parse(jsonResponse);
      const indirectRefs = parsed.indirect_refs || [];
      
      return indirectRefs.map((ref: any) => {
        const position = originalText.indexOf(ref.text);
        return {
          sourceText: ref.text,
          type: 'external' as const,
          targetLaw: ref.inferred,
          position: {
            start: position >= 0 ? position : 0,
            end: position >= 0 ? position + ref.text.length : ref.text.length
          }
        };
      });
    } catch {
      return [];
    }
  }
  
  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * 設定を更新
   */
  updateConfig(config: Partial<HybridDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}