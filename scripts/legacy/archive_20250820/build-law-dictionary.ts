#!/usr/bin/env npx tsx

/**
 * 法令辞書の自動構築
 * 
 * laws_data内のすべての法令から辞書を構築
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import chalk from 'chalk';

interface LawEntry {
  lawId: string;
  title: string;
  abbreviations: string[];
  lawNumber?: string;
  era?: string;
  year?: number;
  number?: number;
}

/**
 * CSVから法令リストを読み込み
 */
function loadLawList(): LawEntry[] {
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
  
  if (!existsSync(csvPath)) {
    console.error(chalk.red('❌ all_law_list.csv が見つかりません'));
    return [];
  }
  
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  const lawEntries: LawEntry[] = [];
  
  for (const record of records) {
    const lawId = record['法令ID'] || record['law_id'];
    const title = record['法令名'] || record['law_title'];
    
    if (!lawId || !title) continue;
    
    // 法令番号の解析
    const lawNumberMatch = title.match(/（(.+)）/);
    const lawNumber = lawNumberMatch ? lawNumberMatch[1] : undefined;
    
    // 略称の生成
    const abbreviations: string[] = [];
    
    // 括弧を除いた形
    const shortTitle = title.replace(/（.+）/g, '').trim();
    if (shortTitle !== title) {
      abbreviations.push(shortTitle);
    }
    
    // 「に関する法律」を除いた形
    const coreTitle = shortTitle.replace(/に関する法律$/, '法');
    if (coreTitle !== shortTitle && coreTitle.endsWith('法')) {
      abbreviations.push(coreTitle);
    }
    
    // 「の○○に関する法律」を除いた形
    const simplerTitle = shortTitle.replace(/の.+に関する法律$/, '法');
    if (simplerTitle !== shortTitle && simplerTitle !== coreTitle && simplerTitle.endsWith('法')) {
      abbreviations.push(simplerTitle);
    }
    
    // よく使われる略称パターン
    if (title.includes('組織的な犯罪の処罰及び犯罪収益の規制等に関する法律')) {
      abbreviations.push('組織犯罪処罰法', '組織的犯罪処罰法', 'マネロン法');
    }
    if (title.includes('暴力団員による不当な行為の防止等に関する法律')) {
      abbreviations.push('暴対法', '暴力団対策法');
    }
    if (title.includes('個人情報の保護に関する法律')) {
      abbreviations.push('個人情報保護法', '個情法');
    }
    if (title.includes('行政機関の保有する情報の公開に関する法律')) {
      abbreviations.push('情報公開法', '行政機関情報公開法');
    }
    if (title.includes('独立行政法人等の保有する情報の公開に関する法律')) {
      abbreviations.push('独立行政法人情報公開法');
    }
    if (title.includes('金融商品取引法')) {
      abbreviations.push('金商法');
    }
    if (title.includes('労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律')) {
      abbreviations.push('労働者派遣法', '派遣法');
    }
    
    // 元号と年の解析
    if (lawNumber) {
      const eraMatch = lawNumber.match(/(明治|大正|昭和|平成|令和)(\d+|[一二三四五六七八九十]+)年/);
      if (eraMatch) {
        const era = eraMatch[1];
        const yearText = eraMatch[2];
        
        // 年を数値に変換
        let year: number | undefined;
        if (/^\d+$/.test(yearText)) {
          year = parseInt(yearText);
        } else {
          // 漢数字の変換（簡易版）
          year = convertKanjiToNumber(yearText);
        }
        
        lawEntries.push({
          lawId,
          title,
          abbreviations: [...new Set(abbreviations)],
          lawNumber,
          era,
          year
        });
        
        continue;
      }
    }
    
    lawEntries.push({
      lawId,
      title,
      abbreviations: [...new Set(abbreviations)],
      lawNumber
    });
  }
  
  return lawEntries;
}

/**
 * 漢数字を数値に変換
 */
