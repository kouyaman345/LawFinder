#!/usr/bin/env npx tsx

/**
 * 実データでの精度測定
 * 
 * 商法XMLを使って改善前後の精度を比較
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { UltimateReferenceDetector } from './detector';

// 改善前の単純なパターンマッチング
class SimplePatternDetector {
  private readonly LAW_DICTIONARY: Record<string, string> = {
    '民法': '129AC0000000089',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '刑法': '140AC0000000045',
    '刑事訴訟法': '323AC0000000131',
  };
  
  detect(text: string): any[] {
    const references: any[] = [];
    
    // パターン1: 法令名（括弧付き）
    const pattern1 = /([^、。\s（）]*法)（([^）]+)）/g;
    let match;
    
    while ((match = pattern1.exec(text)) !== null) {
      const lawName = match[1];
      const lawId = this.LAW_DICTIONARY[lawName];
      
      if (lawId && lawName !== 'この法' && lawName !== '同法') {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: lawId,
          position: match.index
        });
      }
    }
    
    // パターン2: 法令名＋条文
    const pattern2 = /([^、。\s（）]*法)第([一二三四五六七八九十百千]+)条/g;
    
    while ((match = pattern2.exec(text)) !== null) {
      const lawName = match[1];
      const lawId = this.LAW_DICTIONARY[lawName];
      
      if (lawId && lawName !== 'この法' && lawName !== '同法') {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: lawId,
          targetArticle: `第${match[2]}条`,
          position: match.index
        });
      }
    }
    
    // 相対参照（解決不能）
    const relativePatterns = ['前条', '次条', '前項', '次項'];
    for (const pattern of relativePatterns) {
      const regex = new RegExp(pattern, 'g');
      while ((match = regex.exec(text)) !== null) {
        references.push({
          type: 'relative',
          text: pattern,
          targetLaw: null,
          targetLawId: null,
          position: match.index
        });
      }
    }
    
    return references;
  }
}

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
    
    // Sentenceノードからテキストを抽出
    if (node.Sentence) {
      const sentences = Array.isArray(node.Sentence) ? node.Sentence : [node.Sentence];
      text += sentences.map((s: any) => {
        if (typeof s === 'string') return s;
        if (s['#text']) return s['#text'];
        return '';
      }).join('');
    }
    
    // ParagraphSentenceを処理
    if (node.ParagraphSentence) {
      text += extractText(node.ParagraphSentence);
    }
    
    // 子ノードを再帰的に処理
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
    
    // Article要素を探す
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
    
    // 子ノードを再帰的に探索
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
  
  // 附則も処理
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
 * 参照の種類を分類
 */
function classifyReferences(references: any[]): Record<string, number> {
  const classification: Record<string, number> = {
    external_mapped: 0,     // 外部参照（IDマッピング成功）
    external_unmapped: 0,   // 外部参照（IDマッピング失敗）
    internal: 0,            // 内部参照
    relative_resolved: 0,   // 相対参照（解決済み）
    relative_unresolved: 0, // 相対参照（未解決）
    contextual_resolved: 0, // 文脈依存（解決済み）
    contextual_unresolved: 0, // 文脈依存（未解決）
    defined: 0,            // 定義された用語
  };
  
  for (const ref of references) {
    switch (ref.type) {
      case 'external':
        if (ref.targetLawId) {
          classification.external_mapped++;
        } else {
          classification.external_unmapped++;
        }
        break;
      
      case 'internal':
        classification.internal++;
        break;
      
      case 'relative':
        if (ref.targetArticle || ref.targetLaw) {
          classification.relative_resolved++;
        } else {
          classification.relative_unresolved++;
        }
        break;
      
      case 'contextual':
        if (ref.targetLaw || ref.targetLawId) {
          classification.contextual_resolved++;
        } else {
          classification.contextual_unresolved++;
        }
        break;
      
      case 'defined':
        classification.defined++;
        break;
    }
  }
  
  return classification;
}

/**
 * メイン処理
 */
