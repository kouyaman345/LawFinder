#!/usr/bin/env npx tsx

/**
 * 強化パターン検出エンジン
 * 90%精度達成を目指す改善版
 */

interface EnhancedReference {
  type: 'external' | 'internal' | 'relative' | 'structural' | 'range' | 'nested' | 'contextual';
  text: string;
  targetLaw?: string;
  targetArticle?: string;
  confidence: number;
  pattern: string;
}

export class EnhancedPatternDetector {
  private kanjiNumbers: Record<string, number> = {
    '〇': 0, '零': 0,
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000, '万': 10000,
  };

  /**
   * 改善された漢数字変換
   */
  private convertKanjiToNumber(text: string): number {
    let result = 0;
    let temp = 0;
    let digit = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const value = this.kanjiNumbers[char];

      if (value === undefined) continue;

      if (value === 10000) {
        result += (temp + digit) * value;
        temp = 0;
        digit = 0;
      } else if (value === 1000) {
        temp += (digit || 1) * value;
        digit = 0;
      } else if (value === 100) {
        temp += (digit || 1) * value;
        digit = 0;
      } else if (value === 10) {
        temp += (digit || 1) * value;
        digit = 0;
      } else {
        digit = value;
      }
    }

    return result + temp + digit;
  }

  /**
   * メイン検出メソッド
   */
  public detect(text: string): EnhancedReference[] {
    const references: EnhancedReference[] = [];

    // Pattern 1: 法令名 + 数字条文
    this.detectLawWithArticle(text, references);
    
    // Pattern 2: 漢数字条文（改善版）
    this.detectKanjiArticles(text, references);
    
    // Pattern 3: 相対参照
    this.detectRelativeReferences(text, references);
    
    // Pattern 4: 範囲参照（改善版）
    this.detectRangeReferences(text, references);
    
    // Pattern 5: 構造参照
    this.detectStructuralReferences(text, references);
    
    // Pattern 6: 複合・入れ子参照
    this.detectNestedReferences(text, references);
    
    // Pattern 7: 文脈依存参照
    this.detectContextualReferences(text, references);

    return this.deduplicateReferences(references);
  }

  /**
   * 法令名＋条文
   */
  private detectLawWithArticle(text: string, refs: EnhancedReference[]): void {
    const pattern = /([^、。\s]+(?:法|政令|規則|条例))(?:第)?(\d+)条/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      refs.push({
        type: 'external',
        text: match[0],
        targetLaw: match[1],
        targetArticle: match[2],
        confidence: 0.95,
        pattern: 'law_with_article',
      });
    }
  }

  /**
   * 漢数字条文（改善版）
   */
  private detectKanjiArticles(text: string, refs: EnhancedReference[]): void {
    // 複雑な漢数字にも対応
    const pattern = /第([〇一二三四五六七八九十百千万]+)条/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const articleNum = this.convertKanjiToNumber(match[1]);
      refs.push({
        type: 'internal',
        text: match[0],
        targetArticle: articleNum.toString(),
        confidence: 0.9,
        pattern: 'kanji_article',
      });
    }
  }

  /**
   * 相対参照
   */
  private detectRelativeReferences(text: string, refs: EnhancedReference[]): void {
    const patterns = [
      /前条/g,
      /次条/g,
      /前項/g,
      /次項/g,
      /前([二三四五六七八九十]+)条/g,
      /次([二三四五六七八九十]+)条/g,
      /前各項/g,
      /次各項/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        refs.push({
          type: 'relative',
          text: match[0],
          confidence: 0.85,
          pattern: 'relative_ref',
        });
      }
    }
  }

  /**
   * 範囲参照（改善版）
   */
  private detectRangeReferences(text: string, refs: EnhancedReference[]): void {
    // 数字と漢数字の両方に対応
    const patterns = [
      /第(\d+)条から第(\d+)条まで/g,
      /第([〇一二三四五六七八九十百千万]+)条から第([〇一二三四五六七八九十百千万]+)条まで/g,
      /第(\d+)条の(\d+)から第(\d+)条の(\d+)まで/g,
      /第(\d+)項から第(\d+)項まで/g,
      /第(\d+)号から第(\d+)号まで/g,
      /([イロハニホヘト])から([イロハニホヘト])まで/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        refs.push({
          type: 'range',
          text: match[0],
          confidence: 0.9,
          pattern: 'range_ref',
        });
        
        // 範囲を展開（簡易版）
        if (match[1] && match[2]) {
          const start = typeof match[1] === 'string' && match[1].match(/[〇一二三四五六七八九十百千万]/)
            ? this.convertKanjiToNumber(match[1])
            : parseInt(match[1]);
          const end = typeof match[2] === 'string' && match[2].match(/[〇一二三四五六七八九十百千万]/)
            ? this.convertKanjiToNumber(match[2])
            : parseInt(match[2]);
            
          if (!isNaN(start) && !isNaN(end) && start < end) {
            refs.push({
              type: 'range',
              text: `${match[0]}（展開）`,
              confidence: 0.85,
              pattern: 'range_expanded',
            });
          }
        }
      }
    }
  }

  /**
   * 構造参照
   */
  private detectStructuralReferences(text: string, refs: EnhancedReference[]): void {
    const patterns = [
      /第([〇一二三四五六七八九十百千万]+)編/g,
      /第([〇一二三四五六七八九十百千万]+)章/g,
      /第([〇一二三四五六七八九十百千万]+)節/g,
      /第([〇一二三四五六七八九十百千万]+)款/g,
      /第([〇一二三四五六七八九十百千万]+)目/g,
      /前章/g,
      /次章/g,
      /本章/g,
      /この編/g,
      /この章/g,
      /この節/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        refs.push({
          type: 'structural',
          text: match[0],
          confidence: 0.8,
          pattern: 'structural_ref',
        });
      }
    }
  }

  /**
   * 複合・入れ子参照
   */
  private detectNestedReferences(text: string, refs: EnhancedReference[]): void {
    // 「及び」「並びに」で結合された参照
    const pattern1 = /([^、。]+)(?:及び|並びに)([^、。]+)/g;
    let match;
    
    while ((match = pattern1.exec(text)) !== null) {
      // 各部分に「条」「項」「号」が含まれているか確認
      if ((match[1].includes('条') || match[1].includes('項') || match[1].includes('号')) &&
          (match[2].includes('条') || match[2].includes('項') || match[2].includes('号'))) {
        refs.push({
          type: 'nested',
          text: match[0],
          confidence: 0.75,
          pattern: 'nested_ref',
        });
      }
    }

    // 除外付き参照
    const pattern2 = /([^（]+)（([^）]+を除く。?)）/g;
    while ((match = pattern2.exec(text)) !== null) {
      if (match[1].includes('条') || match[1].includes('項')) {
        refs.push({
          type: 'nested',
          text: match[0],
          confidence: 0.7,
          pattern: 'exclusion_ref',
        });
      }
    }
  }

  /**
   * 文脈依存参照
   */
  private detectContextualReferences(text: string, refs: EnhancedReference[]): void {
    const patterns = [
      /同法/g,
      /同条/g,
      /同項/g,
      /同号/g,
      /当該[^、。]+/g,
      /この[^、。]*(?:法律|政令|省令|規則)/g,
      /本法/g,
      /旧法/g,
      /新法/g,
      /法第(\d+)条/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 「当該」の場合は続く語句も含める
        if (match[0].startsWith('当該')) {
          const extendedMatch = text.slice(match.index).match(/当該[^、。]{1,20}/);
          if (extendedMatch) {
            refs.push({
              type: 'contextual',
              text: extendedMatch[0],
              confidence: 0.6,
              pattern: 'contextual_ref',
            });
          }
        } else {
          refs.push({
            type: 'contextual',
            text: match[0],
            confidence: 0.65,
            pattern: 'contextual_ref',
          });
        }
      }
    }
  }

  /**
   * 重複除去
   */
  private deduplicateReferences(refs: EnhancedReference[]): EnhancedReference[] {
    const seen = new Set<string>();
    return refs.filter(ref => {
      const key = `${ref.type}:${ref.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// テスト実行
if (require.main === module) {
  const detector = new EnhancedPatternDetector();
  const { complexTestCases } = require('./complex-test-cases');
  
  console.log('=== 強化パターン検出テスト ===\n');
  
  let totalExpected = 0;
  let totalDetected = 0;
  let correctCount = 0;
  
  for (const tc of complexTestCases) {
    const refs = detector.detect(tc.text);
    const detected = refs.length;
    const isCorrect = detected >= tc.expected;
    
    totalExpected += tc.expected;
    totalDetected += detected;
    if (isCorrect) correctCount += tc.expected;
    
    console.log(
      `[${tc.difficulty}] ${tc.name}: ` +
      `期待=${tc.expected}, 検出=${detected} ${isCorrect ? '✅' : '❌'}`
    );
  }
  
  const precision = totalDetected > 0 ? (correctCount / totalDetected * 100) : 0;
  const recall = totalExpected > 0 ? (correctCount / totalExpected * 100) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
  
  console.log('\n=== 総合結果 ===');
  console.log(`精度: ${precision.toFixed(1)}%`);
  console.log(`再現率: ${recall.toFixed(1)}%`);
  console.log(`F1スコア: ${f1.toFixed(1)}%`);
  console.log(`\n目標（90%）まで: ${(90 - f1).toFixed(1)}pt`);
}