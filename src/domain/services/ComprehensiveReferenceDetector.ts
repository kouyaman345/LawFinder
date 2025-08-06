/**
 * 包括的参照検出エンジン
 * すべての法令参照パターンを漏れなく検出する
 */

export interface DetectedReference {
  type: 'internal' | 'external' | 'relative' | 'structural' | 'application' | 'range' | 'multiple';
  text: string;           // 参照テキスト全体
  context: string;        // 参照を含む文
  confidence: number;     // 検出信頼度 (0-1)
  
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
  structureType?: '編' | '章' | '節' | '款' | '目';
  structureName?: string;
  
  // 準用・適用
  applicationScope?: string;
  modifications?: string[];
}

export class ComprehensiveReferenceDetector {
  
  // ===== 参照パターン定義 =====
  
  // 1. 条番号パターン（包括的）
  private readonly ARTICLE_PATTERNS = [
    // 漢数字パターン
    /第([一二三四五六七八九十百千]+)条/g,
    // 追加条文パターン
    /第([一二三四五六七八九十百千]+)条の([一二三四五六七八九十]+)/g,
    // アラビア数字併記パターン
    /第([０-９]+)条/g,
  ];

  // 2. 項・号パターン
  private readonly PARAGRAPH_ITEM_PATTERNS = [
    // 項のみ
    /第([一二三四五六七八九十]+)項/g,
    // 号のみ
    /第([一二三四五六七八九十]+)号/g,
    // 項と号の組み合わせ
    /第([一二三四五六七八九十]+)項第([一二三四五六七八九十]+)号/g,
    // 同項・同号パターン
    /同項第([一二三四五六七八九十]+)号/g,
    /第([一二三四五六七八九十]+)項同号/g,
  ];

  // 3. 相対参照パターン（拡張版）
  private readonly RELATIVE_PATTERNS = [
    // 前条・次条系
    { pattern: /前条/g, type: 'previous' as const, distance: 1 },
    { pattern: /前([二三四五六七八九十])条/g, type: 'previous' as const, distance: 0 }, // 動的計算
    { pattern: /次条/g, type: 'next' as const, distance: 1 },
    { pattern: /次([二三四五六七八九十])条/g, type: 'next' as const, distance: 0 },
    
    // 項の相対参照（単数）
    { pattern: /前項/g, type: 'previous' as const, distance: 1 },
    { pattern: /前([二三四五六七八九十])項/g, type: 'previous' as const, distance: 0 },
    { pattern: /次項/g, type: 'next' as const, distance: 1 },
    { pattern: /本項/g, type: 'same' as const, distance: 0 },
    { pattern: /同項/g, type: 'same' as const, distance: 0 },
    
    // 項の相対参照（複数） - 新規追加
    { pattern: /前([二三四五六七八九十])項/g, type: 'previous_multiple' as const, distance: 0 },
    { pattern: /前各項/g, type: 'previous_all' as const, distance: 0 },
    { pattern: /各項/g, type: 'all' as const, distance: 0 },
    
    // 号の相対参照
    { pattern: /前号/g, type: 'previous' as const, distance: 1 },
    { pattern: /前([二三四五六七八九十])号/g, type: 'previous' as const, distance: 0 },
    { pattern: /次号/g, type: 'next' as const, distance: 1 },
    { pattern: /各号/g, type: 'same' as const, distance: 0 },
    { pattern: /前各号/g, type: 'previous_all' as const, distance: 0 },
  ];

  // 4. 範囲参照パターン
  private readonly RANGE_PATTERNS = [
    // 「第X条から第Y条まで」
    /第([一二三四五六七八九十百千]+)条から第([一二三四五六七八九十百千]+)条まで/g,
    // 「第X条乃至第Y条」
    /第([一二三四五六七八九十百千]+)条乃至第([一二三四五六七八九十百千]+)条/g,
    // 号の範囲
    /第([一二三四五六七八九十]+)号から第([一二三四五六七八九十]+)号まで/g,
    /第([一二三四五六七八九十]+)号乃至第([一二三四五六七八九十]+)号/g,
  ];

  // 5. 列挙参照パターン
  private readonly MULTIPLE_PATTERNS = [
    // 「第X条、第Y条及び第Z条」
    /(第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?(?:[、,]第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?)*(?:及び|並びに|又は|若しくは)第[一二三四五六七八九十百千]+条(?:の[一二三四五六七八九十]+)?)/g,
    // 号の列挙
    /(第[一二三四五六七八九十]+号(?:[、,]第[一二三四五六七八九十]+号)*(?:及び|並びに|又は|若しくは)第[一二三四五六七八九十]+号)/g,
  ];

