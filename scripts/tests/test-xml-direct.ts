#!/usr/bin/env npx tsx
/**
 * XMLファイル直接検証テスト
 * データベースを使わずにXMLファイルから直接参照を検出
 */

import { UltimateReferenceDetector } from './detector';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface XMLTestResult {
  fileName: string;
  lawTitle: string;
  articleCount: number;
  detectedReferences: number;
  uniqueReferences: number;
  referenceTypes: Record<string, number>;
  sampleReferences: Array<{
    type: string;
    text: string;
    confidence: number;
  }>;
  processingTime: number;
}

/**
 * XMLファイルから法令タイトルを抽出
 */
function extractLawTitle(xmlContent: string): string {
  const match = xmlContent.match(/<LawTitle>([^<]+)<\/LawTitle>/);
  return match ? match[1] : '不明な法令';
}

/**
 * XMLファイルから条文を抽出
 */
function extractArticles(xmlContent: string): Array<{ number: string; content: string }> {
  const articles: Array<{ number: string; content: string }> = [];
  
  // Article要素を抽出
  const articlePattern = /<Article\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g;
  let match;
  
  while ((match = articlePattern.exec(xmlContent)) !== null) {
    const articleNumber = match[1];
    const articleContent = match[2];
    
    // タグを除去してテキストのみ抽出
    const textContent = articleContent.replace(/<[^>]+>/g, ' ').trim();
    
    if (textContent) {
      articles.push({
        number: articleNumber,
        content: textContent
      });
    }
  }
  
  return articles;
}

/**
 * 単一のXMLファイルを解析
 */
