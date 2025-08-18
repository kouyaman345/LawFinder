/**
 * 拡張参照検出器 v4.0.0
 * 略称辞書と文脈追跡を統合した高精度版
 */

import { Reference } from '../models/Reference';
import { abbreviationDictionary } from '../../lib/abbreviation-dictionary';

interface DetectionContext {
  currentLaw?: string;
  currentArticle?: string;
  currentSection?: string;
  previousArticles: string[];
  detectedLaws: Set<string>;
}

export class EnhancedReferenceDetectorV40 {
  private context: DetectionContext;
  private readonly VERSION = '4.0.0';
  
  constructor() {
    this.context = {
      previousArticles: [],
      detectedLaws: new Set()
    };
  }
  
  /**
   * 参照検出のメインエントリポイント
   */
  detectReferences(text: string, currentArticle?: string): Reference[] {
    // コンテキストを更新
    if (currentArticle) {
      this.context.currentArticle = currentArticle;
      this.context.previousArticles.push(currentArticle);
      if (this.context.previousArticles.length > 10) {
        this.context.previousArticles.shift();
      }
    }
    
    const references: Reference[] = [];
    
    // Step 1: 略称を展開
    const expandedReferences = this.detectAbbreviatedReferences(text);
    references.push(...expandedReferences);
    
    // Step 2: 通常の参照検出（v3.7の処理を継承）
    const standardRefs = this.detectStandardReferences(text);
    references.push(...standardRefs);
    
    // Step 3: 文脈依存参照の解決
    const contextualRefs = this.resolveContextualReferences(text);
    references.push(...contextualRefs);
    
    // Step 4: 間接参照の強化検出
    const indirectRefs = this.detectEnhancedIndirectReferences(text);
    references.push(...indirectRefs);
    
    // 重複除去と並べ替え
    return this.deduplicateAndSort(references);
  }
  
  /**
   * 略称参照の検出
   */
  private detectAbbreviatedReferences(text: string): Reference[] {
    const references: Reference[] = [];
    const expansions = abbreviationDictionary.expandAbbreviations(text);
    
    expansions.forEach(expansion => {
      // 検出された法令をコンテキストに追加
      this.context.detectedLaws.add(expansion.entry.fullName);
      
      references.push({
        sourceText: expansion.original,
        type: 'external',
        targetLaw: expansion.entry.fullName,
        targetArticle: expansion.article,
        position: expansion.position,
        confidence: 0.95, // 略称辞書は高信頼度
        metadata: {
          expandedFrom: expansion.entry.abbreviation,
          lawNumber: expansion.entry.lawNumber,
          category: expansion.entry.category
        }
      });
    });
    
    return references;
  }
  
  /**
   * 標準的な参照検出（v3.7ロジックのベース）
   */
  private detectStandardReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // 前処理: 並列参照の展開
    const processedText = this.preprocessParallelReferences(text);
    
