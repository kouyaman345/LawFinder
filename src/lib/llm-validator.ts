import { Ollama } from 'ollama';

export interface Reference {
  id?: string;
  sourceText: string;
  type: 'internal' | 'external' | 'relative' | 'structural' | 'range' | 'multiple' | 'application';
  targetArticle?: string;
  targetLaw?: string;
  startArticle?: string;
  endArticle?: string;
  position: {
    start: number;
    end: number;
  };
}

export interface LLMValidationResult {
  originalReference: Reference;
  isValid: boolean;
  confidence: number;
  correctedType?: string;
  reason?: string;
  suggestedTarget?: string;
}

export interface ResolvedReference extends Reference {
  resolvedTarget?: string;
  resolvedArticle?: string;
  resolvedLaw?: string;
}

export class LLMValidator {
  private ollama: Ollama;
  private model: string;

  constructor(model: string = 'qwen2.5:7b') {
    this.ollama = new Ollama();
    this.model = model;
  }

  /**
   * 検出された参照のバリデーション
   */
  async validateReferences(
    text: string,
    references: Reference[]
  ): Promise<LLMValidationResult[]> {
    if (references.length === 0) {
      return [];
    }

    const prompt = this.buildValidationPrompt(text, references);
    
    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
        format: 'json'
      });

      return this.parseValidationResult(response.response, references);
    } catch (error) {
      console.error('LLM validation error:', error);
      // エラー時は元の参照をそのまま有効として返す
      return references.map(ref => ({
        originalReference: ref,
        isValid: true,
        confidence: 0.5,
        reason: 'LLM validation failed'
      }));
    }
  }

  /**
   * 相対参照（「前条」「同項」等）の解決
   */
  async resolveRelativeReferences(
    text: string,
    references: Reference[],
    currentArticle?: string
  ): Promise<ResolvedReference[]> {
    const relativeRefs = references.filter(ref => ref.type === 'relative');
    
    if (relativeRefs.length === 0) {
      return references;
    }

    const prompt = this.buildRelativeResolutionPrompt(text, relativeRefs, currentArticle);
    
    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
        format: 'json'
      });

      const resolved = this.parseRelativeResolution(response.response, relativeRefs);
      
      // 解決された参照と元の参照をマージ
      return references.map(ref => {
        const resolvedRef = resolved.find(r => 
          r.sourceText === ref.sourceText && 
          r.position.start === ref.position.start
        );
        return resolvedRef || ref;
      });
    } catch (error) {
      console.error('LLM relative resolution error:', error);
      return references;
    }
  }

  /**
   * 見逃された参照の検出
   */
  async detectMissedReferences(
    text: string,
    existingRefs: Reference[]
  ): Promise<Reference[]> {
    const prompt = this.buildMissedDetectionPrompt(text, existingRefs);
    
    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
        format: 'json'
      });

      return this.parseMissedReferences(response.response, text);
    } catch (error) {
      console.error('LLM missed detection error:', error);
      return [];
    }
  }

  private buildValidationPrompt(text: string, references: Reference[]): string {
    const refList = references.map((ref, idx) => 
      `${idx + 1}. "${ref.sourceText}" - タイプ: ${ref.type}, 対象: ${ref.targetLaw || ref.targetArticle || '不明'}`
    ).join('\n');

    return `あなたは日本の法令文書の専門家です。以下の法令テキストから検出された参照を検証してください。

テキスト:
"""
${text}
"""

検出された参照:
${refList}

各参照について以下を判定してください：
1. 正しく検出されているか（誤検出ではないか）
2. 参照タイプは適切か
3. 重複や過剰検出がないか

出力はJSON形式で、以下の構造にしてください：
{
  "validations": [
    {
      "index": 1,
      "valid": true,
      "confidence": 0.95,
      "correct_type": "external",
      "reason": "民法第九十条への正しい外部参照"
    }
  ]
}`;
  }

  private buildRelativeResolutionPrompt(
    text: string,
    relativeRefs: Reference[],
    currentArticle?: string
  ): string {
    const refList = relativeRefs.map((ref, idx) => 
      `${idx + 1}. "${ref.sourceText}" (位置: ${ref.position?.start || 0}-${ref.position?.end || 0})`
    ).join('\n');

    return `日本の法令文書における相対参照を解決してください。

現在の条文: ${currentArticle || '不明'}

テキスト:
"""
${text}
"""

解決が必要な相対参照:
${refList}

各相対参照について、実際に参照している条文番号を特定してください。
例：「前条」→「第3条」、「同項」→「第5条第2項」

出力はJSON形式で：
{
  "resolutions": [
    {
      "index": 1,
      "original": "前条",
      "resolved": "第3条",
      "confidence": 0.9
    }
  ]
}`;
  }

  private buildMissedDetectionPrompt(text: string, existingRefs: Reference[]): string {
    const existingList = existingRefs.map(ref => ref.sourceText).join(', ');

    return `日本の法令文書から参照を検出してください。

テキスト:
"""
${text}
"""

既に検出済みの参照: ${existingList || 'なし'}

上記以外で、まだ検出されていない法令参照を見つけてください。
特に以下のパターンに注意：
- 略称（「民訴」「特措法」等）
- 文脈依存の参照（「関係法令」「別に定める」等）
- 間接的な参照

出力はJSON形式で：
{
  "missed_references": [
    {
      "text": "民訴第百条",
      "type": "external",
      "target": "民事訴訟法第百条",
      "confidence": 0.85
    }
  ]
}`;
  }

  private parseValidationResult(
    jsonResponse: string,
    originalRefs: Reference[]
  ): LLMValidationResult[] {
    try {
      const parsed = JSON.parse(jsonResponse);
      const validations = parsed.validations || [];

      return originalRefs.map((ref, idx) => {
        const validation = validations.find((v: any) => v.index === idx + 1) || {};
        return {
          originalReference: ref,
          isValid: validation.valid !== false,
          confidence: validation.confidence || 0.5,
          correctedType: validation.correct_type,
          reason: validation.reason
        };
      });
    } catch (error) {
      console.error('Failed to parse validation result:', error);
      return originalRefs.map(ref => ({
        originalReference: ref,
        isValid: true,
        confidence: 0.5,
        reason: 'Parse error'
      }));
    }
  }

  private parseRelativeResolution(
    jsonResponse: string,
    relativeRefs: Reference[]
  ): ResolvedReference[] {
    try {
      const parsed = JSON.parse(jsonResponse);
      const resolutions = parsed.resolutions || [];

      return relativeRefs.map((ref, idx) => {
        const resolution = resolutions.find((r: any) => r.index === idx + 1);
        if (resolution && resolution.resolved) {
          return {
            ...ref,
            resolvedTarget: resolution.resolved,
            resolvedArticle: resolution.resolved
          } as ResolvedReference;
        }
        return ref as ResolvedReference;
      });
    } catch (error) {
      console.error('Failed to parse relative resolution:', error);
      return relativeRefs as ResolvedReference[];
    }
  }

  private parseMissedReferences(jsonResponse: string, originalText: string): Reference[] {
    try {
      const parsed = JSON.parse(jsonResponse);
      const missedRefs = parsed.missed_references || [];

      return missedRefs.map((ref: any) => {
        const position = originalText.indexOf(ref.text);
        return {
          sourceText: ref.text,
          type: ref.type || 'external',
          targetLaw: ref.target,
          position: {
            start: position >= 0 ? position : 0,
            end: position >= 0 ? position + ref.text.length : ref.text.length
          }
        } as Reference;
      });
    } catch (error) {
      console.error('Failed to parse missed references:', error);
      return [];
    }
  }

  /**
   * プロンプトのバッチ処理用メソッド
   */
  async validateBatch(
    texts: string[],
    referencesBatch: Reference[][]
  ): Promise<LLMValidationResult[][]> {
    const results: LLMValidationResult[][] = [];
    
    for (let i = 0; i < texts.length; i++) {
      const validated = await this.validateReferences(texts[i], referencesBatch[i]);
      results.push(validated);
      
      // レート制限対策
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
}