  // 6. 外部法令参照パターン
  private readonly EXTERNAL_LAW_PATTERNS = [
    // 「民法第X条」「刑法第Y条」など - 改善版
    /([^（）「」『』\s。、]{2,20}法)第([一二三四五六七八九十百千]+)条/g,
    // 括弧付き法令名
    /([^（）「」『』\s]{2,20})（([^）]+)）第([一二三四五六七八九十百千]+)条/g,
    // 政令・省令・規則
    /([^（）「」『』\s]{2,20}(?:政令|省令|規則|条例))第([一二三四五六七八九十百千]+)条/g,
    // 法律名のみ（「商法」「民法」など）
    /(?:^|\s|、|。)((?:民|刑|商|会社|労働基準|特許|著作権|憲|行政|税|独占禁止|金融商品取引|破産|民事訴訟|刑事訴訟|家事事件手続|人事訴訟)法)/g,
  ];

  // 7. 準用・適用パターン
  private readonly APPLICATION_PATTERNS = [
    // 準用
    /([^。]+)の規定は、([^。]+)に(?:これを)?準用する/g,
    /([^。]+)の規定を([^。]+)に準用する/g,
    /([^。]+)について準用する/g,
    
    // 適用
    /([^。]+)の規定を適用する/g,
    /([^。]+)を適用する/g,
    /([^。]+)の規定の適用/g,
    
    // 読替
    /([^。]+)中「([^」]+)」とあるのは「([^」]+)」と(?:読み替える|する)/g,
  ];

  // 8. 構造参照パターン
  private readonly STRUCTURE_PATTERNS = [
    // 章・節への参照
    /(?:本|この|前|次)([編章節款目])/g,
    /第([一二三四五六七八九十]+)([編章節款目])/g,
    // 「この章の規定」等
    /(?:本|この|前|次)([編章節款目])の(?:規定|定め)/g,
  ];

  // 9. 特殊パターン
  private readonly SPECIAL_PATTERNS = [
    // ただし書
    /ただし、([^。]+)/g,
    // 本文・前段・後段
    /(?:本文|前段|後段)/g,
    // 各号列記
    /次(?:の各号)?に掲げる/g,
    /左記の/g,
    /下記の/g,
  ];

  /**
   * 包括的な参照検出
   */
  public detectAllReferences(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    const sentences = this.splitIntoSentences(text);

    for (const sentence of sentences) {
      // 1. 内部参照（同一法令内）
      references.push(...this.detectInternalReferences(sentence));
      
      // 2. 外部参照（他法令）
      references.push(...this.detectExternalReferences(sentence));
      
      // 3. 相対参照
      references.push(...this.detectRelativeReferences(sentence));
      
      // 4. 範囲参照
      references.push(...this.detectRangeReferences(sentence));
      
      // 5. 列挙参照
      references.push(...this.detectMultipleReferences(sentence));
      
      // 6. 構造参照
      references.push(...this.detectStructureReferences(sentence));
      
      // 7. 準用・適用
      references.push(...this.detectApplicationReferences(sentence));
    }

    // 重複除去と信頼度調整
    return this.deduplicateAndAdjustConfidence(references);
  }