function convertKanjiToNumber(text: string): number | undefined {
  const map: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '二十': 20, '三十': 30, '四十': 40, '五十': 50,
    '六十': 60, '七十': 70, '八十': 80, '九十': 90,
    '百': 100
  };
  
  if (map[text]) return map[text];
  
  // 複合パターン（例: 二十九）
  const match = text.match(/^([二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (match) {
    const tens = match[1] ? map[match[1]] : 1;
    const ones = match[2] ? map[match[2]] : 0;
    return tens * 10 + ones;
  }
  
  return undefined;
}

/**
 * 辞書をTypeScriptファイルとして出力
 */
function generateDictionaryFile(lawEntries: LawEntry[]) {
  const outputPath = join(process.cwd(), 'scripts', 'law-dictionary-generated.ts');
  
  // 法令名 → ID のマッピング
  const titleToId: Record<string, string> = {};
  const abbreviationToId: Record<string, string> = {};
  const lawNumberToId: Record<string, string> = {};
  
  for (const entry of lawEntries) {
    titleToId[entry.title] = entry.lawId;
    
    for (const abbr of entry.abbreviations) {
      // 複数の法令が同じ略称を持つ場合は最初のものを優先
      if (!abbreviationToId[abbr]) {
        abbreviationToId[abbr] = entry.lawId;
      }
    }
    
    if (entry.lawNumber) {
      lawNumberToId[entry.lawNumber] = entry.lawId;
    }
  }
  
  const content = `/**
 * 自動生成された法令辞書
 * 
 * Generated: ${new Date().toISOString()}
 * Total laws: ${lawEntries.length}
 */

export interface GeneratedLawDictionary {
  titleToId: Record<string, string>;
  abbreviationToId: Record<string, string>;
  lawNumberToId: Record<string, string>;
  lawMetadata: Record<string, LawMetadata>;
}

export interface LawMetadata {
  lawId: string;
  title: string;
  abbreviations: string[];
  lawNumber?: string;
  era?: string;
  year?: number;
}

export const GENERATED_LAW_DICTIONARY: GeneratedLawDictionary = {
  // 正式名称 → 法令ID
  titleToId: ${JSON.stringify(titleToId, null, 2)},
  
  // 略称 → 法令ID
  abbreviationToId: ${JSON.stringify(abbreviationToId, null, 2)},
  
  // 法令番号 → 法令ID
  lawNumberToId: ${JSON.stringify(lawNumberToId, null, 2)},
  
  // 法令メタデータ
  lawMetadata: ${JSON.stringify(
    Object.fromEntries(lawEntries.map(e => [e.lawId, e])),
    null,
    2
  )}
};

/**
 * 法令名から法令IDを検索
 */
export function findLawIdByName(name: string): string | undefined {
  // 完全一致（正式名称）
  if (GENERATED_LAW_DICTIONARY.titleToId[name]) {
    return GENERATED_LAW_DICTIONARY.titleToId[name];
  }
  
  // 略称
  if (GENERATED_LAW_DICTIONARY.abbreviationToId[name]) {
    return GENERATED_LAW_DICTIONARY.abbreviationToId[name];
  }
  
  // 部分一致（正式名称）
  for (const [title, id] of Object.entries(GENERATED_LAW_DICTIONARY.titleToId)) {
    if (title.includes(name) || name.includes(title)) {
      return id;
    }
  }
  
  return undefined;
}

/**
 * 法令番号から法令IDを検索
 */
export function findLawIdByNumber(number: string): string | undefined {
  return GENERATED_LAW_DICTIONARY.lawNumberToId[number];
}
`;
  
  writeFileSync(outputPath, content, 'utf-8');
  console.log(chalk.green(`✅ 辞書ファイルを生成しました: ${outputPath}`));
}

/**
 * メイン処理
 */
async function buildDictionary() {
  console.log(chalk.cyan('🔨 法令辞書の自動構築'));
  console.log('='.repeat(80));
  
  console.log(chalk.yellow('\n📚 法令リストを読み込み中...'));
  const lawEntries = loadLawList();
  
  if (lawEntries.length === 0) {
    console.error(chalk.red('❌ 法令データが見つかりません'));
    return;
  }
  
  console.log(chalk.green(`✓ ${lawEntries.length}件の法令を読み込みました`));
  
  // 統計情報
  const withAbbreviations = lawEntries.filter(e => e.abbreviations.length > 0);
  const withLawNumber = lawEntries.filter(e => e.lawNumber);
  
  console.log(chalk.cyan('\n📊 統計情報:'));
  console.log(`  略称を持つ法令: ${withAbbreviations.length}件`);
  console.log(`  法令番号を持つ法令: ${withLawNumber.length}件`);
  
  // 略称の例を表示
  console.log(chalk.yellow('\n📝 略称の例:'));
  const samples = withAbbreviations.slice(0, 5);
  for (const entry of samples) {
    console.log(`  ${entry.title}`);
    for (const abbr of entry.abbreviations) {
      console.log(chalk.gray(`    → ${abbr}`));
    }
  }
  
  console.log(chalk.yellow('\n💾 辞書ファイルを生成中...'));
  generateDictionaryFile(lawEntries);
  
  console.log(chalk.green('\n✅ 辞書の構築が完了しました'));
  
  // 使用方法の説明
  console.log(chalk.cyan('\n📖 使用方法:'));
  console.log(chalk.gray(`
import { findLawIdByName, findLawIdByNumber } from './law-dictionary-generated';

// 法令名から検索
const lawId1 = findLawIdByName('民法');
const lawId2 = findLawIdByName('個人情報保護法');  // 略称もOK

// 法令番号から検索
const lawId3 = findLawIdByNumber('明治二十九年法律第八十九号');
  `));
}

// 実行
if (require.main === module) {
  buildDictionary().catch(console.error);
}

export { buildDictionary };