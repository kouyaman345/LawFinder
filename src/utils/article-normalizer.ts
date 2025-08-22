/**
 * 条文番号正規化ユーティリティ
 * 
 * 条文番号の形式を統一的に処理するための共通ユーティリティ
 * データベース保存時は数値形式、表示時は完全形式を使用
 */

export interface NormalizedArticle {
  /** 数値形式（DB保存用）: "90" */
  numeric: string;
  /** 完全形式（表示用）: "第90条" */
  display: string;
  /** 元のテキスト */
  original: string;
  /** 数値のみ: 90 */
  value: number;
}

/**
 * 条文番号を正規化
 * @param articleText 条文番号のテキスト（例：「第90条」「90」「第九十条」）
 * @returns 正規化された条文情報
 */
export function normalizeArticleNumber(articleText: string): NormalizedArticle {
  const original = articleText;
  
  // 空文字列やnullの処理
  if (!articleText) {
    return {
      numeric: '',
      display: '',
      original: '',
      value: 0
    };
  }
  
  // 漢数字を算用数字に変換（改善版）
  let normalized = articleText;
  
  // 漢数字変換関数
  const convertKanjiToNumber = (kanjiStr: string): string => {
    const kanjiDigits: { [key: string]: number } = {
      '〇': 0, '零': 0,
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9
    };
    
    const kanjiUnits: { [key: string]: number } = {
      '十': 10, '百': 100, '千': 1000, '万': 10000
    };
    
    // 完全な漢数字パターンをマッチ
    const kanjiPattern = /[〇零一二三四五六七八九十百千万]+/g;
    
    return kanjiStr.replace(kanjiPattern, (match) => {
      let result = 0;
      let current = 0;
      let lastUnit = 1;
      
      for (let i = 0; i < match.length; i++) {
        const char = match[i];
        
        if (kanjiDigits.hasOwnProperty(char)) {
          current = kanjiDigits[char];
        } else if (kanjiUnits.hasOwnProperty(char)) {
          const unit = kanjiUnits[char];
          if (current === 0) current = 1; // 「十」を「10」として扱う
          result += current * unit;
          current = 0;
          lastUnit = unit;
        }
      }
      
      result += current;
      return result.toString();
    });
  };
  
  normalized = convertKanjiToNumber(normalized);
  
  // 条文番号パターンのマッチング
  const patterns = [
    /第([0-9]+)条/,         // 第90条
    /^([0-9]+)条$/,         // 90条
    /^([0-9]+)$/,           // 90
    /article\s*([0-9]+)/i,  // Article 90
  ];
  
  let numericValue = 0;
  let numericStr = '';
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      numericStr = match[1];
      numericValue = parseInt(match[1], 10);
      break;
    }
  }
  
  // パターンにマッチしない場合、数字を抽出
  if (!numericStr) {
    const numberMatch = normalized.match(/([0-9]+)/);
    if (numberMatch) {
      numericStr = numberMatch[1];
      numericValue = parseInt(numberMatch[1], 10);
    }
  }
  
  // 結果を返す
  return {
    numeric: numericStr || '',
    display: numericStr ? `第${numericStr}条` : original,
    original: original,
    value: numericValue
  };
}

/**
 * 条文番号リストを正規化
 * @param articles 条文番号のリスト
 * @returns 正規化された条文情報のリスト
 */
export function normalizeArticleNumbers(articles: string[]): NormalizedArticle[] {
  return articles.map(normalizeArticleNumber);
}

/**
 * 条文番号を表示形式に変換
 * @param articleNum 条文番号（任意の形式）
 * @returns 表示形式（「第○条」）
 */
export function toDisplayFormat(articleNum: string): string {
  if (!articleNum) return '';
  const normalized = normalizeArticleNumber(articleNum);
  return normalized.display;
}

/**
 * 条文番号を数値形式に変換
 * @param articleNum 条文番号（任意の形式）
 * @returns 数値形式（「90」）
 */
export function toNumericFormat(articleNum: string): string {
  if (!articleNum) return '';
  const normalized = normalizeArticleNumber(articleNum);
  return normalized.numeric;
}

/**
 * 条文番号の比較（ソート用）
 * @param a 条文番号A
 * @param b 条文番号B
 * @returns ソート順（-1, 0, 1）
 */
export function compareArticleNumbers(a: string, b: string): number {
  const normA = normalizeArticleNumber(a);
  const normB = normalizeArticleNumber(b);
  return normA.value - normB.value;
}

/**
 * 条文番号が有効かチェック
 * @param articleNum 条文番号
 * @returns 有効な条文番号かどうか
 */
export function isValidArticleNumber(articleNum: string): boolean {
  const normalized = normalizeArticleNumber(articleNum);
  return normalized.value > 0;
}

/**
 * 条文番号の範囲を生成
 * @param start 開始条文番号
 * @param end 終了条文番号
 * @returns 条文番号の配列
 */
export function generateArticleRange(start: string, end: string): string[] {
  const startNorm = normalizeArticleNumber(start);
  const endNorm = normalizeArticleNumber(end);
  
  if (startNorm.value <= 0 || endNorm.value <= 0) {
    return [];
  }
  
  const range: string[] = [];
  for (let i = startNorm.value; i <= endNorm.value; i++) {
    range.push(`第${i}条`);
  }
  
  return range;
}

/**
 * 条文参照テキストから条文番号を抽出
 * @param text 参照テキスト（例：「民法第90条の規定により」）
 * @returns 条文番号の配列（重複を除く）
 */
export function extractArticleNumbers(text: string): NormalizedArticle[] {
  const articles: NormalizedArticle[] = [];
  const seen = new Set<string>();
  
  // 最も具体的なパターンから順にマッチ
  const pattern = /第([0-9]+)条/g;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const normalized = normalizeArticleNumber(match[0]);
    const key = `${normalized.numeric}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      articles.push(normalized);
    }
  }
  
  return articles;
}

/**
 * 相対参照を解決
 * @param referenceText 参照テキスト（例：「前条」「次条」「前項」）
 * @param currentArticle 現在の条文番号
 * @param currentParagraph 現在の項番号（オプション）
 * @returns 解決された条文・項番号
 */
export function resolveRelativeReference(
  referenceText: string,
  currentArticle: string,
  currentParagraph?: number
): { article: string; paragraph?: number } | null {
  const currentNorm = normalizeArticleNumber(currentArticle);
  
  if (referenceText === '前条') {
    if (currentNorm.value > 1) {
      return { article: `第${currentNorm.value - 1}条` };
    }
  } else if (referenceText === '次条') {
    return { article: `第${currentNorm.value + 1}条` };
  } else if (referenceText === '前項' && currentParagraph) {
    if (currentParagraph > 1) {
      return { 
        article: currentNorm.display,
        paragraph: currentParagraph - 1
      };
    }
  } else if (referenceText === '次項' && currentParagraph) {
    return { 
      article: currentNorm.display,
      paragraph: currentParagraph + 1
    };
  } else if (referenceText === '同条') {
    return { article: currentNorm.display };
  }
  
  return null;
}