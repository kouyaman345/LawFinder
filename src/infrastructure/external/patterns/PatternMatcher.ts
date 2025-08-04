import { PatternMatcher, MatchedPattern } from '@domain/services/ReferenceAnalysisService';
import { REFERENCE_PATTERNS, Pattern, kanjiToNumber } from './ReferencePatterns';

export interface ExtractedPattern {
  text: string;
  type: string;
  position: number;
  category: string;
  metadata?: Record<string, any>;
}

export class RegexPatternMatcher implements PatternMatcher {
  findPatterns(text: string): MatchedPattern[] {
    const patterns: ExtractedPattern[] = [];
    
    // 各カテゴリのパターンを適用
    this.applyPatterns(text, REFERENCE_PATTERNS.structural, 'structural', patterns);
    this.applyPatterns(text, REFERENCE_PATTERNS.basic, 'basic', patterns);
    this.applyPatterns(text, REFERENCE_PATTERNS.implicit, 'implicit', patterns);
    this.applyCompoundPatterns(text, REFERENCE_PATTERNS.compound, patterns);
    
    // 統合と優先度付け
    return this.consolidatePatterns(patterns);
  }
  
  private applyPatterns(
    text: string,
    patterns: Pattern[],
    category: string,
    results: ExtractedPattern[]
  ): void {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        results.push({
          text: match[0],
          type: pattern.type,
          position: match.index,
          category: category,
          metadata: this.extractMetadata(match, pattern)
        });
      }
    }
  }
  
  private applyCompoundPatterns(
    text: string,
    patterns: Pattern[],
    results: ExtractedPattern[]
  ): void {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        results.push({
          text: match[0],
          type: pattern.type,
          position: match.index,
          category: 'compound',
          metadata: {
            condition: match[1]?.trim(),
            target: match[2]?.trim()
          }
        });
      }
    }
  }
  
  private extractMetadata(match: RegExpExecArray, pattern: Pattern): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    switch (pattern.type) {
      case 'ARTICLE':
      case 'PARAGRAPH':
      case 'ITEM':
        if (match[1]) {
          metadata.number = kanjiToNumber(match[1]);
        }
        break;
      case 'RANGE':
        if (match[1] && match[2]) {
          metadata.startNumber = kanjiToNumber(match[1]);
          metadata.endNumber = kanjiToNumber(match[2]);
        }
        break;
    }
    
    return metadata;
  }
  
  private consolidatePatterns(patterns: ExtractedPattern[]): MatchedPattern[] {
    // 位置でソート
    patterns.sort((a, b) => a.position - b.position);
    
    // 重複除去と信頼度計算
    const consolidated: MatchedPattern[] = [];
    const processedPositions = new Set<string>();
    
    for (const pattern of patterns) {
      const posKey = `${pattern.position}-${pattern.text}`;
      if (processedPositions.has(posKey)) continue;
      
      processedPositions.add(posKey);
      consolidated.push({
        text: pattern.text,
        type: pattern.type,
        position: pattern.position,
        confidence: this.calculateConfidence(pattern)
      });
    }
    
    return consolidated;
  }
  
  private calculateConfidence(pattern: ExtractedPattern): number {
    let confidence = 0.5; // 基本信頼度
    
    // カテゴリによる信頼度調整
    switch (pattern.category) {
      case 'structural':
        confidence = 0.95; // 構造パターンは高信頼度
        break;
      case 'basic':
        confidence = 0.85;
        break;
      case 'implicit':
        confidence = 0.7;
        break;
      case 'compound':
        confidence = 0.8;
        break;
    }
    
    // 特定のパターンに対する追加調整
    if (pattern.type === 'ARTICLE' && pattern.metadata?.number) {
      confidence = 0.98; // 明確な条番号は最高信頼度
    }
    
    return confidence;
  }
}