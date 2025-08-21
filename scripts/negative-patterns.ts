/**
 * ネガティブパターン定義
 * 参照ではないものを識別して除外するためのパターン
 */

export interface NegativePattern {
  name: string;
  pattern: RegExp;
  description: string;
  example?: string;
}

/**
 * 削除・廃止に関するパターン
 */
export const DELETION_PATTERNS: NegativePattern[] = [
  {
    name: '条文削除',
    pattern: /第\d+条を削除/g,
    description: '条文を削除する規定',
    example: '第10条を削除する'
  },
  {
    name: '廃止規定',
    pattern: /第\d+条(?:から第\d+条まで)?を廃止/g,
    description: '条文を廃止する規定',
    example: '第5条から第8条までを廃止する'
  },
  {
    name: '削除済み条文',
    pattern: /第\d+条[\s　]*削除/g,
    description: '既に削除された条文の表記',
    example: '第15条　削除'
  },
  {
    name: '欠番',
    pattern: /第\d+条[\s　]*欠/g,
    description: '欠番となった条文',
    example: '第20条　欠'
  }
];

/**
 * 旧法・改正前に関するパターン
 */
export const OLD_LAW_PATTERNS: NegativePattern[] = [
  {
    name: '旧法参照',
    pattern: /旧.*第\d+条/g,
    description: '旧法の条文への参照',
    example: '旧民法第90条'
  },
  {
    name: '改正前条文',
    pattern: /改正前の.*第\d+条/g,
    description: '改正前の条文への参照',
    example: '改正前の第5条'
  },
  {
    name: '廃止法令',
    pattern: /廃止された.*第\d+条/g,
    description: '廃止された法令の条文',
    example: '廃止された商法第100条'
  },
  {
    name: '失効条文',
    pattern: /失効した.*第\d+条/g,
    description: '失効した条文への参照',
    example: '失効した第3条'
  }
];

/**
 * 仮称・草案に関するパターン
 */
export const DRAFT_PATTERNS: NegativePattern[] = [
  {
    name: '仮称条文',
    pattern: /(?:仮称|仮).*第\d+条/g,
    description: '仮称の条文',
    example: '（仮称）第5条'
  },
  {
    name: '草案条文',
    pattern: /草案.*第\d+条/g,
    description: '草案段階の条文',
    example: '草案第10条'
  },
  {
    name: '検討中条文',
    pattern: /検討中の.*第\d+条/g,
    description: '検討中の条文',
    example: '検討中の第8条'
  },
  {
    name: '予定条文',
    pattern: /予定の.*第\d+条/g,
    description: '予定されている条文',
    example: '予定の第15条'
  }
];

/**
 * 改正指示に関するパターン
 */
export const AMENDMENT_INSTRUCTION_PATTERNS: NegativePattern[] = [
  {
    name: '条文改正指示',
    pattern: /第\d+条中「[^」]+」を「[^」]+」に改める/g,
    description: '条文の文言を改正する指示',
    example: '第10条中「許可」を「届出」に改める'
  },
  {
    name: '条文追加指示',
    pattern: /第\d+条の次に次の\d+条を加える/g,
    description: '条文を追加する指示',
    example: '第5条の次に次の2条を加える'
  },
  {
    name: '条文移動指示',
    pattern: /第\d+条を第\d+条とする/g,
    description: '条文番号を変更する指示',
    example: '第10条を第15条とする'
  },
  {
    name: '項追加指示',
    pattern: /第\d+条に次の\d+項を加える/g,
    description: '項を追加する指示',
    example: '第5条に次の1項を加える'
  }
];

/**
 * 説明・解説に関するパターン
 */
export const EXPLANATION_PATTERNS: NegativePattern[] = [
  {
    name: '条文説明',
    pattern: /第\d+条(?:は|とは|について|に関して)/g,
    description: '条文についての説明',
    example: '第10条については'
  },
  {
    name: '条文解説',
    pattern: /第\d+条の(?:趣旨|目的|意義|解釈)/g,
    description: '条文の解説',
    example: '第5条の趣旨'
  },
  {
    name: '条文例示',
    pattern: /例えば第\d+条/g,
    description: '例示としての条文参照',
    example: '例えば第3条'
  },
  {
    name: '条文比較',
    pattern: /第\d+条と比較して/g,
    description: '比較のための条文参照',
    example: '第10条と比較して'
  }
];

