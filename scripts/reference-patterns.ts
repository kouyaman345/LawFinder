/**
 * 参照検出パターン定義
 * すべての正規表現パターンを一元管理
 */

export interface PatternDefinition {
  name: string;
  pattern: RegExp;
  type: string;
  extractor: (match: RegExpExecArray) => any;
}

/**
 * 基本パターン定義
 */
export const BASIC_PATTERNS: PatternDefinition[] = [
  {
    name: '基本的な条文番号',
    pattern: /第(\d+)条(?:の(\d+))?/g,
    type: 'internal',
    extractor: (match) => ({
      article: `第${match[1]}条${match[2] ? `の${match[2]}` : ''}`,
      main: match[1],
      sub: match[2]
    })
  },
  {
    name: '漢数字条文',
    pattern: /第([一二三四五六七八九十百千万]+)条/g,
    type: 'internal',
    extractor: (match) => ({
      article: match[0],
      kanjiNumber: match[1]
    })
  },
  {
    name: '項・号参照',
    pattern: /第(\d+)項(?:第(\d+)号)?/g,
    type: 'internal',
    extractor: (match) => ({
      paragraph: match[1],
      item: match[2]
    })
  }
];

/**
 * 相対参照パターン
 */
export const RELATIVE_PATTERNS: PatternDefinition[] = [
  {
    name: '前条・次条',
    pattern: /(前|次)条/g,
    type: 'relative',
    extractor: (match) => ({
      direction: match[1],
      unit: '条'
    })
  },
  {
    name: '前項・次項',
    pattern: /(前|次)項/g,
    type: 'relative',
    extractor: (match) => ({
      direction: match[1],
      unit: '項'
    })
  },
  {
    name: '前々条・次々条',
    pattern: /(前々|次々)(条|項|号)/g,
    type: 'relative',
    extractor: (match) => ({
      direction: match[1],
      unit: match[2],
      distance: 2
    })
  }
];

/**
 * 構造参照パターン
 */
export const STRUCTURAL_PATTERNS: PatternDefinition[] = [
  {
    name: '章・節参照',
    pattern: /第([一二三四五六七八九十百千]+)(編|章|節|款|目)/g,
    type: 'structural',
    extractor: (match) => ({
      number: match[1],
      unit: match[2]
    })
  },
  {
    name: '別表参照',
    pattern: /別表(?:第([一二三四五六七八九十]+))?(?:（([^）]+)）)?/g,
    type: 'structural',
    extractor: (match) => ({
      tableNumber: match[1],
      relation: match[2]
    })
  }
];

/**
 * 範囲参照パターン
 */
export const RANGE_PATTERNS: PatternDefinition[] = [
  {
    name: '条文範囲',
    pattern: /第(\d+)条から第(\d+)条まで/g,
    type: 'range',
    extractor: (match) => ({
      start: `第${match[1]}条`,
      end: `第${match[2]}条`
    })
  },
  {
    name: '枝番号範囲',
    pattern: /第(\d+)条の(\d+)から第(\d+)条の(\d+)まで/g,
    type: 'range',
    extractor: (match) => ({
      start: `第${match[1]}条の${match[2]}`,
      end: `第${match[3]}条の${match[4]}`
    })
  },
  {
    name: '条項混在範囲',
    pattern: /第(\d+)条第(\d+)項から第(\d+)条第(\d+)項まで/g,
    type: 'range',
    extractor: (match) => ({
      start: `第${match[1]}条第${match[2]}項`,
      end: `第${match[3]}条第${match[4]}項`
    })
  },
  {
    name: 'イロハ範囲',
    pattern: /第(\d+)条(?:第(\d+)項)?第(\d+)号([イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス])から([イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス])まで/g,
    type: 'range',
    extractor: (match) => ({
      article: match[1],
      paragraph: match[2],
      item: match[3],
      startSub: match[4],
      endSub: match[5]
    })
  }
];

/**
 * 文脈依存パターン
 */
export const CONTEXTUAL_PATTERNS: PatternDefinition[] = [
  {
    name: '同条・同項・同号',
    pattern: /同(法|条|項|号)/g,
    type: 'contextual',
    extractor: (match) => ({
      referenceType: match[1]
    })
  },
  {
    name: '当該参照',
    pattern: /当該([^、。]{1,20})/g,
    type: 'contextual',
    extractor: (match) => ({
      target: match[1]
    })
  },
  {
    name: 'この法律',
    pattern: /この(法律|政令|省令|規則|条例)/g,
    type: 'contextual',
    extractor: (match) => ({
      lawType: match[1]
    })
  }
];

/**
 * 外部参照パターン
 */