async function analyzeXMLFile(filePath: string): Promise<XMLTestResult | null> {
  try {
    const startTime = Date.now();
    
    // XMLファイルを読み込み
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    
    // 法令タイトルと条文を抽出
    const lawTitle = extractLawTitle(xmlContent);
    const articles = extractArticles(xmlContent);
    
    if (articles.length === 0) {
      return null;
    }
    
    // 参照検出エンジンを初期化
    const detector = new UltimateReferenceDetector();
    const allReferences: any[] = [];
    const uniqueTexts = new Set<string>();
    const referenceTypes: Record<string, number> = {};
    
    // 各条文で参照を検出
    for (const article of articles) {
      const references = await detector.detectReferences(
        article.content,
        undefined,
        lawTitle,
        `第${article.number}条`
      );
      
      for (const ref of references) {
        allReferences.push(ref);
        uniqueTexts.add(ref.text);
        
        // タイプ別にカウント
        referenceTypes[ref.type] = (referenceTypes[ref.type] || 0) + 1;
      }
    }
    
    // サンプル参照（最初の10件）
    const sampleReferences = allReferences.slice(0, 10).map(ref => ({
      type: ref.type,
      text: ref.text,
      confidence: ref.confidence
    }));
    
    const processingTime = Date.now() - startTime;
    
    return {
      fileName: path.basename(filePath),
      lawTitle,
      articleCount: articles.length,
      detectedReferences: allReferences.length,
      uniqueReferences: uniqueTexts.size,
      referenceTypes,
      sampleReferences,
      processingTime
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
    return null;
  }
}

/**
 * メイン実行関数
 */
async function runXMLValidation(): Promise<void> {
  console.log(chalk.bold.cyan('\n=== XML直接検証テスト開始 ===\n'));
  
  try {
    // laws_dataディレクトリから主要な法令XMLを選択
    const lawsDir = path.join(process.cwd(), 'laws_data');
    
    // すべてのXMLファイルを取得
    const allFiles: string[] = [];
    
    function findXMLFiles(dir: string): void {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.')) {
          findXMLFiles(fullPath);
        } else if (item.endsWith('.xml')) {
          allFiles.push(fullPath);
        }
      }
    }
    
    findXMLFiles(lawsDir);
    
    // 主要法令を優先的に選択
    const priorityKeywords = [
      '民法', '刑法', '憲法', '商法', '会社法',
      '労働基準法', '民事訴訟法', '刑事訴訟法',
      '著作権法', '特許法', '独占禁止法'
    ];
    
    // ファイル名から主要法令を推測
    const priorityFiles: string[] = [];
    const otherFiles: string[] = [];
    
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const title = extractLawTitle(content);
      
      if (priorityKeywords.some(keyword => title.includes(keyword))) {
        priorityFiles.push(file);
      } else {
        otherFiles.push(file);
      }
      
      // 最大20ファイルまで
      if (priorityFiles.length >= 20) break;
    }
    
    // テスト対象ファイルを選択（優先ファイル + その他から補充）
    const targetFiles = [
      ...priorityFiles,
      ...otherFiles.slice(0, Math.max(0, 15 - priorityFiles.length))
    ].slice(0, 15);
    
    if (targetFiles.length === 0) {
      console.log(chalk.yellow('検証対象のXMLファイルが見つかりません。'));
      return;
    }
    
    console.log(chalk.green(`${targetFiles.length}個のXMLファイルを検証します。\n`));
    
    const results: XMLTestResult[] = [];
    let totalProcessingTime = 0;
    
    // 各ファイルを解析
    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      const fileName = path.basename(file);
      
      process.stdout.write(`\r処理中... [${i + 1}/${targetFiles.length}] ${fileName.padEnd(50)}`);
      
      const result = await analyzeXMLFile(file);
      if (result) {
        results.push(result);
        totalProcessingTime += result.processingTime;
      }
    }
    
    console.log('\n');
    console.log(chalk.bold('━'.repeat(80)));
    console.log(chalk.bold.cyan('検証結果'));
    console.log(chalk.bold('━'.repeat(80)));
    
    // 結果を表示
    console.log('\n【法令別検出結果】\n');
    
    for (const result of results) {
      const avgRefsPerArticle = result.articleCount > 0 
        ? (result.detectedReferences / result.articleCount).toFixed(1)
        : '0.0';
      
      console.log(chalk.bold(`📖 ${result.lawTitle}`));
      console.log(`   ファイル: ${result.fileName}`);
      console.log(`   条文数: ${result.articleCount}`);
      console.log(`   検出参照数: ${result.detectedReferences} (平均 ${avgRefsPerArticle}件/条)`);
      console.log(`   ユニーク参照: ${result.uniqueReferences}`);
      console.log(`   処理時間: ${result.processingTime}ms`);
      
      // 参照タイプの内訳
      if (Object.keys(result.referenceTypes).length > 0) {
        console.log('   参照タイプ:');
        for (const [type, count] of Object.entries(result.referenceTypes)) {
          const percentage = ((count / result.detectedReferences) * 100).toFixed(1);
          console.log(`     - ${type}: ${count}件 (${percentage}%)`);
        }
      }
      
      // サンプル参照
      if (result.sampleReferences.length > 0) {
        console.log('   サンプル参照:');
        for (const ref of result.sampleReferences.slice(0, 3)) {
          console.log(chalk.gray(`     [${ref.type}] ${ref.text} (${ref.confidence.toFixed(2)})`));
        }
      }
      
      console.log('');
    }
    
    // 統計サマリー
    console.log(chalk.bold('━'.repeat(80)));
    console.log(chalk.bold.cyan('統計サマリー'));
    console.log(chalk.bold('━'.repeat(80)));
    
    const totalArticles = results.reduce((sum, r) => sum + r.articleCount, 0);
    const totalRefs = results.reduce((sum, r) => sum + r.detectedReferences, 0);
    const totalUnique = results.reduce((sum, r) => sum + r.uniqueReferences, 0);
    
    console.log(`\n検証法令数: ${results.length}`);
    console.log(`総条文数: ${totalArticles}`);
    console.log(`総検出参照数: ${totalRefs}`);
    console.log(`総ユニーク参照数: ${totalUnique}`);
    console.log(`平均参照数/条文: ${(totalRefs / totalArticles).toFixed(2)}`);
    console.log(`平均処理時間: ${(totalProcessingTime / results.length).toFixed(0)}ms/法令`);
    
    // 参照タイプ別統計
    const allTypes: Record<string, number> = {};
    for (const result of results) {
      for (const [type, count] of Object.entries(result.referenceTypes)) {
        allTypes[type] = (allTypes[type] || 0) + count;
      }
    }
    
    console.log('\n【参照タイプ別統計】');
    const sortedTypes = Object.entries(allTypes).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      const percentage = ((count / totalRefs) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(count / totalRefs * 50));
      console.log(`${type.padEnd(15)} ${bar} ${count}件 (${percentage}%)`);
    }
    
    // パフォーマンス分析
    console.log('\n【パフォーマンス分析】');
    const avgTime = totalProcessingTime / results.length;
    const maxTime = Math.max(...results.map(r => r.processingTime));
    const minTime = Math.min(...results.map(r => r.processingTime));
    
    console.log(`平均処理時間: ${avgTime.toFixed(0)}ms`);
    console.log(`最速: ${minTime}ms`);
    console.log(`最遅: ${maxTime}ms`);
    
    // 高密度参照法令（参照が多い法令）
    const highDensityLaws = results
      .filter(r => r.articleCount > 0)
      .sort((a, b) => (b.detectedReferences / b.articleCount) - (a.detectedReferences / a.articleCount))
      .slice(0, 5);
    
    console.log('\n【参照密度TOP5】');
    for (const law of highDensityLaws) {
      const density = (law.detectedReferences / law.articleCount).toFixed(2);
      console.log(`  ${law.lawTitle}: ${density}件/条`);
    }
    
    // 結果をJSONファイルに保存
    const outputPath = path.join(process.cwd(), 'Report', 'xml_direct_validation_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 詳細結果を保存: ${outputPath}`);
    
    // 評価
    console.log('\n' + chalk.bold('━'.repeat(80)));
    console.log(chalk.bold.cyan('評価'));
    console.log(chalk.bold('━'.repeat(80)));
    
    const avgRefsPerArticle = totalRefs / totalArticles;
    if (avgRefsPerArticle >= 1.0) {
      console.log(chalk.green('\n✅ 優秀: 平均1条文あたり1件以上の参照を検出しています。'));
    } else if (avgRefsPerArticle >= 0.5) {
      console.log(chalk.yellow('\n⚠️ 良好: 適切な参照検出率ですが、改善の余地があります。'));
    } else {
      console.log(chalk.red('\n❌ 要改善: 参照検出率が低い可能性があります。'));
    }
    
  } catch (error) {
    console.error(chalk.red('\nエラーが発生しました:'), error);
  }
}

// メイン実行
if (require.main === module) {
  runXMLValidation().catch(console.error);
}

export { runXMLValidation };