async function compareDetectors() {
  console.log(chalk.cyan('\n📊 実データでの精度測定'));
  console.log('='.repeat(80));
  
  const xmlPath = join(
    process.cwd(),
    'laws_data',
    '132AC0000000048_20230401_503AC0000000061',
    '132AC0000000048_20230401_503AC0000000061.xml'
  );
  
  console.log(chalk.yellow('\n📄 商法XMLを読み込み中...'));
  const articles = extractArticlesFromXML(xmlPath);
  console.log(chalk.green(`✓ ${articles.length}条文を抽出`));
  
  // サンプル条文を選択（最初の20条文と附則）
  const sampleArticles = articles.slice(0, 20);
  const supplementaryArticles = articles.filter(a => 
    a.content.includes('新法') || 
    a.content.includes('旧法') ||
    a.content.includes('改正') ||
    a.content.includes('この法律による')
  ).slice(0, 10);
  
  const testArticles = [...sampleArticles, ...supplementaryArticles];
  
  console.log(chalk.yellow(`\n🧪 ${testArticles.length}条文でテスト`));
  
  // 改善前の検出
  console.log(chalk.cyan('\n【改善前】単純パターンマッチング'));
  console.log('-'.repeat(60));
  
  const simpleDetector = new SimplePatternDetector();
  const simpleResults: any[] = [];
  
  for (const article of testArticles) {
    const refs = simpleDetector.detect(article.content);
    simpleResults.push(...refs);
  }
  
  const simpleClassification = classifyReferences(simpleResults);
  const simpleMappedCount = simpleClassification.external_mapped + 
                           simpleClassification.relative_resolved + 
                           simpleClassification.contextual_resolved;
  const simpleUnmappedCount = simpleClassification.external_unmapped + 
                              simpleClassification.relative_unresolved + 
                              simpleClassification.contextual_unresolved;
  const simpleAccuracy = simpleResults.length > 0 
    ? (simpleMappedCount / simpleResults.length * 100).toFixed(1)
    : '0.0';
  
  console.log(`総検出数: ${simpleResults.length}`);
  console.log(`マッピング成功: ${chalk.green(simpleMappedCount)}`);
  console.log(`マッピング失敗: ${chalk.red(simpleUnmappedCount)}`);
  console.log(`精度: ${chalk.yellow(simpleAccuracy + '%')}`);
  
  console.log('\n内訳:');
  for (const [type, count] of Object.entries(simpleClassification)) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }
  
  // 改善後の検出
  console.log(chalk.cyan('\n【改善後】統合型検出エンジン（detector.ts）'));
  console.log('-'.repeat(60));
  
  const ultimateDetector = new UltimateReferenceDetector();
  const contextAwareResults: any[] = [];
  
  // 全文を結合して文脈を保持
  const fullText = testArticles.map(a => a.content).join('\n');
  const contextRefs = await ultimateDetector.detectReferences(fullText, '132AC0000000048', '商法');
  contextAwareResults.push(...contextRefs);
  
  const contextClassification = classifyReferences(contextAwareResults);
  const contextMappedCount = contextClassification.external_mapped + 
                             contextClassification.relative_resolved + 
                             contextClassification.contextual_resolved +
                             contextClassification.defined +
                             contextClassification.internal;
  const contextUnmappedCount = contextClassification.external_unmapped + 
                               contextClassification.relative_unresolved + 
                               contextClassification.contextual_unresolved;
  const contextAccuracy = contextAwareResults.length > 0
    ? (contextMappedCount / contextAwareResults.length * 100).toFixed(1)
    : '0.0';
  
  console.log(`総検出数: ${contextAwareResults.length}`);
  console.log(`マッピング成功: ${chalk.green(contextMappedCount)}`);
  console.log(`マッピング失敗: ${chalk.red(contextUnmappedCount)}`);
  console.log(`精度: ${chalk.green(contextAccuracy + '%')}`);
  
  console.log('\n内訳:');
  for (const [type, count] of Object.entries(contextClassification)) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }
  
  // 改善効果
  console.log(chalk.cyan('\n📈 改善効果'));
  console.log('='.repeat(80));
  
  const improvement = parseFloat(contextAccuracy) - parseFloat(simpleAccuracy);
  console.log(`精度向上: ${improvement > 0 ? chalk.green('+') : chalk.red('')}${improvement.toFixed(1)}%`);
  console.log(`検出数増加: ${contextAwareResults.length - simpleResults.length}件`);
  
  // 特に改善された参照タイプ
  console.log(chalk.yellow('\n✨ 特に改善された参照タイプ:'));
  
  if (contextClassification.defined > 0) {
    console.log(`  定義された用語（新法、旧法など）: ${chalk.green(contextClassification.defined)}件を新規検出`);
  }
  
  if (contextClassification.contextual_resolved > simpleClassification.contextual_resolved) {
    const diff = contextClassification.contextual_resolved - simpleClassification.contextual_resolved;
    console.log(`  文脈依存参照（同法など）: ${chalk.green('+' + diff)}件を解決`);
  }
  
  if (contextClassification.relative_resolved > simpleClassification.relative_resolved) {
    const diff = contextClassification.relative_resolved - simpleClassification.relative_resolved;
    console.log(`  相対参照（前条、次条など）: ${chalk.green('+' + diff)}件を解決`);
  }
  
  // サンプル表示
  console.log(chalk.cyan('\n📝 改善された参照の例:'));
  
  const improvedRefs = contextAwareResults.filter(ref => 
    ref.resolutionMethod === 'definition' || 
    ref.resolutionMethod === 'context' ||
    ref.resolutionMethod === 'relative'
  ).slice(0, 5);
  
  for (const ref of improvedRefs) {
    console.log(`  "${ref.text}" → ${ref.targetLaw || ref.targetArticle} (${ref.resolutionMethod})`);
  }
}

// 実行
if (require.main === module) {
  compareDetectors().catch(console.error);
}

export { compareDetectors };