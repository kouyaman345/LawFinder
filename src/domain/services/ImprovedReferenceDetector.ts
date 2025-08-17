/**
 * 改善版参照検出エンジン
 * より包括的で正確な参照検出を実現
 */

export interface DetectedReference {
  type: 'internal' | 'external' | 'relative' | 'structural' | 'application' | 'range' | 'multiple';
  text: string;           // 参照テキスト全体
  context: string;        // 参照を含む文
  confidence: number;     // 検出信頼度 (0-1)
  startPos: number;       // 文中の開始位置
  endPos: number;         // 文中の終了位置
  
  // 参照先情報
  targetLaw?: string;     // 参照先法令名
  targetArticle?: string; // 参照先条番号
  targetParagraph?: number; // 参照先項番号
  targetItem?: string;    // 参照先号番号
  
  // 範囲参照
  targetArticleEnd?: string; // 終点条番号（範囲参照時）
  
  // 相対参照
  relativeType?: 'previous' | 'next' | 'same';
  relativeDistance?: number;
  
  // 構造参照
  structureType?: '編' | '章' | '節' | '款' | '目' | '項' | '号';
  structureName?: string;
  
  // 準用・適用
  applicationType?: string;
  modifications?: string[];
}

export class ImprovedReferenceDetector {
  
  // ===== 包括的パターン定義（優先度順）=====
  
  // 1. 最も包括的な外部法令参照パターン
  private readonly COMPREHENSIVE_EXTERNAL_PATTERNS = [
    // 法令名（括弧付き法番号）＋条文＋項番号まで含む完全パターン
    /([^（）]+法)（[^）]+）第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?(?:第([一二三四五六七八九十]+)項)?(?:第([一二三四五六七八九十]+)号)?/g,
    // 法令名＋条文＋項番号
    /([^法]+法)第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?(?:第([一二三四五六七八九十]+)項)?/g,
  ];

  // 2. 条文＋項＋号の組み合わせパターン
  private readonly ARTICLE_WITH_STRUCTURE_PATTERNS = [
    // 第X条第Y項第Z号
    /第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?第([一二三四五六七八九十]+)項(?:第([一二三四五六七八九十]+)号)?/g,
    // 第X条第Y項
    /第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?第([一二三四五六七八九十]+)項/g,
    // 第X条第Y号
    /第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?第([一二三四五六七八九十]+)号/g,
  ];

  // 3. 条文のみのパターン
  private readonly ARTICLE_ONLY_PATTERNS = [
    /第([一二三四五六七八九十百千]+)条の([一二三四五六七八九十]+)/g,
    /第([一二三四五六七八九十百千]+)条/g,
  ];

  // 4. 項・号のみのパターン（条文が前にない場合）
  private readonly STRUCTURE_ONLY_PATTERNS = [
    /(?<![条の])第([一二三四五六七八九十]+)項第([一二三四五六七八九十]+)号/g,
    /(?<![条の])第([一二三四五六七八九十]+)項/g,
    /(?<![条項の])第([一二三四五六七八九十]+)号/g,
    /([一二三四五六七八九十]+)号/g,
  ];

  // 5. 相対参照パターン
  private readonly RELATIVE_PATTERNS = [
    { pattern: /前([一二三四五六七八九十]+)項/g, type: 'previous' as const, unit: 'paragraph' },
    { pattern: /前項/g, type: 'previous' as const, unit: 'paragraph', distance: 1 },
    { pattern: /前([一二三四五六七八九十]+)条/g, type: 'previous' as const, unit: 'article' },
    { pattern: /前条/g, type: 'previous' as const, unit: 'article', distance: 1 },
    { pattern: /次([一二三四五六七八九十]+)項/g, type: 'next' as const, unit: 'paragraph' },
    { pattern: /次項/g, type: 'next' as const, unit: 'paragraph', distance: 1 },
    { pattern: /次([一二三四五六七八九十]+)条/g, type: 'next' as const, unit: 'article' },
    { pattern: /次条/g, type: 'next' as const, unit: 'article', distance: 1 },
    { pattern: /同項/g, type: 'same' as const, unit: 'paragraph', distance: 0 },
    { pattern: /同条/g, type: 'same' as const, unit: 'article', distance: 0 },
    { pattern: /各項/g, type: 'same' as const, unit: 'paragraph', distance: -1 },
    { pattern: /各号/g, type: 'same' as const, unit: 'item', distance: -1 },
  ];

  // 6. 範囲参照パターン
  private readonly RANGE_PATTERNS = [
    /第([一二三四五六七八九十百千]+)条から第([一二三四五六七八九十百千]+)条まで/g,
    /第([一二三四五六七八九十]+)項から第([一二三四五六七八九十]+)項まで/g,
    /第([一二三四五六七八九十]+)号から第([一二三四五六七八九十]+)号まで/g,
  ];

