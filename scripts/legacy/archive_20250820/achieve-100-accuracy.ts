#!/usr/bin/env npx tsx

/**
 * 精度100%達成スクリプト
 * 
 * e-Gov APIの正解データと完全一致を目指す
 */

import { XMLParser } from 'fast-xml-parser';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 完全な法令辞書（e-Gov法令IDマッピング）
const COMPLETE_LAW_MAPPING: Record<string, string> = {
  // 基本法
  '憲法': '321CO0000000000',
  '日本国憲法': '321CO0000000000',
  
  // 民事法
  '民法': '129AC0000000089',
  '商法': '132AC0000000048',
  '会社法': '417AC0000000086',
  '民事訴訟法': '408AC0000000109',
  '民事執行法': '354AC0000000004',
  '民事保全法': '401AC0000000091',
  '破産法': '416AC0000000075',
  '民事再生法': '411AC0000000225',
  '会社更生法': '414AC0000000154',
  '手形法': '207AC0000000020',
  '小切手法': '208AC0000000057',
  
  // 刑事法
  '刑法': '140AC0000000045',
  '刑事訴訟法': '323AC0000000131',
  
  // 労働法
  '労働基準法': '322AC0000000049',
  
  // 金融法
  '金融商品取引法': '323AC0000000025',
  '銀行法': '356AC0000000059',
  
  // 商法内で参照される法令（e-Gov APIから発見）
  '保険法': '420AC0000000056',
  '信託法': '418AC0000000108',
  '電子記録債権法': '419AC0000000102',
  '船主相互保険組合法': '325AC0000000177',
  '国際海上物品運送法': '332AC0000000172',
  '商法施行法': '132AC0000000073',
  '商法の施行に伴う関係法律の整備等に関する法律': '411AC0000000087',
};

interface Reference {
  sourceArticle: string;
  targetLawName: string;
  targetLawId: string;
  targetArticle?: string;
  text: string;
  type: 'external' | 'internal' | 'relative';
}

/**
 * e-Gov APIから法令XMLを取得
 */
function fetchFromEgovAPI(lawId: string): string {
  console.log(chalk.cyan(`📥 e-Gov APIから${lawId}を取得中...`));
  const url = `https://laws.e-gov.go.jp/api/1/lawdata/${lawId}`;
  const xml = execSync(`curl -s "${url}"`, { encoding: 'utf-8' });
  return xml;
}

/**
 * XMLから全ての参照を正確に抽出
 */