  /**
   * 内部参照の検出
   */
  private detectInternalReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    // 条文参照
    for (const pattern of this.ARTICLE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        // 外部法令参照でないことを確認
        const before = sentence.substring(Math.max(0, match.index - 20), match.index);
        if (this.isExternalLawReference(before)) continue;

        refs.push({
          type: 'internal',
          text: match[0],
          context: sentence,
          confidence: 0.95,
          targetArticle: match[1],
          targetArticle2: match[2] // 条の枝番号
        } as any);
      }
    }

    // 項・号参照
    for (const pattern of this.PARAGRAPH_ITEM_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        const ref: DetectedReference = {
          type: 'internal',
          text: match[0],
          context: sentence,
          confidence: 0.9
        };

        if (match[0].includes('項') && match[0].includes('号')) {
          ref.targetParagraph = this.kanjiToNumber(match[1]);
          ref.targetItem = match[2];
        } else if (match[0].includes('項')) {
          ref.targetParagraph = this.kanjiToNumber(match[1]);
        } else if (match[0].includes('号')) {
          ref.targetItem = match[1];
        }

        refs.push(ref);
      }
    }

    return refs;
  }

  /**
   * 外部参照の検出
   */
  private detectExternalReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const pattern of this.EXTERNAL_LAW_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        refs.push({
          type: 'external',
          text: match[0],
          context: sentence,
          confidence: 0.85,
          targetLaw: match[1],
          targetArticle: match[2] || match[3]
        });
      }
    }

    return refs;
  }

  /**
   * 相対参照の検出
   */
  private detectRelativeReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const relPattern of this.RELATIVE_PATTERNS) {
      let match;
      relPattern.pattern.lastIndex = 0;
      while ((match = relPattern.pattern.exec(sentence)) !== null) {
        let distance = relPattern.distance;
        
        // 動的距離計算（前二条、前三条など）
        if (distance === 0 && match[1]) {
          distance = this.kanjiToNumber(match[1]);
        }

        refs.push({
          type: 'relative',
          text: match[0],
          context: sentence,
          confidence: 0.9,
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
  private detectRangeReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const pattern of this.RANGE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        refs.push({
          type: 'range',
          text: match[0],
          context: sentence,
          confidence: 0.85,
          targetArticle: match[1],
          targetArticleEnd: match[2]
        });
      }
    }

    return refs;
  }

  /**
   * 列挙参照の検出
   */
  private detectMultipleReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const pattern of this.MULTIPLE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        // 個別の条文番号を抽出
        const articles = this.extractArticleNumbers(match[0]);
        
        refs.push({
          type: 'multiple',
          text: match[0],
          context: sentence,
          confidence: 0.8,
          targetArticles: articles as any
        });
      }
    }

    return refs;
  }

  /**
   * 構造参照の検出
   */
  private detectStructureReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const pattern of this.STRUCTURE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        refs.push({
          type: 'structural',
          text: match[0],
          context: sentence,
          confidence: 0.75,
          structureType: match[1] || match[2] as any,
          structureName: match[0]
        });
      }
    }

    return refs;
  }

  /**
   * 準用・適用参照の検出
   */
  private detectApplicationReferences(sentence: string): DetectedReference[] {
    const refs: DetectedReference[] = [];

    for (const pattern of this.APPLICATION_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(sentence)) !== null) {
        const ref: DetectedReference = {
          type: 'application',
          text: match[0],
          context: sentence,
          confidence: 0.8,
          applicationScope: match[1]
        };

        // 読替規定の抽出
        if (match[0].includes('読み替える')) {
          ref.modifications = ref.modifications || [];
          ref.modifications.push(`「${match[2]}」→「${match[3]}」`);
        }

        refs.push(ref);
      }
    }

    return refs;
  }

  /**
   * 文への分割
   */
  private splitIntoSentences(text: string): string[] {
    return text.split(/。/).filter(s => s.trim().length > 0).map(s => s + '。');
  }

  /**
   * 外部法令参照かどうかの判定
   */
  private isExternalLawReference(textBefore: string): boolean {
    return /[法令則例]$/.test(textBefore.trim());
  }

  /**
   * 条文番号の抽出
   */
  private extractArticleNumbers(text: string): string[] {
    const numbers: string[] = [];
    const pattern = /第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]+))?/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      numbers.push(match[1] + (match[2] ? `の${match[2]}` : ''));
    }
    
    return numbers;
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

    if (kanjiMap[kanji]) {
      return kanjiMap[kanji];
    }

    // 複合的な漢数字の処理
    let result = 0;
    let temp = 0;
    let lastMultiplier = 1;

    for (const char of kanji) {
      const value = kanjiMap[char];
      if (!value) continue;

      if (value >= 100) {
        if (temp === 0) temp = 1;
        result += temp * value;
        temp = 0;
        lastMultiplier = value;
      } else if (value === 10) {
        if (temp === 0) temp = 1;
        result += temp * 10;
        temp = 0;
      } else {
        temp = value;
      }
    }

    return result + temp;
  }

  /**
   * 重複除去と信頼度調整
   */
  private deduplicateAndAdjustConfidence(refs: DetectedReference[]): DetectedReference[] {
    const seen = new Set<string>();
    const unique: DetectedReference[] = [];

    for (const ref of refs) {
      const key = `${ref.type}:${ref.text}:${ref.context}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        // コンテキストに基づく信頼度調整
        if (ref.context.includes('ただし')) {
          ref.confidence *= 0.95;
        }
        if (ref.context.includes('準用')) {
          ref.confidence *= 0.9;
        }
        
        unique.push(ref);
      }
    }

    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}