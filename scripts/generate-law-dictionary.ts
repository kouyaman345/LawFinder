#!/usr/bin/env npx tsx
/**
 * 法令辞書の自動生成スクリプト
 * all_law_list.csvから全法令の辞書を生成
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface LawEntry {
  type: string;        // 法令種別
  number: string;      // 法令番号
  title: string;       // 法令名
  reading: string;     // 法令名読み
  oldTitle?: string;   // 旧法令名
  promulgated: string; // 公布日
  enforced: string;    // 施行日
  lawId: string;       // 法令ID
  url: string;        // 本文URL
}

interface LawDictionary {
  titleToId: Record<string, string>;
  abbreviationToId: Record<string, string>;
  lawNumberToId: Record<string, string>;
  lawMetadata: Record<string, {
    title: string;
    number: string;
    type: string;
    enforced: string;
  }>;
}

/**
 * CSVファイルを解析
 */
function parseCSV(csvPath: string): LawEntry[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').slice(1); // ヘッダーをスキップ
  
  const laws: LawEntry[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // CSVの各フィールドを解析（カンマ区切り、ただし引用符内は除く）
    const fields = line.match(/(".*?"|[^,]*)(,|$)/g);
    if (!fields || fields.length < 14) continue;
    
    const cleanField = (field: string) => {
      return field.replace(/^"|"$/g, '').replace(/,$/, '').trim();
    };
    
    const lawEntry: LawEntry = {
      type: cleanField(fields[0]),
      number: cleanField(fields[1]),
      title: cleanField(fields[2]),
      reading: cleanField(fields[3]),
      oldTitle: cleanField(fields[4]) || undefined,
      promulgated: cleanField(fields[5]),
      enforced: cleanField(fields[9]),
      lawId: cleanField(fields[11]),
      url: cleanField(fields[12])
    };
    
    // 有効な法令IDを持つエントリのみ追加
    if (lawEntry.lawId && lawEntry.title) {
      laws.push(lawEntry);
    }
  }
  
  return laws;
}

/**
 * 法令名から略称を生成
 */
function generateAbbreviations(title: string): string[] {
  const abbreviations: string[] = [];
  
  // 基本的な略称パターン
  const patterns = [
    // 「〜に関する法律」→「〜法」
    { pattern: /(.+)に関する法律$/, replacement: '$1法' },
    // 「〜のための法律」→「〜法」
    { pattern: /(.+)のための法律$/, replacement: '$1法' },
    // 「〜に関する特別措置法」→「〜特措法」
    { pattern: /(.+)に関する特別措置法$/, replacement: '$1特措法' },
    // 「〜の特例に関する法律」→「〜特例法」
    { pattern: /(.+)の特例に関する法律$/, replacement: '$1特例法' },
    // 「〜等に関する法律」→「〜等法」
    { pattern: /(.+)等に関する法律$/, replacement: '$1等法' },
    // 「〜及び〜に関する法律」→最初の部分のみ
    { pattern: /(.+?)及び.+に関する法律$/, replacement: '$1法' },
    // 「〜並びに〜に関する法律」→最初の部分のみ
    { pattern: /(.+?)並びに.+に関する法律$/, replacement: '$1法' },
  ];
  
  for (const { pattern, replacement } of patterns) {
    if (pattern.test(title)) {
      const abbr = title.replace(pattern, replacement);
      if (abbr !== title && abbr.length < title.length) {
        abbreviations.push(abbr);
      }
    }
  }
  
  // 一般的な略称
  const commonAbbreviations: Record<string, string[]> = {
    '日本国憲法': ['憲法'],
    '民法': ['民法'],
    '刑法': ['刑法'],
    '商法': ['商法'],
    '会社法': ['会社法'],
    '民事訴訟法': ['民訴法', '民訴'],
    '刑事訴訟法': ['刑訴法', '刑訴'],
    '労働基準法': ['労基法'],
    '労働契約法': ['労契法'],
    '労働安全衛生法': ['労安法', '安衛法'],
    '建築基準法': ['建基法'],
    '都市計画法': ['都計法'],
    '道路交通法': ['道交法'],
    '消防法': ['消防法'],
    '著作権法': ['著作権法'],
    '特許法': ['特許法'],
    '商標法': ['商標法'],
    '独占禁止法': ['独禁法'],
    '個人情報の保護に関する法律': ['個人情報保護法', '個情法'],
    '行政手続法': ['行手法'],
    '行政事件訴訟法': ['行訴法'],
    '国家公務員法': ['国公法'],
    '地方公務員法': ['地公法'],
    '地方自治法': ['地自法'],
    '河川法': ['河川法'],
    '森林法': ['森林法'],
    '農地法': ['農地法'],
    '環境影響評価法': ['環境アセス法', 'アセス法'],
  };
  
  if (commonAbbreviations[title]) {
    abbreviations.push(...commonAbbreviations[title]);
  }
  
  return [...new Set(abbreviations)]; // 重複除去
}