    // パターンマッチング
    const patterns = [
      // 内部参照パターン
      /第([一二三四五六七八九十百千万\d]+)条(?:の([一二三四五六七八九十\d]+))?(?:第([一二三四五六七八九十\d]+)項)?(?:第([一二三四五六七八九十\d]+)号)?/g,
      
      // 外部参照パターン（法令名付き）
      /([^、。\s]+?(?:法(?:律)?|施行令|施行規則|政令|省令|規則|条例|告示|通達|訓令))(?:第([一二三四五六七八九十百千万\d]+)条)?/g,
      
      // 範囲参照
      /第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/g,
      
      // 複数参照
      /第([一二三四五六七八九十百千万\d]+)条(?:、第([一二三四五六七八九十百千万\d]+)条)*(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      
      // 準用・適用
      /(.+?)(?:の規定)?(?:を|は)(?:準用|適用)(?:する|される)?/g
    ];
    
    patterns.forEach((pattern, index) => {
      let match;
      const localPattern = new RegExp(pattern.source, pattern.flags);
      
      while ((match = localPattern.exec(processedText)) !== null) {
        const position = {
          start: match.index,
          end: match.index + match[0].length
        };
        
        // パターンごとの処理
        if (index === 0) {
          // 内部参照
          references.push({
            sourceText: match[0],
            type: 'internal',
            targetArticle: `第${match[1]}条` + 
              (match[2] ? `の${match[2]}` : '') +
              (match[3] ? `第${match[3]}項` : '') +
              (match[4] ? `第${match[4]}号` : ''),
            position,
            confidence: 0.9
          });
        } else if (index === 1) {
          // 外部参照
          const lawName = match[1];
          if (!this.isIgnoredLawName(lawName)) {
            references.push({
              sourceText: match[0],
              type: 'external',
              targetLaw: lawName,
              targetArticle: match[2] ? `第${match[2]}条` : undefined,
              position,
              confidence: 0.85
            });
            this.context.detectedLaws.add(lawName);
          }
        } else if (index === 2) {
          // 範囲参照
          references.push({
            sourceText: match[0],
            type: 'range',
            targetArticle: `第${match[1]}条から第${match[2]}条まで`,
            position,
            confidence: 0.9
          });
        } else if (index === 3) {
          // 複数参照
          const articles = [match[1]];
          if (match[2]) articles.push(match[2]);
          articles.push(match[3]);
          
          articles.forEach(article => {
            references.push({
              sourceText: `第${article}条`,
              type: 'multiple',
              targetArticle: `第${article}条`,
              position: {
                start: position.start,
                end: position.start + `第${article}条`.length
              },
              confidence: 0.85
            });
          });
        } else if (index === 4) {
          // 準用・適用
          if (match[1] && match[1].length > 2) {
            references.push({
              sourceText: match[0],
              type: 'application',
              targetLaw: this.extractLawFromApplication(match[1]),
              position,
              confidence: 0.8
            });
          }
        }
      }
    });
    
    return references;
  }
  
  /**
   * 文脈依存参照の解決
   */
  private resolveContextualReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // 相対参照パターン
    const relativePatterns = [
      { pattern: /前条/g, offset: -1, type: 'previous' },
      { pattern: /次条/g, offset: 1, type: 'next' },
      { pattern: /前項/g, offset: -1, type: 'previous_paragraph' },
      { pattern: /次項/g, offset: 1, type: 'next_paragraph' },
      { pattern: /同条/g, offset: 0, type: 'same_article' },
      { pattern: /同項/g, offset: 0, type: 'same_paragraph' },
      { pattern: /本条/g, offset: 0, type: 'this_article' },
      { pattern: /前三条/g, offset: -3, type: 'previous_three' },
      { pattern: /前二条/g, offset: -2, type: 'previous_two' }
    ];
    
