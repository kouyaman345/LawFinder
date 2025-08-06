/**
 * 法令参照関係検出エンジン
 * build-static-egov-mainprovision-fixed.js から移植・改良
 */

export interface DetectedReference {
  sourceArticleId?: string;
  sourceArticleNumber: string;
  sourceText: string;
  type: ReferenceType;
  subType?: ReferenceSubType;
  
  // 参照先情報
  targetArticleNumber?: string;
  targetArticleNumberEnd?: string; // 範囲参照用
  targetParagraphNumber?: number;
  targetItemNumber?: string;
  targetLawName?: string;
  targetLawId?: string;
  
  // 相対参照情報
  relativeDirection?: 'previous' | 'next' | 'same';
  relativeCount?: number;
  structureType?: '章' | '編' | '節' | '款' | '目';
  
  // メタ情報
  confidence: number;
  context?: {
    paragraphNumber?: number;
    itemNumber?: string;
  };
}

export enum ReferenceType {
  INTERNAL = 'internal',           // 同一法令内参照
  EXTERNAL = 'external',           // 他法令参照
  RELATIVE = 'relative',           // 相対参照（前条、次条など）
  COMPLEX = 'complex',             // 複合参照（同項第二号など）
  STRUCTURAL = 'structural',       // 構造参照（この章、第二編など）
  APPLICATION = 'application'      // 準用規定
}

export enum ReferenceSubType {
  RANGE = 'range',                 // 範囲参照（第1条から第3条まで）
  MULTIPLE = 'multiple',           // 複数参照（前二条）
  ITEM_LIST = 'item_list',         // 号列記（次の各号）
  WITH_PARAGRAPH = 'with_paragraph', // 項付き（第2条第3項）
  WITH_ITEM = 'with_item',         // 号付き（第2条第1項第3号）
  CHAPTER = 'chapter',             // 章参照
  PART = 'part',                   // 編参照
  SECTION = 'section',             // 節参照
  SUBSECTION = 'subsection',       // 款参照
  DIVISION = 'division'            // 目参照
}

export class ReferenceDetector {
  private lawIdMap: Map<string, string> = new Map([
    ['民法', '129AC0000000089'],
    ['商法', '132AC0000000048'],
    ['刑法', '140AC0000000045'],
    ['民事訴訟法', '404AC0000000109'],
    ['会社法', '417AC0000000086'],
    ['独占禁止法', '322AC0000000054'],
    ['労働基準法', '322AC0000000049'],
    ['消費税法', '363AC0000000108']
  ]);