/**
 * すべてのネガティブパターン
 */
export const ALL_NEGATIVE_PATTERNS: NegativePattern[] = [
  ...DELETION_PATTERNS,
  ...OLD_LAW_PATTERNS,
  ...DRAFT_PATTERNS,
  ...AMENDMENT_INSTRUCTION_PATTERNS,
  ...EXPLANATION_PATTERNS
];

/**
 * ネガティブパターンフィルター
 */
export class NegativePatternFilter {
  private patterns: NegativePattern[];
  private enabledCategories: Set<string>;

  constructor(patterns: NegativePattern[] = ALL_NEGATIVE_PATTERNS) {
    this.patterns = patterns;
    this.enabledCategories = new Set([
      'deletion',
      'old_law',
      'draft',
      'amendment',
      'explanation'
    ]);
  }

  /**
   * カテゴリを有効/無効にする
   */
  setCategory(category: string, enabled: boolean): void {
    if (enabled) {
      this.enabledCategories.add(category);
    } else {
      this.enabledCategories.delete(category);
    }
  }

  /**
   * テキストがネガティブパターンに一致するかチェック
   */
  isNegative(text: string): boolean {
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 参照リストからネガティブなものを除外
   */
  filter(references: any[]): any[] {
    return references.filter(ref => {
      // 参照の前後のコンテキストを含めてチェック
      const context = this.getContext(ref);
      return !this.isNegative(context);
    });
  }

  /**
   * 参照のコンテキストを取得
   */
  private getContext(reference: any): string {
    // 参照テキストの前後50文字を含める
    if (reference.context) {
      return reference.context;
    }
    if (reference.text) {
      return reference.text;
    }
    return '';
  }

  /**
   * フィルタリング結果の統計を取得
   */
  getStatistics(references: any[]): {
    total: number;
    filtered: number;
    passed: number;
    filterRate: number;
  } {
    const filtered = references.filter(ref => {
      const context = this.getContext(ref);
      return this.isNegative(context);
    });

    const total = references.length;
    const filteredCount = filtered.length;
    const passed = total - filteredCount;
    const filterRate = total > 0 ? (filteredCount / total) * 100 : 0;

    return {
      total,
      filtered: filteredCount,
      passed,
      filterRate
    };
  }

  /**
   * パターンマッチの詳細を取得
   */
  getMatchDetails(text: string): Array<{
    pattern: NegativePattern;
    matches: RegExpMatchArray[];
  }> {
    const details: Array<{
      pattern: NegativePattern;
      matches: RegExpMatchArray[];
    }> = [];

    for (const pattern of this.patterns) {
      const matches = [...text.matchAll(pattern.pattern)];
      if (matches.length > 0) {
        details.push({ pattern, matches });
      }
    }

    return details;
  }
}

/**
 * ネガティブパターンのテスト
 */
export function testNegativePatterns(testCases?: string[]): void {
  const filter = new NegativePatternFilter();
  
  const defaultTestCases = [
    '第10条を削除する',
    '旧民法第90条',
    '改正前の第5条',
    '（仮称）第8条',
    '第10条中「許可」を「届出」に改める',
    '第5条については',
    '第10条の規定により', // これは正常な参照
    '民法第90条', // これは正常な参照
  ];

  const cases = testCases || defaultTestCases;
  
  console.log('=== ネガティブパターンテスト ===\n');
  
  for (const testCase of cases) {
    const isNegative = filter.isNegative(testCase);
    const symbol = isNegative ? '❌' : '✅';
    console.log(`${symbol} "${testCase}" -> ${isNegative ? 'ネガティブ' : '正常'}`);
    
    if (isNegative) {
      const details = filter.getMatchDetails(testCase);
      for (const detail of details) {
        console.log(`   マッチパターン: ${detail.pattern.name}`);
      }
    }
  }
}