  // 7. 複数参照パターン
  private readonly MULTIPLE_PATTERNS = [
    /第([一二三四五六七八九十百千]+)条(?:、第([一二三四五六七八九十百千]+)条)+/g,
    /第([一二三四五六七八九十]+)項(?:、第([一二三四五六七八九十]+)項)+/g,
  ];

  // 8. 準用・適用パターン（より具体的なパターンで、短い参照を優先）
  private readonly APPLICATION_PATTERNS = [
    // 条文指定の準用・適用
    /(第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?(?:から第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?まで)?(?:及び第[一二三四五六七八九十百千]+条)*(?:第[一二三四五六七八九十]+項)?(?:第[一二三四五六七八九十]+号)?)の規定を準用する/g,
    /(第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?(?:から第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?まで)?(?:及び第[一二三四五六七八九十百千]+条)*(?:第[一二三四五六七八九十]+項)?(?:第[一二三四五六七八九十]+号)?)の規定を適用する/g,
    // 項・号指定の準用・適用
    /(前[一二三四五六七八九十]?項|次[一二三四五六七八九十]?項|同項|各項|第[一二三四五六七八九十]+項)の規定を準用する/g,
    /(前[一二三四五六七八九十]?項|次[一二三四五六七八九十]?項|同項|各項|第[一二三四五六七八九十]+項)の規定を適用する/g,
    // その他特定パターン
    /(前[一二三四五六七八九十]?条|次[一二三四五六七八九十]?条|同条)の規定を準用する/g,
    /(前[一二三四五六七八九十]?条|次[一二三四五六七八九十]?条|同条)の規定を適用する/g,
    // より限定的な一般パターン（30文字以内）
    /([^。、]{1,30})の例による/g,
    /([^。、]{1,30})について準用する/g,
    /([^。、]{1,30})について適用する/g,
  ];

  /**
   * すべての参照を検出（重複を除外し、より包括的な参照を優先）
   */
  public detectAllReferences(text: string): DetectedReference[] {
    const allRefs: DetectedReference[] = [];
    
    // 1. 最も包括的なパターンから順に検出（優先順位を調整）
    allRefs.push(...this.detectComprehensiveExternalReferences(text));
    allRefs.push(...this.detectArticleWithStructure(text));
    allRefs.push(...this.detectRangeReferences(text));
    allRefs.push(...this.detectMultipleReferences(text));
    allRefs.push(...this.detectRelativeReferences(text));  // 相対参照を先に
    allRefs.push(...this.detectApplicationReferences(text)); // 準用・適用を後に
    allRefs.push(...this.detectArticleOnly(text));
    allRefs.push(...this.detectStructureOnly(text));
    
    // 2. 重複除去（より包括的な参照を優先）
    return this.removeDuplicates(allRefs);
  }