/**
 * 法令辞書を生成
 */
function generateDictionary(laws: LawEntry[]): LawDictionary {
  const dictionary: LawDictionary = {
    titleToId: {},
    abbreviationToId: {},
    lawNumberToId: {},
    lawMetadata: {}
  };
  
  for (const law of laws) {
    // タイトル → ID
    dictionary.titleToId[law.title] = law.lawId;
    
    // 旧法令名 → ID
    if (law.oldTitle) {
      dictionary.titleToId[law.oldTitle] = law.lawId;
    }
    
    // 法令番号 → ID
    if (law.number) {
      dictionary.lawNumberToId[law.number] = law.lawId;
    }
    
    // 略称 → ID
    const abbreviations = generateAbbreviations(law.title);
    for (const abbr of abbreviations) {
      // 既存の略称と衝突しない場合のみ追加
      if (!dictionary.abbreviationToId[abbr]) {
        dictionary.abbreviationToId[abbr] = law.lawId;
      }
    }
    
    // メタデータ
    dictionary.lawMetadata[law.lawId] = {
      title: law.title,
      number: law.number,
      type: law.type,
      enforced: law.enforced
    };
  }
  
  return dictionary;
}

/**
 * TypeScript/JavaScriptファイルとして出力
 */
function exportDictionary(dictionary: LawDictionary, outputPath: string): void {
  const content = `/**
 * 自動生成された法令辞書
 * 生成日時: ${new Date().toISOString()}
 * 法令数: ${Object.keys(dictionary.lawMetadata).length}
 */

const GENERATED_LAW_DICTIONARY = ${JSON.stringify(dictionary, null, 2)};

/**
 * 法令名からIDを検索
 */
function findLawIdByName(name) {
  return GENERATED_LAW_DICTIONARY.titleToId[name] || 
         GENERATED_LAW_DICTIONARY.abbreviationToId[name];
}

/**
 * 法令番号からIDを検索
 */
function findLawIdByNumber(number) {
  return GENERATED_LAW_DICTIONARY.lawNumberToId[number];
}

/**
 * 法令IDからメタデータを取得
 */
function getLawMetadata(lawId) {
  return GENERATED_LAW_DICTIONARY.lawMetadata[lawId];
}

// CommonJS互換性のため
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GENERATED_LAW_DICTIONARY,
    findLawIdByName,
    findLawIdByNumber,
    getLawMetadata
  };
}
`;
  
  fs.writeFileSync(outputPath, content, 'utf-8');
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  console.log(chalk.bold.cyan('\n=== 法令辞書自動生成 ===\n'));
  
  const csvPath = path.join(process.cwd(), 'laws_data', 'all_law_list.csv');
  const outputPath = path.join(process.cwd(), 'scripts', 'law-dictionary-generated.js');
  
  if (!fs.existsSync(csvPath)) {
    console.error(chalk.red(`CSVファイルが見つかりません: ${csvPath}`));
    process.exit(1);
  }
  
  console.log(chalk.green('1. CSVファイルを解析中...'));
  const laws = parseCSV(csvPath);
  console.log(chalk.gray(`   ${laws.length}件の法令を読み込みました`));
  
  console.log(chalk.green('2. 法令辞書を生成中...'));
  const dictionary = generateDictionary(laws);
  console.log(chalk.gray(`   タイトル: ${Object.keys(dictionary.titleToId).length}件`));
  console.log(chalk.gray(`   略称: ${Object.keys(dictionary.abbreviationToId).length}件`));
  console.log(chalk.gray(`   法令番号: ${Object.keys(dictionary.lawNumberToId).length}件`));
  
  console.log(chalk.green('3. ファイルに出力中...'));
  exportDictionary(dictionary, outputPath);
  console.log(chalk.gray(`   出力先: ${outputPath}`));
  
  // 統計情報
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('生成結果'));
  console.log(chalk.bold('━'.repeat(60)));
  
  console.log(`\n総法令数: ${laws.length}`);
  console.log(`タイトル登録数: ${Object.keys(dictionary.titleToId).length}`);
  console.log(`略称登録数: ${Object.keys(dictionary.abbreviationToId).length}`);
  console.log(`法令番号登録数: ${Object.keys(dictionary.lawNumberToId).length}`);
  
  // サンプル表示
  console.log(chalk.bold('\n━'.repeat(60)));
  console.log(chalk.bold.cyan('サンプル（最初の10件）'));
  console.log(chalk.bold('━'.repeat(60)));
  
  const samples = Object.entries(dictionary.titleToId).slice(0, 10);
  for (const [title, id] of samples) {
    console.log(`${title} → ${id}`);
  }
  
  console.log(chalk.green('\n✅ 法令辞書の生成が完了しました！'));
}

// 実行
if (require.main === module) {
  main().catch(console.error);
}

export { parseCSV, generateAbbreviations, generateDictionary };