export const EXTERNAL_PATTERNS: PatternDefinition[] = [
  {
    name: '法令名参照',
    pattern: /([^、。\s（）「」『』]{2,30})(法|令|規則|条例)(?:（([^）]+)）)?/g,
    type: 'external',
    extractor: (match) => ({
      lawName: match[1] + match[2],
      details: match[3]
    })
  },
  {
    name: '政令・省令参照',
    pattern: /(?:(?:平成|令和|昭和)([一二三四五六七八九十]+)年)?([^、。\s（）「」『』]*(?:省|府|庁|委員会))?(?:告示|施行令|施行規則|省令|政令|規則)(?:第([一二三四五六七八九十百千]+)号)?(?:第(\d+)条)?/g,
    type: 'external',
    extractor: (match) => ({
      era: match[1],
      ministry: match[2],
      number: match[3],
      article: match[4]
    })
  }
];

/**
 * 適用パターン（準用・読替え）
 */
export const APPLICATION_PATTERNS: PatternDefinition[] = [
  {
    name: '準用',
    pattern: /第(\d+)条(?:から第(\d+)条まで)?の規定[はを]、?([^。]+について)?準用/g,
    type: 'application',
    extractor: (match) => ({
      startArticle: match[1],
      endArticle: match[2],
      target: match[3],
      method: 'junyo'
    })
  },
  {
    name: '読替え',
    pattern: /第(\d+)条(?:第(\d+)項)?中「([^」]+)」とあるのは「([^」]+)」と読み替え/g,
    type: 'application',
    extractor: (match) => ({
      article: match[1],
      paragraph: match[2],
      original: match[3],
      replacement: match[4],
      method: 'yomikae'
    })
  }
];

/**
 * 複合パターン
 */
export const COMPLEX_PATTERNS: PatternDefinition[] = [
  {
    name: '括弧内参照',
    pattern: /第(\d+)条（([^）]+)）/g,
    type: 'complex',
    extractor: (match) => ({
      mainArticle: `第${match[1]}条`,
      bracketContent: match[2]
    })
  },
  {
    name: '複数法令並列',
    pattern: /([^、。\s（）「」『』]+法)第(\d+)条(?:(?:及び|並びに|又は|若しくは)([^、。\s（）「」『』]+法)第(\d+)条)+/g,
    type: 'complex',
    extractor: (match) => ({
      firstLaw: match[1],
      firstArticle: match[2],
      secondLaw: match[3],
      secondArticle: match[4]
    })
  },
  {
    name: '選択的参照',
    pattern: /第(\d+)条(?:若しくは|又は|並びに)第(\d+)条/g,
    type: 'complex',
    extractor: (match) => ({
      firstArticle: match[1],
      secondArticle: match[2]
    })
  }
];

/**
 * すべてのパターンを統合
 */
export const ALL_PATTERNS = [
  ...BASIC_PATTERNS,
  ...RELATIVE_PATTERNS,
  ...STRUCTURAL_PATTERNS,
  ...RANGE_PATTERNS,
  ...CONTEXTUAL_PATTERNS,
  ...EXTERNAL_PATTERNS,
  ...APPLICATION_PATTERNS,
  ...COMPLEX_PATTERNS
];

/**
 * パターンカテゴリ
 */
export const PATTERN_CATEGORIES = {
  basic: BASIC_PATTERNS,
  relative: RELATIVE_PATTERNS,
  structural: STRUCTURAL_PATTERNS,
  range: RANGE_PATTERNS,
  contextual: CONTEXTUAL_PATTERNS,
  external: EXTERNAL_PATTERNS,
  application: APPLICATION_PATTERNS,
  complex: COMPLEX_PATTERNS
};

/**
 * 漢数字から数値への変換マップ
 */
export const KANJI_NUMBER_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
  '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
  '三十': 30, '四十': 40, '五十': 50, '六十': 60, '七十': 70,
  '八十': 80, '九十': 90, '百': 100, '千': 1000, '万': 10000
};

/**
 * 漢数字を数値に変換
 */
export function kanjiToNumber(kanji: string): number {
  if (KANJI_NUMBER_MAP[kanji]) {
    return KANJI_NUMBER_MAP[kanji];
  }
  
  // 複雑な漢数字の解析
  let result = 0;
  let temp = 0;
  let currentDigit = 0;
  
  for (const char of kanji) {
    const value = KANJI_NUMBER_MAP[char];
    if (!value) continue;
    
    if (value >= 10000) {
      result += (temp + currentDigit) * value;
      temp = 0;
      currentDigit = 0;
    } else if (value >= 10) {
      if (currentDigit === 0) currentDigit = 1;
      temp += currentDigit * value;
      currentDigit = 0;
    } else {
      currentDigit = value;
    }
  }
  
  return result + temp + currentDigit;
}