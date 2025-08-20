#!/usr/bin/env npx tsx

/**
 * 汎用検出エンジンのテスト
 * 
 * 複数の法令でテストして汎用性を確認
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { UltimateReferenceDetector } from './detector';

/**
 * XMLから条文を抽出
 */
function extractArticlesFromXML(xmlPath: string): { articleNumber: string; content: string }[] {
  const xmlContent = readFileSync(xmlPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true
  });
  
  const data = parser.parse(xmlContent);
  const articles: { articleNumber: string; content: string }[] = [];
  
  function extractText(node: any): string {
    if (typeof node === 'string') return node;
    if (!node) return '';
    
    let text = '';
    
    if (node.Sentence) {
      const sentences = Array.isArray(node.Sentence) ? node.Sentence : [node.Sentence];
      text += sentences.map((s: any) => {
        if (typeof s === 'string') return s;
        if (s['#text']) return s['#text'];
        return '';
      }).join('');
    }
    
    if (node.ParagraphSentence) {
      text += extractText(node.ParagraphSentence);
    }
    
    for (const key in node) {
      if (key !== '@_Num' && key !== 'Sentence' && key !== 'ParagraphSentence') {
        const child = node[key];
        if (Array.isArray(child)) {
          text += child.map(c => extractText(c)).join('');
        } else if (typeof child === 'object') {
          text += extractText(child);
        }
      }
    }
    
    return text;
  }
  
  function traverseArticles(node: any, depth: number = 0): void {
    if (!node) return;
    
    if (node.Article) {
      const articleNodes = Array.isArray(node.Article) ? node.Article : [node.Article];
      for (const article of articleNodes) {
        const articleNumber = article['@_Num'] ? `第${article['@_Num']}条` : '';
        const content = extractText(article);
        if (articleNumber && content) {
          articles.push({ articleNumber, content });
        }
      }
    }
    
    for (const key in node) {
      if (key !== 'Article' && !key.startsWith('@_')) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(c => traverseArticles(c, depth + 1));
        } else if (typeof child === 'object') {
          traverseArticles(child, depth + 1);
        }
      }
    }
  }
  
  const lawBody = data?.Law?.LawBody;
  if (lawBody) {
    traverseArticles(lawBody);
  }
  
  const supplementary = data?.Law?.SupplementaryProvision;
  if (supplementary) {
    const supplementaryArticles = Array.isArray(supplementary) ? supplementary : [supplementary];
    for (const supp of supplementaryArticles) {
      traverseArticles(supp);
    }
  }
  
  return articles;
}

/**
 * 法令のテスト
 */
async function testLaw(lawId: string, lawName: string, xmlPath: string): Promise<{ total: number; success: number; accuracy: number }> {
  if (!existsSync(xmlPath)) {
    console.log(chalk.yellow(`  ⚠️ ${lawName}のXMLファイルが見つかりません`));
    return { total: 0, success: 0, accuracy: 0 };
  }
  
  console.log(chalk.cyan(`\n📋 ${lawName}のテスト`));
  console.log('-'.repeat(60));
  
  const articles = extractArticlesFromXML(xmlPath);
  console.log(`  条文数: ${articles.length}`);
  
  // サンプル条文を選択（最初の10条と附則の一部）
  const sampleArticles = articles.slice(0, 10);
  const supplementaryArticles = articles.filter(a => 
    a.content.includes('新法') || 
    a.content.includes('旧法') ||
    a.content.includes('改正') ||
    a.content.includes('この法律')
  ).slice(0, 5);
  
  const testArticles = [...sampleArticles, ...supplementaryArticles];
  
  const detector = new UltimateReferenceDetector();
  const allReferences: any[] = [];
  
  // 全文を結合して文脈を保持
  const fullText = testArticles.map(a => a.content).join('\n');
  const references = await detector.detectReferences(fullText, lawId, lawName);
  allReferences.push(...references);
  
  // 統計計算
  const totalRefs = allReferences.length;
  const mappedRefs = allReferences.filter(ref => 
    ref.targetLawId || ref.targetArticle || ref.targetLaw
  ).length;
  const accuracy = totalRefs > 0 ? (mappedRefs / totalRefs * 100) : 0;
  
  console.log(`  総参照数: ${totalRefs}`);
  console.log(`  マッピング成功: ${chalk.green(mappedRefs)}`);
  console.log(`  マッピング失敗: ${chalk.red(totalRefs - mappedRefs)}`);
  console.log(`  精度: ${accuracy >= 90 ? chalk.green : accuracy >= 70 ? chalk.yellow : chalk.red}(${accuracy.toFixed(1)}%)`);
  
  // 参照タイプの内訳
  const typeCount: Record<string, number> = {};
  for (const ref of allReferences) {
    typeCount[ref.type] = (typeCount[ref.type] || 0) + 1;
  }
  
  console.log('  内訳:');
  for (const [type, count] of Object.entries(typeCount)) {
    console.log(`    ${type}: ${count}`);
  }
  
  return { total: totalRefs, success: mappedRefs, accuracy };
}

