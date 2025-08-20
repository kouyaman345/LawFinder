#!/usr/bin/env npx tsx

/**
 * e-Gov API参照チェッカー
 * 
 * e-Gov APIから法令XMLを取得し、参照を抽出して現在の検出と比較
 */

import { PrismaClient } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

interface ReferenceInfo {
  sourceArticle: string;
  targetLawName: string;
  targetLawId?: string;
  targetArticle?: string;
  referenceText: string;
  confidence: number;
}

/**
 * e-Gov APIから法令XMLを取得
 */
async function fetchEgovXML(lawId: string): Promise<string> {
  const spinner = ora(`e-Gov APIから${lawId}を取得中...`).start();
  
  try {
    const url = `https://laws.e-gov.go.jp/api/1/lawdata/${lawId}`;
    const xml = execSync(`curl -s "${url}"`, { encoding: 'utf-8' });
    spinner.succeed(`e-Gov API取得完了: ${lawId}`);
    return xml;
  } catch (error) {
    spinner.fail(`e-Gov API取得失敗: ${lawId}`);
    throw error;
  }
}

/**
 * XMLから参照を抽出
 */
function extractReferencesFromXML(xml: string): ReferenceInfo[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true
  });

  const data = parser.parse(xml);
  const references: ReferenceInfo[] = [];
  
  // 法令辞書（主要法令のマッピング）
  const LAW_DICTIONARY: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '会社法': '417AC0000000086',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '労働基準法': '322AC0000000049',
    '行政手続法': '405AC0000000088',
    '破産法': '416AC0000000075',
    '民事執行法': '354AC0000000004',
    '金融商品取引法': '323AC0000000025',
  };

  // 再帰的にXMLノードを探索
  function traverseNode(node: any, currentArticle: string = ''): void {
    if (!node) return;

    // 条文番号を追跡
    if (node['@_Num']) {
      currentArticle = `第${node['@_Num']}条`;
    }

    // テキストノードから参照を抽出
    if (typeof node === 'string') {
      // パターン1: 法令名＋条文
      const pattern1 = /([^、。\s（）]*法)(?:（[^）]+）)?第([一二三四五六七八九十百千０-９]+)条/g;
      let match;
      
      while ((match = pattern1.exec(node)) !== null) {
        const lawName = match[1];
        const articleNum = match[2];
        
        // 「この法」「同法」を除外
        if (lawName !== 'この法' && lawName !== '同法') {
          references.push({
            sourceArticle: currentArticle,
            targetLawName: lawName,
            targetLawId: LAW_DICTIONARY[lawName],
            targetArticle: `第${articleNum}条`,
            referenceText: match[0],
            confidence: LAW_DICTIONARY[lawName] ? 1.0 : 0.5
          });
        }
      }

      // パターン2: 法令名のみ（括弧付き）
      const pattern2 = /([^、。\s（）]*法)（([^）]+)）/g;
      
      while ((match = pattern2.exec(node)) !== null) {
        const lawName = match[1];
        const lawNum = match[2];
        
        // 既に検出済みでないかチェック
        const alreadyDetected = references.some(r => 
          r.referenceText.includes(match[0])
        );
        
        if (!alreadyDetected && lawName !== 'この法' && lawName !== '同法') {
          references.push({
            sourceArticle: currentArticle,
            targetLawName: lawName,
            targetLawId: LAW_DICTIONARY[lawName],
            referenceText: match[0],
            confidence: 0.8
          });
        }
      }
    }

    // 子ノードを再帰的に処理
    if (typeof node === 'object') {
      for (const key in node) {
        if (key !== '@_Num' && key !== '@_Delete') {
          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(item => traverseNode(item, currentArticle));
          } else {
            traverseNode(child, currentArticle);
          }
        }
      }
    }
  }

  // XMLデータから法令本体を取得
  const lawBody = data?.DataRoot?.ApplData?.LawFullText?.Law?.LawBody;
  if (lawBody) {
    traverseNode(lawBody);
  }

  return references;
}

/**
 * 現在のシステムで参照を検出
 */