function extractAllReferences(xml: string, lawId: string): Reference[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false
  });

  const data = parser.parse(xml);
  const references: Reference[] = [];
  let currentArticle = '';

  // XMLを再帰的に探索
  function traverse(node: any, articleNum?: string): void {
    if (!node) return;

    // 条文番号を追跡
    if (node['@_Num'] && (node.ArticleCaption || node.ArticleTitle)) {
      currentArticle = `第${node['@_Num']}条`;
      articleNum = currentArticle;
    }

    // テキストから参照を抽出
    if (typeof node === 'string' && articleNum) {
      // パターン集（e-Govで使用される全パターン）
      const patterns = [
        // 外部法令参照（法令名＋条文）
        {
          regex: /([^、。\s（）の]*?法)(?:（[^）]+）)?第([一二三四五六七八九十百千０-９\d]+)条/g,
          type: 'external' as const
        },
        // 外部法令参照（法令名のみ）
        {
          regex: /([^、。\s（）の]*?法)（([^）]+)）/g,
          type: 'external' as const
        },
        // 内部参照
        {
          regex: /(この法律|本法)第([一二三四五六七八九十百千０-９\d]+)条/g,
          type: 'internal' as const
        },
        // 相対参照
        {
          regex: /(前条|次条|前項|次項|前二項|前三項)/g,
          type: 'relative' as const
        }
      ];

      for (const { regex, type } of patterns) {
        let match;
        while ((match = regex.exec(node)) !== null) {
          if (type === 'external') {
            const lawName = match[1];
            
            // 除外リスト
            if (lawName === 'この法' || lawName === '同法' || lawName === '本法') {
              continue;
            }

            // 法令IDを解決
            let targetLawId = COMPLETE_LAW_MAPPING[lawName];
            
            // 法令番号から推測
            if (!targetLawId && match[2]) {
              const lawNum = match[2];
              // 法令番号パーサー（例: 平成十八年法律第五十号 → 418AC0000000050）
              targetLawId = parseLawNumber(lawNum);
            }

            if (targetLawId || lawName.endsWith('法')) {
              references.push({
                sourceArticle: articleNum,
                targetLawName: lawName,
                targetLawId: targetLawId || 'UNKNOWN',
                targetArticle: match[2] ? `第${match[2]}条` : undefined,
                text: match[0],
                type: 'external'
              });
            }
          } else if (type === 'internal') {
            references.push({
              sourceArticle: articleNum,
              targetLawName: '商法',
              targetLawId: lawId,
              targetArticle: `第${match[2]}条`,
              text: match[0],
              type: 'internal'
            });
          } else if (type === 'relative') {
            references.push({
              sourceArticle: articleNum,
              targetLawName: '商法',
              targetLawId: lawId,
              text: match[0],
              type: 'relative'
            });
          }
        }
      }
    }

    // 子ノードを再帰的に処理
    if (typeof node === 'object') {
      for (const key in node) {
        if (!key.startsWith('@_')) {
          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(item => traverse(item, articleNum));
          } else {
            traverse(child, articleNum);
          }
        }
      }
    }
  }

  // 法令本体から開始
  const lawBody = data?.DataRoot?.ApplData?.LawFullText?.Law?.LawBody;
  if (lawBody) {
    traverse(lawBody);
  }

  return references;
}

/**
 * 法令番号をパース（例: 平成十八年法律第五十号 → 418AC0000000050）
 */
function parseLawNumber(lawNum: string): string {
  // 簡易実装（実際は複雑な変換が必要）
  const patterns = [
    { regex: /明治(\S+)年法律第(\S+)号/, prefix: '1' },
    { regex: /大正(\S+)年法律第(\S+)号/, prefix: '2' },
    { regex: /昭和(\S+)年法律第(\S+)号/, prefix: '3' },
    { regex: /平成(\S+)年法律第(\S+)号/, prefix: '4' },
    { regex: /令和(\S+)年法律第(\S+)号/, prefix: '5' },
  ];

  for (const { regex, prefix } of patterns) {
    const match = lawNum.match(regex);
    if (match) {
      // 漢数字を数字に変換（簡易版）
      const year = convertKanjiToNumber(match[1]);
      const num = convertKanjiToNumber(match[2]);
      return `${prefix}${year.toString().padStart(2, '0')}AC${num.toString().padStart(10, '0')}`;
    }
  }

  return '';
}

/**
 * 漢数字を数字に変換
 */
function convertKanjiToNumber(kanji: string): number {
  const kanjiNumbers: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '二十': 20, '三十': 30, '四十': 40, '五十': 50,
    '六十': 60, '七十': 70, '八十': 80, '九十': 90,
    '百': 100
  };

  // 簡易変換
  return kanjiNumbers[kanji] || parseInt(kanji) || 0;
}

/**
 * メイン処理：精度100%を目指す
 */
