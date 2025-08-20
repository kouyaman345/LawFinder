#!/usr/bin/env npx tsx

/**
 * 未マッピング参照の詳細分析
 * 
 * 精度100%達成のために、マッピングに失敗している参照を分析
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';
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
 * 未マッピング参照の分析
 */
async function analyzeUnmapped() {
  console.log(chalk.cyan('\n🔍 未マッピング参照の詳細分析'));
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
  
  // サンプル条文を選択
  const sampleArticles = articles.slice(0, 20);
  const supplementaryArticles = articles.filter(a => 
    a.content.includes('新法') || 
    a.content.includes('旧法') ||
    a.content.includes('改正') ||
    a.content.includes('この法律による')
  ).slice(0, 10);
  
  const testArticles = [...sampleArticles, ...supplementaryArticles];
  
  console.log(chalk.yellow(`\n🧪 ${testArticles.length}条文でテスト`));
  
  const detector = new UltimateReferenceDetector();
  const unmappedReferences: any[] = [];
  
  // 全文を結合して文脈を保持
  const fullText = testArticles.map(a => a.content).join('\n');
  const references = await detector.detectReferences(fullText, '132AC0000000048', '商法');
  
  // 未マッピングの参照を抽出
  for (const ref of references) {
    if (!ref.targetLawId || ref.targetLawId === null) {
      unmappedReferences.push(ref);
    }
  }
  
  console.log(chalk.red(`\n❌ 未マッピング参照: ${unmappedReferences.length}件`));
  
  if (unmappedReferences.length > 0) {
    console.log(chalk.yellow('\n📋 未マッピング参照の詳細:'));
    
    // タイプ別に分類
    const byType: Record<string, any[]> = {};
    for (const ref of unmappedReferences) {
      if (!byType[ref.type]) {
        byType[ref.type] = [];
      }
      byType[ref.type].push(ref);
    }
    
    for (const [type, refs] of Object.entries(byType)) {
      console.log(chalk.cyan(`\n[${type}] ${refs.length}件:`));
      
      // 最初の5件を表示
      const samples = refs.slice(0, 5);
      for (const ref of samples) {
        console.log(`  "${ref.text}"`);
        console.log(chalk.gray(`    → targetLaw: ${ref.targetLaw || 'なし'}`));
        console.log(chalk.gray(`    → confidence: ${ref.confidence}`));
        console.log(chalk.gray(`    → method: ${ref.resolutionMethod}`));
      }
      
      if (refs.length > 5) {
        console.log(chalk.gray(`  ...他${refs.length - 5}件`));
      }
    }
    
    // 解決策の提案
    console.log(chalk.yellow('\n💡 解決策の提案:'));
    
    for (const [type, refs] of Object.entries(byType)) {
      if (type === 'external' && refs.some(r => !r.targetLawId)) {
        console.log('\n1. 外部参照の法令IDマッピング欠落:');
        const uniqueLaws = new Set(refs.map(r => r.targetLaw).filter(Boolean));
        for (const law of uniqueLaws) {
          console.log(`   - "${law}" のIDをCOMPLETE_LAW_DICTIONARYに追加`);
        }
      }
      
      if (type === 'contextual') {
        console.log('\n2. 文脈依存参照の解決失敗:');
        console.log('   - 文脈追跡のスコープを拡大');
        console.log('   - 定義パターンの追加');
      }
      
      if (type === 'relative' && refs.some(r => !r.targetArticle)) {
        console.log('\n3. 相対参照の条文番号解決失敗:');
        console.log('   - 現在の条文番号の追跡精度向上');
        console.log('   - 項番号の管理強化');
      }
    }
  } else {
    console.log(chalk.green('\n✅ すべての参照が正常にマッピングされています！'));
  }
  
  // 全体の統計
  console.log(chalk.cyan('\n📊 全体統計:'));
  console.log(`総参照数: ${references.length}`);
  console.log(`マッピング成功: ${chalk.green(references.length - unmappedReferences.length)}`);
  console.log(`マッピング失敗: ${chalk.red(unmappedReferences.length)}`);
  console.log(`精度: ${chalk.yellow(((references.length - unmappedReferences.length) / references.length * 100).toFixed(1) + '%')}`);
}

// 実行
if (require.main === module) {
  analyzeUnmapped().catch(console.error);
}

export { analyzeUnmapped };