async function detectWithCurrentSystem(lawId: string): Promise<ReferenceInfo[]> {
  const law = await prisma.law.findUnique({
    where: { lawId },
    include: {
      articles: {
        include: { paragraphs: true }
      }
    }
  });

  if (!law) return [];

  const references: ReferenceInfo[] = [];
  
  // 簡易検出器（detector.tsの簡易版）
  const LAW_DICT: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
  };

  for (const article of law.articles) {
    for (const paragraph of article.paragraphs) {
      const pattern = /([^、。\s（）]*法)(?:第([一二三四五六七八九十百千０-９]+)条)?/g;
      let match;
      
      while ((match = pattern.exec(paragraph.content)) !== null) {
        const lawName = match[1];
        if (lawName !== 'この法' && lawName !== '同法' && LAW_DICT[lawName]) {
          references.push({
            sourceArticle: article.articleNumber,
            targetLawName: lawName,
            targetLawId: LAW_DICT[lawName],
            targetArticle: match[2] ? `第${match[2]}条` : undefined,
            referenceText: match[0],
            confidence: 0.9
          });
        }
      }
    }
  }

  return references;
}

/**
 * 参照を比較して差分を分析
 */
function compareReferences(
  egovRefs: ReferenceInfo[],
  currentRefs: ReferenceInfo[]
): {
  matches: number;
  egovOnly: ReferenceInfo[];
  currentOnly: ReferenceInfo[];
  accuracy: number;
} {
  const egovSet = new Set(
    egovRefs.map(r => `${r.sourceArticle}:${r.targetLawName}:${r.targetArticle || ''}`)
  );
  
  const currentSet = new Set(
    currentRefs.map(r => `${r.sourceArticle}:${r.targetLawName}:${r.targetArticle || ''}`)
  );

  const matches = Array.from(egovSet).filter(key => currentSet.has(key)).length;
  
  const egovOnly = egovRefs.filter(r => {
    const key = `${r.sourceArticle}:${r.targetLawName}:${r.targetArticle || ''}`;
    return !currentSet.has(key);
  });

  const currentOnly = currentRefs.filter(r => {
    const key = `${r.sourceArticle}:${r.targetLawName}:${r.targetArticle || ''}`;
    return !egovSet.has(key);
  });

  const accuracy = egovRefs.length > 0 ? (matches / egovRefs.length) * 100 : 0;

  return {
    matches,
    egovOnly,
    currentOnly,
    accuracy
  };
}

/**
 * メイン処理
 */