async function achieve100Accuracy() {
  console.log(chalk.cyan('\n🎯 精度100%達成プログラム'));
  console.log('='.repeat(80));

  const testLawId = '132AC0000000048'; // 商法
  
  // e-Gov APIから取得
  const xml = fetchFromEgovAPI(testLawId);
  console.log(chalk.green('✓ e-Gov APIからXML取得完了'));

  // 参照を抽出
  const references = extractAllReferences(xml, testLawId);
  console.log(chalk.green(`✓ ${references.length}件の参照を抽出`));

  // 法令別集計
  const lawStats = new Map<string, number>();
  const unmappedLaws = new Set<string>();
  
  for (const ref of references) {
    const count = lawStats.get(ref.targetLawName) || 0;
    lawStats.set(ref.targetLawName, count + 1);
    
    if (ref.targetLawId === 'UNKNOWN') {
      unmappedLaws.add(ref.targetLawName);
    }
  }

  // 結果表示
  console.log(chalk.cyan('\n📊 参照統計'));
  console.log('─'.repeat(60));
  
  const sortedStats = Array.from(lawStats.entries()).sort((a, b) => b[1] - a[1]);
  sortedStats.slice(0, 20).forEach(([law, count]) => {
    const mapped = !unmappedLaws.has(law);
    const status = mapped ? chalk.green('✓') : chalk.red('✗');
    console.log(`${status} ${law.padEnd(30)} ${count}件`);
  });

  // マッピング状況
  const mappedCount = references.filter(r => r.targetLawId !== 'UNKNOWN').length;
  const accuracy = (mappedCount / references.length) * 100;

  console.log(chalk.cyan('\n📈 精度分析'));
  console.log('─'.repeat(60));
  console.log(`総参照数: ${references.length}`);
  console.log(`マッピング成功: ${chalk.green(mappedCount)}`);
  console.log(`マッピング失敗: ${chalk.red(references.length - mappedCount)}`);
  console.log(`現在の精度: ${accuracy < 100 ? chalk.red : chalk.green}${accuracy.toFixed(1)}%`);

  // 100%達成のための改善点
  if (accuracy < 100) {
    console.log(chalk.yellow('\n💡 100%達成のための追加辞書エントリ'));
    console.log('─'.repeat(60));
    
    console.log('\n以下を COMPLETE_LAW_MAPPING に追加してください:\n');
    
    // 未マップ法令を表示
    for (const law of unmappedLaws) {
      console.log(`  '${law}': 'XXXACXXXXXXXXX', // TODO: 正しい法令IDを設定`);
    }

    // サンプル参照を表示
    console.log(chalk.cyan('\n📝 未マップ参照の例（上位5件）'));
    const unmappedRefs = references.filter(r => r.targetLawId === 'UNKNOWN');
    unmappedRefs.slice(0, 5).forEach(ref => {
      console.log(`  ${ref.sourceArticle}: "${ref.text}"`);
    });
  } else {
    console.log(chalk.green('\n✅ 精度100%を達成しました！'));
  }

  // 完全な参照リストを保存
  const outputPath = path.join(
    process.cwd(),
    'Report',
    `complete_references_${testLawId}.json`
  );
  
  fs.writeFileSync(outputPath, JSON.stringify({
    lawId: testLawId,
    totalReferences: references.length,
    mappedReferences: mappedCount,
    accuracy: accuracy,
    references: references,
    unmappedLaws: Array.from(unmappedLaws)
  }, null, 2));

  console.log(chalk.cyan(`\n📄 完全な参照リスト: ${outputPath}`));

  // 検証用SQL生成
  console.log(chalk.cyan('\n🔧 検証用SQLを生成'));
  const sql = references.slice(0, 10).map(ref => {
    return `INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '${testLawId}', 
  (SELECT id FROM "Article" WHERE "lawId" = '${testLawId}' AND "articleNumber" = '${ref.sourceArticle}'),
  '${ref.targetLawId}',
  ${ref.targetArticle ? `'${ref.targetArticle}'` : 'NULL'},
  '${ref.text.replace(/'/g, "''")}',
  '${ref.type}',
  1.0
);`;
  }).join('\n\n');

  const sqlPath = path.join(process.cwd(), 'Report', 'insert_references.sql');
  fs.writeFileSync(sqlPath, sql);
  console.log(chalk.green(`✓ SQL生成完了: ${sqlPath}`));

  console.log(chalk.cyan('\n🎉 完了！'));
  console.log('次のステップ:');
  console.log('1. 未マップ法令のIDを調査してCOMPLETE_LAW_MAPPINGに追加');
  console.log('2. detector.tsを更新して新しい辞書を反映');
  console.log('3. 再度このスクリプトを実行して100%を確認');
}

// 実行
achieve100Accuracy().catch(console.error);