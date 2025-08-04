export interface Pattern {
  name: string;
  regex: RegExp;
  type: string;
}

export interface PatternCategory {
  structural: Pattern[];
  basic: Pattern[];
  implicit: Pattern[];
  compound: Pattern[];
}

export const REFERENCE_PATTERNS: PatternCategory = {
  // 基本構造パターン
  structural: [
    { 
      name: 'article',
      regex: /第([一二三四五六七八九十百千]+|[0-9]+)条/g,
      type: 'ARTICLE'
    },
    {
      name: 'paragraph',
      regex: /([一二三四五六七八九十]+|[0-9]+)項/g,
      type: 'PARAGRAPH'
    },
    {
      name: 'item',
      regex: /第([一二三四五六七八九十]+|[0-9]+)号/g,
      type: 'ITEM'
    },
    {
      name: 'range',
      regex: /第([一二三四五六七八九十百千]+|[0-9]+)条から第([一二三四五六七八九十百千]+|[0-9]+)条まで/g,
      type: 'RANGE'
    }
  ],
  
  // 基本参照タイプパターン
  basic: [
    {
      name: 'apply',
      regex: /(?:について|を)?準用(?:する|し)/g,
      type: 'APPLY'
    },
    {
      name: 'deem',
      regex: /(?:と)?みなす|看做す/g,
      type: 'DEEM'
    },
    {
      name: 'replace',
      regex: /読み替え(?:る|て|るものとする)/g,
      type: 'REPLACE'
    },
    {
      name: 'except',
      regex: /(?:を|場合を)?除(?:く|き|いて)/g,
      type: 'EXCEPT'
    },
    {
      name: 'follow',
      regex: /(?:に)?従(?:い|って)|基づ(?:き|いて)|による/g,
      type: 'FOLLOW'
    },
    {
      name: 'limit',
      regex: /(?:この)?限り(?:で)?(?:ない)?/g,
      type: 'LIMIT'
    },
    {
      name: 'regardless',
      regex: /(?:に)?かかわらず|を問わず/g,
      type: 'REGARDLESS'
    },
    {
      name: 'stipulate',
      regex: /規定(?:する|し|される)/g,
      type: 'STIPULATE'
    },
    {
      name: 'relate',
      regex: /に関(?:し|して|する)/g,
      type: 'RELATE'
    }
  ],
  
  // 暗黙的参照パターン
  implicit: [
    {
      name: 'previous',
      regex: /前条|前項|前号/g,
      type: 'PREVIOUS'
    },
    {
      name: 'next',
      regex: /次条|次項|次号/g,
      type: 'NEXT'
    },
    {
      name: 'same',
      regex: /同条|同項|同号/g,
      type: 'SAME'
    },
    {
      name: 'thisLaw',
      regex: /この法律|本法/g,
      type: 'THIS_LAW'
    },
    {
      name: 'otherLaw',
      regex: /他の法令|別に法律で定める/g,
      type: 'OTHER_LAW'
    }
  ],
  
  // 複合パターン（組み合わせ検出用）
  compound: [
    {
      name: 'conditionalApply',
      regex: /(.{1,50})の場合に(?:限り)?(.{1,50})準用/g,
      type: 'CONDITIONAL_APPLY'
    },
    {
      name: 'exceptedApply',
      regex: /(.{1,50})を除き(.{1,50})準用/g,
      type: 'EXCEPTED_APPLY'
    },
    {
      name: 'replacedApply',
      regex: /(.{1,50})と読み替えて(.{1,50})準用/g,
      type: 'REPLACED_APPLY'
    }
  ]
};

// 漢数字変換ユーティリティ
export function kanjiToNumber(kanjiStr: string): number {
  const kanjiMap: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000, '万': 10000
  };
  
  if (!kanjiStr) return 0;
  
  // アラビア数字の場合はそのまま返す
  const arabicNum = parseInt(kanjiStr);
  if (!isNaN(arabicNum)) return arabicNum;
  
  let result = 0;
  let temp = 0;
  let prevValue = 0;
  
  for (const char of kanjiStr) {
    const value = kanjiMap[char];
    if (!value) continue;
    
    if (value === 10 || value === 100 || value === 1000 || value === 10000) {
      if (temp === 0) temp = 1;
      temp *= value;
      result += temp;
      temp = 0;
    } else {
      if (prevValue === 10 || prevValue === 100 || prevValue === 1000) {
        result += value;
      } else {
        temp = value;
      }
    }
    prevValue = value;
  }
  
  return result + temp;
}