/**
 * メイン処理
 */
async function testUniversalDetector() {
  console.log(chalk.cyan('🔍 汎用参照検出エンジンのテスト'));
  console.log('='.repeat(80));
  
  const testCases = [
    {
      lawId: '132AC0000000048',
      lawName: '商法',
      xmlDir: '132AC0000000048_20230401_503AC0000000061',
      xmlFile: '132AC0000000048_20230401_503AC0000000061.xml'
    },
    {
      lawId: '129AC0000000089',
      lawName: '民法',
      xmlDir: 'sample',
      xmlFile: '129AC0000000089.xml'
    },
    {
      lawId: '140AC0000000045',
      lawName: '刑法',
      xmlDir: 'sample',
      xmlFile: '140AC0000000045.xml'
    },
    {
      lawId: '417AC0000000086',
      lawName: '会社法',
      xmlDir: 'sample',
      xmlFile: '417AC0000000086.xml'
    },
    {
      lawId: '322AC0000000049',
      lawName: '労働基準法',
      xmlDir: 'sample',
      xmlFile: '322AC0000000049.xml'
    }
  ];
  
  const results: { lawName: string; accuracy: number }[] = [];
  
  for (const testCase of testCases) {
    const xmlPath = join(
      process.cwd(),
      'laws_data',
      testCase.xmlDir,
      testCase.xmlFile
    );
    
    const result = await testLaw(testCase.lawId, testCase.lawName, xmlPath);
    if (result.total > 0) {
      results.push({ lawName: testCase.lawName, accuracy: result.accuracy });
    }
  }
  
  // 総合評価
  console.log(chalk.cyan('\n📊 総合評価'));
  console.log('='.repeat(80));
  
  if (results.length === 0) {
    console.log(chalk.red('テスト可能な法令がありませんでした'));
    return;
  }
  
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  
  console.log(chalk.yellow('\n精度一覧:'));
  for (const result of results) {
    const color = result.accuracy >= 90 ? chalk.green : result.accuracy >= 70 ? chalk.yellow : chalk.red;
    console.log(`  ${result.lawName}: ${color(result.accuracy.toFixed(1) + '%')}`);
  }
  
  console.log(chalk.cyan(`\n平均精度: ${avgAccuracy >= 90 ? chalk.green : avgAccuracy >= 70 ? chalk.yellow : chalk.red}(${avgAccuracy.toFixed(1)}%)`));
  
  if (avgAccuracy >= 90) {
    console.log(chalk.green('\n✅ 汎用性: 優秀 - すべての法令で高精度を達成'));
  } else if (avgAccuracy >= 70) {
    console.log(chalk.yellow('\n⚠️ 汎用性: 良好 - 一部改善の余地あり'));
  } else {
    console.log(chalk.red('\n❌ 汎用性: 要改善 - 追加の最適化が必要'));
  }
  
  // 推奨事項
  console.log(chalk.cyan('\n💡 推奨事項:'));
  console.log('1. 自動生成辞書を構築して精度向上: npx tsx scripts/build-law-dictionary.ts');
  console.log('2. 各法令固有の定義パターンを学習');
  console.log('3. LLM統合による文脈理解の強化');
}

// 実行
if (require.main === module) {
  testUniversalDetector().catch(console.error);
}

export { testUniversalDetector };