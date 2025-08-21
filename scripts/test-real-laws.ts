#!/usr/bin/env npx tsx

/**
 * 実データでの大規模検証テスト
 * 実際の法令データを使用して参照検出の精度を検証
 */

import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { UltimateReferenceDetector } from './detector';

// テスト対象の法令（重要かつ参照が多い法令）
const testLaws = [
  { id: '129AC0000000089', name: '民法', expectedMinRefs: 100 },
  { id: '132AC0000000048', name: '商法', expectedMinRefs: 80 },
  { id: '417AC0000000086', name: '会社法', expectedMinRefs: 150 },
  { id: '322AC0000000049', name: '労働基準法', expectedMinRefs: 50 },
  { id: '140AC0000000045', name: '刑法', expectedMinRefs: 60 },
];

async function testRealLaws() {
  console.log(chalk.blue('=== 実データでの大規模検証テスト ===\n'));
  
  const detector = new UltimateReferenceDetector();
  const results: any[] = [];
  let totalRefs = 0;
  let totalTime = 0;
  
  for (const law of testLaws) {
    console.log(chalk.cyan(`\n${law.name}（${law.id}）の検証`));
    console.log('─'.repeat(50));
    
    try {
      // 法令XMLファイルのパスを構築
      const samplePath = path.join('laws_data', 'sample', `${law.id}.xml`);
      
      // ファイル存在確認
      let xmlContent: string;
      try {
        xmlContent = await fs.readFile(samplePath, 'utf-8');
      } catch (error) {
        console.log(chalk.yellow(`  ⚠️ サンプルファイルが見つかりません: ${samplePath}`));
        console.log(chalk.gray('  実際のデータディレクトリから検索中...'));
        
        // 実際のデータディレクトリから検索
        const lawsDataDir = 'laws_data';
        const dirs = await fs.readdir(lawsDataDir);
        const lawDir = dirs.find(d => d.startsWith(law.id));
        
        if (!lawDir) {
          console.log(chalk.red(`  ❌ 法令データが見つかりません`));
          continue;
        }
        
        const actualPath = path.join(lawsDataDir, lawDir, `${lawDir}.xml`);
        xmlContent = await fs.readFile(actualPath, 'utf-8');
      }
      
      // テキスト抽出（Sentenceタグから本文を抽出）
      const textMatches = xmlContent.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      if (!textMatches) {
        console.log(chalk.yellow('  ⚠️ 本文が抽出できませんでした'));
        continue;
      }
      
      // 各文章から参照を検出
      const startTime = Date.now();
      let lawRefs: any[] = [];
      let processedSentences = 0;
      const maxSentences = 100; // パフォーマンスのため最初の100文に制限
      
      for (const match of textMatches.slice(0, maxSentences)) {
        const sentence = match.replace(/<[^>]+>/g, '');
        const refs = await detector.detectReferences(sentence);
        if (refs.length > 0) {
          lawRefs.push(...refs);
          processedSentences++;
        }
      }
      
      const elapsedTime = Date.now() - startTime;
      totalTime += elapsedTime;
      totalRefs += lawRefs.length;
      
      // 結果の集計
      const refTypes = lawRefs.reduce((acc, ref) => {
        acc[ref.type] = (acc[ref.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // 結果表示
      console.log(`  処理文数: ${processedSentences}/${Math.min(textMatches.length, maxSentences)}`);
      console.log(`  検出参照数: ${lawRefs.length}`);
      console.log(`  処理時間: ${elapsedTime}ms`);
      
      const success = lawRefs.length >= law.expectedMinRefs;
      const icon = success ? '✅' : '⚠️';
      console.log(`  ${icon} 期待最小値: ${law.expectedMinRefs}件`);
      
      // 参照タイプ別の内訳
      console.log('\n  参照タイプ別内訳:');
      Object.entries(refTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}件`);
      });
      
      // 信頼度分布
      const confidenceRanges = {
        '0.9-1.0': 0,
        '0.8-0.9': 0,
        '0.7-0.8': 0,
        '0.6-0.7': 0,
        '< 0.6': 0
      };
      
      lawRefs.forEach(ref => {
        if (ref.confidence >= 0.9) confidenceRanges['0.9-1.0']++;
        else if (ref.confidence >= 0.8) confidenceRanges['0.8-0.9']++;
        else if (ref.confidence >= 0.7) confidenceRanges['0.7-0.8']++;
        else if (ref.confidence >= 0.6) confidenceRanges['0.6-0.7']++;
        else confidenceRanges['< 0.6']++;
      });
      
      console.log('\n  信頼度分布:');
      Object.entries(confidenceRanges).forEach(([range, count]) => {
        if (count > 0) {
          console.log(`    ${range}: ${count}件 (${(count/lawRefs.length*100).toFixed(1)}%)`);
        }
      });
      
      // サンプル表示
      if (lawRefs.length > 0) {
        console.log('\n  検出例（最初の5件）:');
        lawRefs.slice(0, 5).forEach((ref, i) => {
          console.log(`    ${i + 1}. [${ref.type}] ${ref.text} (信頼度: ${ref.confidence})`);
        });
      }
      
      results.push({
        lawId: law.id,
        lawName: law.name,
        processedSentences,
        totalSentences: Math.min(textMatches.length, maxSentences),
        detectedRefs: lawRefs.length,
        expectedMinRefs: law.expectedMinRefs,
        success,
        processingTime: elapsedTime,
        refTypes,
        confidenceDistribution: confidenceRanges
      });
      
    } catch (error) {
      console.log(chalk.red(`  ❌ エラー: ${error}`));
      results.push({
        lawId: law.id,
        lawName: law.name,
        error: String(error)
      });
    }
  }
  
  // 全体サマリー
  console.log(chalk.yellow('\n\n=== 全体サマリー ===\n'));
  
  const successfulTests = results.filter(r => !r.error);
  const totalSuccess = successfulTests.filter(r => r.success).length;
  
  console.log(`テスト法令数: ${testLaws.length}`);
  console.log(`成功: ${totalSuccess}/${successfulTests.length}`);
  console.log(`総検出参照数: ${totalRefs}`);
  console.log(`平均処理時間: ${(totalTime / successfulTests.length).toFixed(0)}ms/法令`);
  
  // パフォーマンス評価
  const avgRefsPerLaw = totalRefs / successfulTests.length;
  console.log(`平均参照数: ${avgRefsPerLaw.toFixed(1)}件/法令`);
  
  // 結果をJSONに保存
  const reportPath = 'Report/real_laws_test_result.json';
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(chalk.gray(`\n結果を保存: ${reportPath}`));
  
  return results;
}

// メイン実行
testRealLaws().catch(console.error);