  private patterns = [
    // 条文範囲参照（例：第七十七条から第七十九条まで）
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条から第([０-９0-9一二三四五六七八九十百千万]+)条まで/g, 
      type: ReferenceType.INTERNAL,
      subType: ReferenceSubType.RANGE
    },
    // 条文範囲参照（枝番号付き）（例：第三十二条の二から第三十二条の五まで）
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条の([０-９0-9一二三四五六七八九十]+)から第([０-９0-9一二三四五六七八九十百千万]+)条の([０-９0-9一二三四五六七八九十]+)まで/g, 
      type: ReferenceType.INTERNAL,
      subType: ReferenceSubType.RANGE
    },
    // 複数条文参照（例：前二条、前三条）
    { 
      regex: /前([二三四五六七八九十])条/g, 
      type: ReferenceType.RELATIVE,
      subType: ReferenceSubType.MULTIPLE
    },
    // 「この章」「この編」「この節」参照
    { 
      regex: /この(章|編|節|款|目)/g, 
      type: ReferenceType.STRUCTURAL,
      subType: null
    },
    // 次の各号・次に掲げる
    { 
      regex: /次の各号|次に掲げる/g, 
      type: ReferenceType.COMPLEX,
      subType: ReferenceSubType.ITEM_LIST
    },
    // 各号の一に該当
    { 
      regex: /各号の一/g, 
      type: ReferenceType.COMPLEX,
      subType: ReferenceSubType.ITEM_LIST
    },
    // 準用規定
    { 
      regex: /(準用する|準用される)/g, 
      type: ReferenceType.APPLICATION,
      subType: null
    },
    // 附則の参照
    { 
      regex: /附則第([０-９0-9一二三四五六七八九十百千万]+)条/g, 
      type: ReferenceType.INTERNAL,
      subType: null
    },
    // 別表の参照
    { 
      regex: /別表第([０-９0-9一二三四五六七八九十百千万]+)/g, 
      type: ReferenceType.INTERNAL,
      subType: null
    },
    // 号のみの参照（第一号、第二号など）
    { 
      regex: /第([０-９0-9一二三四五六七八九十]+)号/g, 
      type: ReferenceType.INTERNAL,
      subType: ReferenceSubType.WITH_ITEM
    },
    // ただし書・本文への参照
    { 
      regex: /ただし書|本文/g, 
      type: ReferenceType.COMPLEX,
      subType: null
    },
    // 「の」付き条文参照（例：第二十七条の七）
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条の([０-９0-9一二三四五六七八九十]+)(?!項)/g, 
      type: ReferenceType.INTERNAL,
      subType: null
    },
    // 条文＋項の参照
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条第([０-９0-9一二三四五六七八九十]+)項/g, 
      type: ReferenceType.INTERNAL,
      subType: ReferenceSubType.WITH_PARAGRAPH
    },
    // 条文＋項＋号の参照
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条第([０-９0-9一二三四五六七八九十]+)項第([０-９0-9一二三四五六七八九十]+)号/g, 
      type: ReferenceType.INTERNAL,
      subType: ReferenceSubType.WITH_ITEM
    },
    // 条文のみ（前のパターンに一致しないもの）
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)条(?!第|の|から)/g, 
      type: ReferenceType.INTERNAL,
      subType: null
    },
    // 章の参照
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)章/g, 
      type: ReferenceType.STRUCTURAL,
      subType: ReferenceSubType.CHAPTER
    },
    // 編の参照
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)編/g, 
      type: ReferenceType.STRUCTURAL,
      subType: ReferenceSubType.PART
    },
    // 節の参照
    { 
      regex: /第([０-９0-9一二三四五六七八九十百千万]+)節/g, 
      type: ReferenceType.STRUCTURAL,
      subType: ReferenceSubType.SECTION
    },
    // 相対参照（条）
    { 
      regex: /前条|次条/g, 
      type: ReferenceType.RELATIVE,
      subType: null
    },
    // 相対参照（項・条）
    { 
      regex: /前項|次項|同項|同条/g, 
      type: ReferenceType.RELATIVE,
      subType: null
    },
    // 相対参照（章）
    { 
      regex: /前章|次章/g, 
      type: ReferenceType.RELATIVE,
      subType: ReferenceSubType.CHAPTER
    },
    // 複合参照
    { 
      regex: /同項第([０-９0-9一二三四五六七八九十]+)号/g, 
      type: ReferenceType.COMPLEX,
      subType: ReferenceSubType.WITH_ITEM
    },
    { 
      regex: /前項第([０-９0-9一二三四五六七八九十]+)号/g, 
      type: ReferenceType.COMPLEX,
      subType: ReferenceSubType.WITH_ITEM
    },
    { 
      regex: /同条第([０-９0-9一二三四五六七八九十]+)項/g, 
      type: ReferenceType.COMPLEX,
      subType: ReferenceSubType.WITH_PARAGRAPH
    },
    // 外部法令参照
    { 
      regex: /(民法|商法|刑法|民事訴訟法|独占禁止法|労働基準法|消費税法|会社法)(?:（[^）]+）)?第([０-９0-9一二三四五六七八九十百千万]+)条/g, 
      type: ReferenceType.EXTERNAL,
      subType: null
    }
  ];

  /**
   * 条文から参照を検出
   */
  detectReferences(
    text: string, 
    sourceArticleNumber: string,
    context?: { paragraphNumber?: number; itemNumber?: string }
  ): DetectedReference[] {
    const references: DetectedReference[] = [];

    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.regex);
      
      for (const match of matches) {
        const reference = this.createReference(
          match, 
          pattern, 
          sourceArticleNumber,
          context
        );
        
        if (reference) {
          references.push(reference);
        }
      }
    }

    return references;
  }

  /**
   * マッチから参照オブジェクトを作成
   */
  private createReference(
    match: RegExpMatchArray,
    pattern: any,
    sourceArticleNumber: string,
    context?: { paragraphNumber?: number; itemNumber?: string }
  ): DetectedReference | null {
    const baseReference: DetectedReference = {
      sourceArticleNumber,
      sourceText: match[0],
      type: pattern.type,
      subType: pattern.subType,
      confidence: 0.9,
      context
    };

    // パターンごとの処理
    switch (pattern.subType) {
      case ReferenceSubType.RANGE:
        // 枝番号付き範囲の場合
        if (match.length > 4) {
          return {
            ...baseReference,
            targetArticleNumber: `${this.convertToKanji(match[1])}の${this.convertToKanji(match[2])}`,
            targetArticleNumberEnd: `${this.convertToKanji(match[3])}の${this.convertToKanji(match[4])}`
          };
        }
        // 通常の範囲
        return {
          ...baseReference,
          targetArticleNumber: this.convertToKanji(match[1]),
          targetArticleNumberEnd: this.convertToKanji(match[2])
        };

      case ReferenceSubType.MULTIPLE:
        return {
          ...baseReference,
          relativeDirection: 'previous',
          relativeCount: this.kanjiToNumber(match[1])
        };

      case ReferenceSubType.WITH_PARAGRAPH:
        return {
          ...baseReference,
          targetArticleNumber: this.convertToKanji(match[1]),
          targetParagraphNumber: parseInt(this.convertToArabic(match[2]))
        };

      case ReferenceSubType.WITH_ITEM:
        if (pattern.type === ReferenceType.COMPLEX) {
          // 同項第X号、前項第X号
          const direction = match[0].startsWith('同') ? 'same' : 'previous';
          return {
            ...baseReference,
            relativeDirection: direction as 'same' | 'previous',
            targetItemNumber: this.convertToKanji(match[1])
          };
        } else {
          // 第X条第Y項第Z号
          return {
            ...baseReference,
            targetArticleNumber: this.convertToKanji(match[1]),
            targetParagraphNumber: parseInt(this.convertToArabic(match[2])),
            targetItemNumber: this.convertToKanji(match[3])
          };
        }

      case ReferenceSubType.CHAPTER:
      case ReferenceSubType.PART:
      case ReferenceSubType.SECTION:
        if (match[0].startsWith('この')) {
          return {
            ...baseReference,
            structureType: match[1] as any,
            relativeDirection: 'same'
          };
        } else {
          return {
            ...baseReference,
            targetArticleNumber: this.convertToKanji(match[1])
          };
        }

      default:
        // 外部法令参照
        if (pattern.type === ReferenceType.EXTERNAL) {
          const lawName = match[1];
          return {
            ...baseReference,
            targetLawName: lawName,
            targetLawId: this.lawIdMap.get(lawName),
            targetArticleNumber: this.convertToKanji(match[2])
          };
        }

        // 相対参照
        if (pattern.type === ReferenceType.RELATIVE) {
          let direction: 'previous' | 'next' | 'same' = 'same';
          if (match[0].includes('前')) direction = 'previous';
          else if (match[0].includes('次')) direction = 'next';
          
          return {
            ...baseReference,
            relativeDirection: direction
          };
        }

        // 内部参照（条文のみ、「の」付き、附則、別表、号のみ）
        if (pattern.type === ReferenceType.INTERNAL) {
          // 附則の参照
          if (match[0].startsWith('附則')) {
            return {
              ...baseReference,
              targetArticleNumber: `附則第${this.convertToKanji(match[1])}条`
            };
          }
          // 別表の参照
          if (match[0].startsWith('別表')) {
            return {
              ...baseReference,
              targetArticleNumber: `別表第${this.convertToKanji(match[1])}`
            };
          }
          // 号のみの参照（第X号）
          if (match[0].includes('号') && !match[0].includes('条')) {
            return {
              ...baseReference,
              targetItemNumber: this.convertToKanji(match[1])
            };
          }
          // 「の」付き条文
          if (match[0].includes('の')) {
            const mainArticle = match[1];
            const subArticle = match[2];
            return {
              ...baseReference,
              targetArticleNumber: `${this.convertToKanji(mainArticle)}の${this.convertToKanji(subArticle)}`
            };
          } else {
            return {
              ...baseReference,
              targetArticleNumber: this.convertToKanji(match[1])
            };
          }
        }

        // ただし書・本文への参照
        if (pattern.type === ReferenceType.COMPLEX && (match[0] === 'ただし書' || match[0] === '本文')) {
          return {
            ...baseReference,
            relativeDirection: 'same'
          };
        }

        return baseReference;
    }
  }

  /**
   * 漢数字をアラビア数字に変換
   */
  private convertToArabic(kanjiNum: string): string {
    if (!kanjiNum) return '';
    
    const kanjiToArabicMap: { [key: string]: string } = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
      '十一': '11', '十二': '12', '十三': '13', '十四': '14', '十五': '15',
      '十六': '16', '十七': '17', '十八': '18', '十九': '19', '二十': '20',
      '二十一': '21', '二十二': '22', '二十三': '23', '二十四': '24', '二十五': '25',
      '二十六': '26', '二十七': '27', '二十八': '28', '二十九': '29', '三十': '30',
      '三十一': '31', '三十二': '32', '三十三': '33', '三十四': '34', '三十五': '35',
      '三十六': '36', '三十七': '37', '三十八': '38', '三十九': '39', '四十': '40',
      '四十一': '41', '四十二': '42', '四十三': '43', '四十四': '44', '四十五': '45',
      '四十六': '46', '四十七': '47', '四十八': '48', '四十九': '49', '五十': '50'
    };

    // より大きな数の処理
    let num = kanjiNum;
    
    // 百の処理
    if (num.includes('百')) {
      const parts = num.split('百');
      const hundreds = parts[0] === '' ? 1 : this.kanjiToNumber(parts[0]);
      const remainder = parts[1] ? this.kanjiToNumber(parts[1]) : 0;
      return String(hundreds * 100 + remainder);
    }

    // 十の処理（複雑なケース）
    if (num.includes('十') && !kanjiToArabicMap[num]) {
      const parts = num.split('十');
      const tens = parts[0] === '' ? 1 : this.kanjiToNumber(parts[0]);
      const ones = parts[1] ? this.kanjiToNumber(parts[1]) : 0;
      return String(tens * 10 + ones);
    }

    return kanjiToArabicMap[num] || num;
  }

  /**
   * アラビア数字を漢数字に変換
   */
  private convertToKanji(arabicNum: string): string {
    const arabicToKanjiMap: { [key: string]: string } = {
      '1': '一', '2': '二', '3': '三', '4': '四', '5': '五',
      '6': '六', '7': '七', '8': '八', '9': '九', '10': '十',
      '11': '十一', '12': '十二', '13': '十三', '14': '十四', '15': '十五',
      '16': '十六', '17': '十七', '18': '十八', '19': '十九', '20': '二十',
      '21': '二十一', '22': '二十二', '23': '二十三', '24': '二十四', '25': '二十五',
      '26': '二十六', '27': '二十七', '28': '二十八', '29': '二十九', '30': '三十',
      '31': '三十一', '32': '三十二', '33': '三十三', '34': '三十四', '35': '三十五',
      '36': '三十六', '37': '三十七', '38': '三十八', '39': '三十九', '40': '四十',
      '41': '四十一', '42': '四十二', '43': '四十三', '44': '四十四', '45': '四十五',
      '46': '四十六', '47': '四十七', '48': '四十八', '49': '四十九', '50': '五十'
    };

    // 既に漢数字の場合はそのまま返す
    if (!/^\d+$/.test(arabicNum)) {
      return arabicNum;
    }

    const num = parseInt(arabicNum);
    
    // 1-50の範囲
    if (arabicToKanjiMap[arabicNum]) {
      return arabicToKanjiMap[arabicNum];
    }

    // 51-99の範囲
    if (num > 50 && num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      const tensKanji = arabicToKanjiMap[String(tens)];
      const onesKanji = ones > 0 ? arabicToKanjiMap[String(ones)] : '';
      return `${tensKanji}十${onesKanji}`;
    }

    // 100以上
    if (num >= 100) {
      const hundreds = Math.floor(num / 100);
      const remainder = num % 100;
      const hundredsKanji = hundreds === 1 ? '' : arabicToKanjiMap[String(hundreds)];
      const remainderKanji = remainder > 0 ? this.convertToKanji(String(remainder)) : '';
      return `${hundredsKanji}百${remainderKanji}`;
    }

    return arabicNum;
  }

  /**
   * 漢数字を数値に変換（内部使用）
   */
  private kanjiToNumber(kanji: string): number {
    const num = parseInt(this.convertToArabic(kanji));
    return isNaN(num) ? 1 : num;
  }
}