  /**
   * 包括的な外部法令参照の検出
   */
  private detectComprehensiveExternalReferences(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.COMPREHENSIVE_EXTERNAL_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const ref: DetectedReference = {
          type: 'external',
          text: match[0],
          context: text,
          confidence: 0.95,
          startPos: match.index,
          endPos: match.index + match[0].length,
          targetLaw: match[1],
          targetArticle: match[2] ? this.convertKanjiArticle(match[2]) : undefined
        };
        
        if (match[3]) { // 条の枝番号
          ref.targetArticle = `${ref.targetArticle}の${match[3]}`;
        }
        if (match[4]) { // 項番号
          ref.targetParagraph = this.kanjiToNumber(match[4]);
        }
        if (match[5]) { // 号番号
          ref.targetItem = match[5];
        }
        
        refs.push(ref);
      }
    }
    
    return refs;
  }

  /**
   * 条文＋構造の検出
   */
  private detectArticleWithStructure(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.ARTICLE_WITH_STRUCTURE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const ref: DetectedReference = {
          type: 'internal',
          text: match[0],
          context: text,
          confidence: 0.95,
          startPos: match.index,
          endPos: match.index + match[0].length,
          targetArticle: this.convertKanjiArticle(match[1])
        };
        
        if (match[2]) { // 条の枝番号
          ref.targetArticle = `${ref.targetArticle}の${match[2]}`;
        }
        if (match[3]) { // 項番号
          ref.targetParagraph = this.kanjiToNumber(match[3]);
        }
        if (match[4]) { // 号番号
          ref.targetItem = match[4];
        }
        
        refs.push(ref);
      }
    }
    
    return refs;
  }

  /**
   * 条文のみの検出
   */
  private detectArticleOnly(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.ARTICLE_ONLY_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const ref: DetectedReference = {
          type: 'internal',
          text: match[0],
          context: text,
          confidence: 0.9,
          startPos: match.index,
          endPos: match.index + match[0].length,
          targetArticle: this.convertKanjiArticle(match[1])
        };
        
        if (match[2]) { // 条の枝番号
          ref.targetArticle = `${ref.targetArticle}の${match[2]}`;
        }
        
        refs.push(ref);
      }
    }
    
    return refs;
  }

  /**
   * 構造のみの検出
   */
  private detectStructureOnly(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.STRUCTURE_ONLY_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const ref: DetectedReference = {
          type: 'structural',
          text: match[0],
          context: text,
          confidence: 0.85,
          startPos: match.index,
          endPos: match.index + match[0].length
        };
        
        if (match[0].includes('項')) {
          ref.structureType = '項';
          ref.targetParagraph = this.kanjiToNumber(match[1]);
        }
        if (match[0].includes('号')) {
          ref.structureType = '号';
          ref.targetItem = match[match.length - 1];
        }
        
        refs.push(ref);
      }
    }
    
    return refs;
  }

  /**
   * 相対参照の検出
   */
  private detectRelativeReferences(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const relPattern of this.RELATIVE_PATTERNS) {
      let match;
      relPattern.pattern.lastIndex = 0;
      while ((match = relPattern.pattern.exec(text)) !== null) {
        let distance = relPattern.distance || 0;
        
        // 動的距離計算
        if (match[1]) {
          distance = this.kanjiToNumber(match[1]);
        }
        
        refs.push({
          type: 'relative',
          text: match[0],
          context: text,
          confidence: 0.9,
          startPos: match.index,
          endPos: match.index + match[0].length,
          relativeType: relPattern.type,
          relativeDistance: distance
        });
      }
    }
    
    return refs;
  }

  /**
   * 範囲参照の検出
   */
  private detectRangeReferences(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.RANGE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        refs.push({
          type: 'range',
          text: match[0],
          context: text,
          confidence: 0.9,
          startPos: match.index,
          endPos: match.index + match[0].length,
          targetArticle: this.convertKanjiArticle(match[1]),
          targetArticleEnd: this.convertKanjiArticle(match[2])
        });
      }
    }
    
    return refs;
  }

  /**
   * 複数参照の検出
   */
  private detectMultipleReferences(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    // 「及び」「並びに」を含む複数参照
    const complexPattern = /第([一二三四五六七八九十百千]+)条(?:(?:、第[一二三四五六七八九十百千]+条)*(?:及び|並びに)第[一二三四五六七八九十百千]+条)+/g;
    let match;
    complexPattern.lastIndex = 0;
    while ((match = complexPattern.exec(text)) !== null) {
      refs.push({
        type: 'multiple',
        text: match[0],
        context: text,
        confidence: 0.9,
        startPos: match.index,
        endPos: match.index + match[0].length
      });
    }
    
    return refs;
  }

  /**
   * 準用・適用参照の検出
   */
  private detectApplicationReferences(text: string): DetectedReference[] {
    const refs: DetectedReference[] = [];
    
    for (const pattern of this.APPLICATION_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        refs.push({
          type: 'application',
          text: match[0],
          context: text,
          confidence: 0.85,
          startPos: match.index,
          endPos: match.index + match[0].length,
          applicationType: match[0].includes('準用') ? '準用' : '適用'
        });
      }
    }
    
    return refs;
  }

  /**
   * 重複除去（より包括的な参照を優先）
   */
  private removeDuplicates(refs: DetectedReference[]): DetectedReference[] {
    // 位置でソート
    refs.sort((a, b) => a.startPos - b.startPos);
    
    const result: DetectedReference[] = [];
    const used = new Set<string>();
    
    for (const ref of refs) {
      // より包括的な参照を優先
      let isOverlapped = false;
      for (const existing of result) {
        if (this.isOverlapping(ref, existing)) {
          // より長い参照を優先
          if (ref.text.length > existing.text.length) {
            // 既存の参照を置き換え
            const index = result.indexOf(existing);
            result[index] = ref;
            used.delete(existing.text);
            used.add(ref.text);
          }
          isOverlapped = true;
          break;
        }
      }
      
      if (!isOverlapped && !used.has(ref.text)) {
        result.push(ref);
        used.add(ref.text);
      }
    }
    
    return result;
  }

  /**
   * 参照が重複しているかチェック
   */
  private isOverlapping(ref1: DetectedReference, ref2: DetectedReference): boolean {
    return (ref1.startPos >= ref2.startPos && ref1.startPos < ref2.endPos) ||
           (ref2.startPos >= ref1.startPos && ref2.startPos < ref1.endPos);
  }

  /**
   * 漢数字を数値に変換
   */
  private kanjiToNumber(kanji: string): number {
    const kanjiMap: { [key: string]: number } = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };

    let result = 0;
    let temp = 0;
    
    for (const char of kanji) {
      const num = kanjiMap[char];
      if (num === 10 || num === 100 || num === 1000) {
        if (temp === 0) temp = 1;
        result += temp * num;
        temp = 0;
      } else {
        temp = temp * 10 + num;
      }
    }
    
    return result + temp;
  }

  /**
   * 漢数字の条番号を変換（漢数字のまま保持）
   */
  private convertKanjiArticle(kanji: string): string {
    // 漢数字のまま返す（フロントエンドとの整合性のため）
    return kanji;
  }
}

export default ImprovedReferenceDetector;