async function checkWithEgov(lawIds: string[] = ['132AC0000000048']) {
  console.log(chalk.cyan('\n🔍 e-Gov API参照チェッカー'));
  console.log('='.repeat(80));
  console.log('e-Gov APIから正解データを取得し、現在の検出精度を検証します\n');

  const results = [];

  for (const lawId of lawIds) {
    console.log(chalk.yellow(`\n📋 ${lawId}を検証中...`));

    try {
      // e-Gov APIから取得
      const egovXML = await fetchEgovXML(lawId);
      const egovRefs = extractReferencesFromXML(egovXML);
      
      console.log(`  e-Gov参照数: ${chalk.green(egovRefs.length)}`);

      // 現在のシステムで検出
      const currentRefs = await detectWithCurrentSystem(lawId);
      console.log(`  現在の検出数: ${chalk.yellow(currentRefs.length)}`);

      // 比較
      const comparison = compareReferences(egovRefs, currentRefs);
      
      console.log(chalk.cyan('\n  📊 比較結果:'));
      console.log(`    正解マッチ: ${chalk.green(comparison.matches)}件`);
      console.log(`    e-Govのみ: ${chalk.red(comparison.egovOnly.length)}件（未検出）`);
      console.log(`    現在のみ: ${chalk.yellow(comparison.currentOnly.length)}件（誤検出の可能性）`);
      console.log(`    精度: ${comparison.accuracy < 100 ? chalk.red : chalk.green}${comparison.accuracy.toFixed(1)}%`);

      // 未検出パターンの分析
      if (comparison.egovOnly.length > 0) {
        console.log(chalk.yellow('\n  ⚠️ 未検出パターン（上位5件）:'));
        comparison.egovOnly.slice(0, 5).forEach(ref => {
          console.log(`    - ${ref.sourceArticle}: "${ref.referenceText}"`);
          console.log(`      → ${ref.targetLawName}${ref.targetArticle || ''}`);
        });
      }

      // 改善提案
      if (comparison.accuracy < 100) {
        console.log(chalk.cyan('\n  💡 改善提案:'));
        
        // パターン分析
        const unmappedLaws = new Set(
          comparison.egovOnly
            .filter(r => !r.targetLawId)
            .map(r => r.targetLawName)
        );
        
        if (unmappedLaws.size > 0) {
          console.log(`    1. 以下の法令を辞書に追加:`);
          Array.from(unmappedLaws).slice(0, 5).forEach(law => {
            console.log(`       - ${law}`);
          });
        }
        
        // 文脈参照の検出
        const contextualRefs = comparison.egovOnly.filter(r => 
          r.referenceText.includes('同法') || 
          r.referenceText.includes('前条')
        );
        
        if (contextualRefs.length > 0) {
          console.log(`    2. 文脈参照の処理強化（${contextualRefs.length}件）`);
        }
      }

      results.push({
        lawId,
        egovCount: egovRefs.length,
        currentCount: currentRefs.length,
        matches: comparison.matches,
        accuracy: comparison.accuracy,
        egovOnly: comparison.egovOnly,
        currentOnly: comparison.currentOnly
      });

    } catch (error) {
      console.error(chalk.red(`  エラー: ${error}`));
    }
  }

  // 総合サマリー
  console.log(chalk.cyan('\n\n📊 総合結果'));
  console.log('='.repeat(80));
  
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  const totalEgov = results.reduce((sum, r) => sum + r.egovCount, 0);
  const totalCurrent = results.reduce((sum, r) => sum + r.currentCount, 0);
  const totalMatches = results.reduce((sum, r) => sum + r.matches, 0);

  console.log(`検証法令数: ${results.length}`);
  console.log(`e-Gov総参照数: ${totalEgov}`);
  console.log(`現在の総検出数: ${totalCurrent}`);
  console.log(`正解マッチ総数: ${totalMatches}`);
  console.log(`平均精度: ${avgAccuracy < 100 ? chalk.red : chalk.green}${avgAccuracy.toFixed(1)}%`);

  // 100%達成への道筋
  if (avgAccuracy < 100) {
    console.log(chalk.yellow('\n🎯 精度100%達成への施策'));
    console.log('─'.repeat(60));
    
    // 未検出法令の集計
    const allUnmappedLaws = new Set<string>();
    results.forEach(r => {
      r.egovOnly.forEach(ref => {
        if (!ref.targetLawId) {
          allUnmappedLaws.add(ref.targetLawName);
        }
      });
    });

    console.log(`\n1. 法令辞書の拡充（${allUnmappedLaws.size}法令）`);
    Array.from(allUnmappedLaws).slice(0, 10).forEach(law => {
      console.log(`   - ${law}`);
    });

    console.log('\n2. 検出パターンの改善');
    console.log('   - 括弧内の法令番号パターン強化');
    console.log('   - 漢数字・アラビア数字の変換処理');
    console.log('   - 文脈参照（同法、前条）の解決');

    console.log('\n3. 実装手順');
    console.log('   Step 1: detector.tsの法令辞書を完全化');
    console.log('   Step 2: 文脈追跡機能の実装');
    console.log('   Step 3: e-Gov APIとの自動同期');
  } else {
    console.log(chalk.green('\n✅ 精度100%を達成しています！'));
  }

  // レポート保存
  const reportPath = path.join(
    process.cwd(), 
    'Report', 
    `egov_check_${new Date().toISOString().slice(0, 10)}.json`
  );
  
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(chalk.cyan(`\n📄 詳細レポート: ${reportPath}`));

  await prisma.$disconnect();
}

// 実行
if (require.main === module) {
  const args = process.argv.slice(2);
  const lawIds = args.length > 0 ? args : ['132AC0000000048', '129AC0000000089'];
  checkWithEgov(lawIds).catch(console.error);
}

export { checkWithEgov, fetchEgovXML, extractReferencesFromXML };