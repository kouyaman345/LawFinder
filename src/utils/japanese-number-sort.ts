/**
 * 日本語の漢数字を数値に変換する
 */
export function kanjiToNumber(kanji: string): number {
  // 「の二」などの複合番号をチェック
  const compoundMatch = kanji.match(/^(.+)の(.+)$/);
  if (compoundMatch) {
    const mainNum = kanjiToNumber(compoundMatch[1]);
    const subNum = kanjiToNumber(compoundMatch[2]);
    // メイン番号 + サブ番号の0.1倍で表現（例：三の二 = 3.2）
    return mainNum + subNum * 0.01;
  }

  const kanjiNumbers: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
    '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29, '三十': 30,
    '三十一': 31, '三十二': 32, '三十三': 33, '三十四': 34, '三十五': 35,
    '三十六': 36, '三十七': 37, '三十八': 38, '三十九': 39, '四十': 40,
    '四十一': 41, '四十二': 42, '四十三': 43, '四十四': 44, '四十五': 45,
    '四十六': 46, '四十七': 47, '四十八': 48, '四十九': 49, '五十': 50,
  };

  return kanjiNumbers[kanji] || 999; // 認識できない場合は最後に配置
}

/**
 * 項目（号）のリストを正しい順序でソートする
 */
export function sortItemsByNumber<T extends { itemNumber: string }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const numA = kanjiToNumber(a.itemNumber);
    const numB = kanjiToNumber(b.itemNumber);
    return numA - numB;
  });
}

/**
 * 条文のリストを条番号でソートする
 * （条番号も日本語の数字の場合があるため）
 */
export function sortArticlesByNumber<T extends { articleNumber: string }>(articles: T[]): T[] {
  return articles.sort((a, b) => {
    // まず通常の数字（アラビア数字）として解析を試みる
    const numA = parseInt(a.articleNumber);
    const numB = parseInt(b.articleNumber);
    
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    
    // 日本語の数字として解析
    const kanjiA = kanjiToNumber(a.articleNumber);
    const kanjiB = kanjiToNumber(b.articleNumber);
    
    if (kanjiA !== 999 || kanjiB !== 999) {
      return kanjiA - kanjiB;
    }
    
    // それ以外は文字列として比較
    return a.articleNumber.localeCompare(b.articleNumber);
  });
}