    relativePatterns.forEach(({ pattern, offset, type }) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const resolvedArticle = this.resolveRelativeArticle(offset, type);
        
        if (resolvedArticle) {
          references.push({
            sourceText: match[0],
            type: 'relative',
            targetArticle: resolvedArticle,
            position: {
              start: match.index,
              end: match.index + match[0].length
            },
            confidence: 0.7, // 文脈依存は信頼度やや低め
            metadata: {
              relativeType: type,
              resolvedFrom: this.context.currentArticle
            }
          });
        }
      }
    });
    
    return references;
  }
  
  /**
   * 間接参照の強化検出
   */
  private detectEnhancedIndirectReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    const indirectPatterns = [
      {
        pattern: /関係法令(?:の定め)?/g,
        type: 'related_laws',
        confidence: 0.6
      },
      {
        pattern: /別に(?:法律|政令|省令|規則)?(?:で|により)定める/g,
        type: 'separately_defined',
        confidence: 0.6
      },
      {
        pattern: /他の法律(?:に特別の定めがある)?/g,
        type: 'other_laws',
        confidence: 0.5
      },
      {
        pattern: /特別(?:の)?(?:法律|規定|定め)/g,
        type: 'special_provisions',
        confidence: 0.5
      },
      {
        pattern: /法令(?:の規定)?(?:により|に基づ[きく])/g,
        type: 'legal_provisions',
        confidence: 0.5
      },
      {
        pattern: /主務(?:大臣|省令)/g,
        type: 'competent_authority',
        confidence: 0.7
      },
      {
        pattern: /所管(?:官庁|大臣|省令)/g,
        type: 'supervising_authority',
        confidence: 0.7
      }
    ];
    
    indirectPatterns.forEach(({ pattern, type, confidence }) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // コンテキストから推定される法令を特定
        const inferredLaws = this.inferLawsFromContext(type);
        
        references.push({
          sourceText: match[0],
          type: 'indirect',
          targetLaw: inferredLaws.length > 0 ? inferredLaws[0] : undefined,
          position: {
            start: match.index,
            end: match.index + match[0].length
          },
          confidence,
          metadata: {
            indirectType: type,
            possibleLaws: inferredLaws
          }
        });
      }
    });
    
    return references;
  }
  
  /**
   * 並列参照の前処理
   */
  private preprocessParallelReferences(text: string): string {
    let processed = text;
    
    // パターン: 「X施行令第Y条及びZ施行令第W条」を展開
    processed = processed.replace(
      /([^、。\s]+施行令)(第[一二三四五六七八九十百千万\d]+条)(?:及び|並びに)([^、。\s]+施行令)(第[一二三四五六七八九十百千万\d]+条)/g,
      '$1$2、$3$4'
    );
    
    // 「第X条、第Y条及び第Z条」を展開
    processed = processed.replace(
      /第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      '第$1条、第$2条、第$3条'
    );
    
    return processed;
  }
  
  /**
   * 無視すべき法令名かチェック
   */
  private isIgnoredLawName(lawName: string): boolean {
    const ignoredPatterns = [
      /^この/,
      /^当該/,
      /^同/,
      /^前記/,
      /^後記/,
      /^上記/,
      /^下記/,
      /^別記/,
      /^次の/
    ];
    
    return ignoredPatterns.some(pattern => pattern.test(lawName));
  }
  
  /**
   * 準用・適用文から法令名を抽出
   */
  private extractLawFromApplication(text: string): string | undefined {
    // 法令名パターンの抽出
    const lawPattern = /([^、。\s]+?(?:法(?:律)?|施行令|施行規則|政令|省令|規則|条例))/;
    const match = text.match(lawPattern);
    
    if (match && !this.isIgnoredLawName(match[1])) {
      return match[1];
    }
    
    // 条文パターンの抽出
    const articlePattern = /第([一二三四五六七八九十百千万\d]+)条/;
    const articleMatch = text.match(articlePattern);
    
    if (articleMatch) {
      return `第${articleMatch[1]}条`;
    }
    
    return undefined;
  }
  
  /**
   * 相対的な条文参照を解決
   */
  private resolveRelativeArticle(offset: number, type: string): string | undefined {
    if (!this.context.currentArticle) {
      return undefined;
    }
    
    // 現在の条文番号を抽出
    const currentMatch = this.context.currentArticle.match(/第([一二三四五六七八九十百千万\d]+)条/);
    if (!currentMatch) {
      return undefined;
    }
    
    const currentNum = this.kanjiToNumber(currentMatch[1]);
    
    if (type === 'same_article' || type === 'this_article') {
      return this.context.currentArticle;
    }
    
    if (type === 'same_paragraph') {
      // 同じ条文の同じ項を返す
      return this.context.currentArticle;
    }
    
    if (type.includes('previous') || type.includes('next')) {
      const targetNum = currentNum + offset;
      
      if (targetNum > 0) {
        if (type === 'previous_three') {
          // 前三条の場合は範囲を返す
          return `第${this.numberToKanji(targetNum)}条から第${this.numberToKanji(currentNum - 1)}条まで`;
        } else if (type === 'previous_two') {
          // 前二条の場合は範囲を返す
          return `第${this.numberToKanji(targetNum)}条から第${this.numberToKanji(currentNum - 1)}条まで`;
        } else {
          return `第${this.numberToKanji(targetNum)}条`;
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * コンテキストから法令を推定
   */
  private inferLawsFromContext(type: string): string[] {
    const inferred: string[] = [];
    
    // 検出済みの法令から推定
    if (type === 'related_laws' || type === 'other_laws') {
      // 施行令・施行規則を推定
      this.context.detectedLaws.forEach(law => {
        if (law.includes('法')) {
          const baseName = law.replace(/法$/, '');
          inferred.push(`${baseName}法施行令`);
          inferred.push(`${baseName}法施行規則`);
        }
      });
    }
    
    if (type === 'competent_authority' || type === 'supervising_authority') {
      // 省令を推定
      inferred.push('厚生労働省令');
      inferred.push('経済産業省令');
      inferred.push('国土交通省令');
    }
    
    return inferred.slice(0, 3); // 最大3つまで
  }
  
  /**
   * 漢数字を数値に変換
   */
  private kanjiToNumber(kanji: string): number {
    if (/^\d+$/.test(kanji)) {
      return parseInt(kanji, 10);
    }
    
    const kanjiNumbers: { [key: string]: number } = {
      '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
      '十': 10, '百': 100, '千': 1000, '万': 10000
    };
    
    let result = 0;
    let temp = 0;
    let prevValue = 0;
    
    for (const char of kanji) {
      const value = kanjiNumbers[char];
      if (value === undefined) continue;
      
      if (value === 10 || value === 100 || value === 1000 || value === 10000) {
        if (temp === 0) temp = 1;
        temp *= value;
        result += temp;
        temp = 0;
      } else {
        if (prevValue >= 10) {
          result += value;
          temp = 0;
        } else {
          temp = temp * 10 + value;
        }
      }
      prevValue = value;
    }
    
    return result + temp;
  }
  
  /**
   * 数値を漢数字に変換
   */
  private numberToKanji(num: number): string {
    if (num === 0) return '〇';
    
    const kanjiDigits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const units = ['', '十', '百', '千'];
    
    if (num < 10) {
      return kanjiDigits[num];
    }
    
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      
      if (tens === 1) {
        return ones === 0 ? '十' : `十${kanjiDigits[ones]}`;
      }
      return ones === 0 ? `${kanjiDigits[tens]}十` : `${kanjiDigits[tens]}十${kanjiDigits[ones]}`;
    }
    
    // 100以上は簡略化
    return num.toString();
  }
  
  /**
   * 重複除去とソート
   */
  private deduplicateAndSort(references: Reference[]): Reference[] {
    const seen = new Set<string>();
    const unique: Reference[] = [];
    
    references.forEach(ref => {
      const key = `${ref.sourceText}_${ref.position.start}_${ref.targetLaw || ''}_${ref.targetArticle || ''}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ref);
      }
    });
    
    // 位置でソート
    return unique.sort((a, b) => a.position.start - b.position.start);
  }
  
  /**
   * コンテキストをリセット
   */
  resetContext(): void {
    this.context = {
      previousArticles: [],
      detectedLaws: new Set()
    };
  }
  
  /**
   * バージョン情報を取得
   */
  getVersion(): string {
    return this.VERSION;
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(): {
    detectedLaws: number;
    contextArticles: number;
    dictionarySize: number;
  } {
    const dictStats = abbreviationDictionary.getStatistics();
    
    return {
      detectedLaws: this.context.detectedLaws.size,
      contextArticles: this.context.previousArticles.length,
      dictionarySize: dictStats.totalEntries
    };
  }
}