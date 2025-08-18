#!/usr/bin/env tsx

/**
 * EnhancedReferenceDetectorV40 精度検証スクリプト
 * 略称辞書と文脈追跡機能の効果測定
 */

import { EnhancedReferenceDetectorV40 } from '../src/domain/services/EnhancedReferenceDetectorV40';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';
import { abbreviationDictionary } from '../src/lib/abbreviation-dictionary';
import { readFileSync, existsSync } from 'fs';
import { JSDOM } from 'jsdom';

interface TestResult {
  testCase: string;
  v37Count: number;
  v40Count: number;
  improvement: number;
  newDetections: string[];
  abbreviationsExpanded: number;
  contextResolved: number;
  indirectDetected: number;
}

class V40DetectorTester {
  private detectorV40: EnhancedReferenceDetectorV40;
  private detectorV37: EnhancedReferenceDetectorV37;
  
  constructor() {
    this.detectorV40 = new EnhancedReferenceDetectorV40();
    this.detectorV37 = new EnhancedReferenceDetectorV37();
  }
  
  /**
   * 失敗パターンでのテスト
   */
  testFailurePatterns(): void {
    console.log('='.repeat(80));
    console.log('📊 EnhancedReferenceDetector v4.0.0 精度検証');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log(`v3.7.0 vs v4.0.0 比較\n`);
    
    // 失敗パターンテストケース
    const failurePatterns = [
      {
        category: '略称展開',
        cases: [
          {
            text: '民訴第二百四十八条の規定により損害額を認定する場合において、特許法第百五条の三の規定を準用する。',
            expected: ['民事訴訟法第二百四十八条', '特許法第百五条の三']
          },
          {
            text: '会社法上の大会社については、金商法の規定を適用する。',
            expected: ['会社法', '金融商品取引法']
          },
          {
            text: '独禁法第三条の規定に違反する行為については、下請法の適用を妨げない。',
            expected: ['私的独占の禁止及び公正取引の確保に関する法律第三条', '下請代金支払遅延等防止法']
          },
          {
            text: '刑訴第三百条及び民執法第二十条の規定に基づき、破産法による手続きを開始する。',
            expected: ['刑事訴訟法第三百条', '民事執行法第二十条', '破産法']
          },
          {
            text: '労基法第三十六条に基づく協定（以下「三六協定」という。）については、労組法の適用を受ける。',
            expected: ['労働基準法第三十六条', '労働組合法']
          }
        ]
      },
      {
        category: '文脈依存参照',
        cases: [
          {
            text: '前項の規定により届出をした者は、同項第二号に掲げる事項に変更があったときは、遅滞なく、その旨を届け出なければならない。',
            currentArticle: '第十条',
            expected: ['前項', '同項第二号']
          },
          {
            text: '前三条の規定は、次章に定める特例については、適用しない。',
            currentArticle: '第八条',
            expected: ['第五条から第七条まで', '次章']
          },
          {
            text: '本条の規定は、前条第一項各号に掲げる場合には、これを適用しない。',
            currentArticle: '第十五条',
            expected: ['第十五条', '第十四条第一項各号']
          }
        ]
      },
      {
        category: '間接参照',
        cases: [
          {
            text: '関係法令の定めるところにより、主務大臣が別に定める基準に従って認定を行う。',
            expected: ['関係法令', '主務大臣', '別に定める基準']
          },
          {
            text: '他の法律に特別の定めがある場合を除くほか、この法律の定めるところによる。',
            expected: ['他の法律', 'この法律']
          },
          {
            text: '法令の規定により又は慣習法上、正当な権限を有する者が行った行為については、罰しない。',
            expected: ['法令の規定', '慣習法']
          }
        ]
      }
    ];
    
    const results: TestResult[] = [];
    
    // カテゴリごとにテスト
    failurePatterns.forEach(category => {
      console.log(`\n### ${category.category}`);
      console.log('─'.repeat(60));
      
      category.cases.forEach((testCase, index) => {
        const result = this.compareDetection(
          testCase.text,
          testCase.currentArticle,
          `${category.category} #${index + 1}`
        );
        
        results.push(result);
        
        // 結果表示
        const icon = result.improvement > 0 ? '✅' : result.improvement === 0 ? '➖' : '❌';
        console.log(`  ${icon} テスト #${index + 1}:`);
        console.log(`     v3.7: ${result.v37Count}件 → v4.0: ${result.v40Count}件 (${result.improvement >= 0 ? '+' : ''}${result.improvement}件)`);
        
        if (result.abbreviationsExpanded > 0) {
          console.log(`     📚 略称展開: ${result.abbreviationsExpanded}件`);
        }
        if (result.contextResolved > 0) {
          console.log(`     🔗 文脈解決: ${result.contextResolved}件`);
        }
        if (result.indirectDetected > 0) {
          console.log(`     🔍 間接参照: ${result.indirectDetected}件`);
        }
        
        if (result.newDetections.length > 0) {
          console.log(`     新規検出:`, result.newDetections.slice(0, 3).join(', '));
        }
      });
    });
    
    // 統計サマリー
    this.printSummary(results);
  }
  
  /**
   * 実法令データでのテスト
   */
  async testRealLawData(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('📚 実法令データでの検証');
    console.log('='.repeat(80));
    
    const testLaws = [
      { id: '129AC0000000089', name: '民法', testArticles: 3 },
      { id: '132AC0000000048', name: '商法', testArticles: 3 },
      { id: '140AC0000000045', name: '刑法', testArticles: 3 },
      { id: '322AC0000000049', name: '労働基準法', testArticles: 3 }
    ];
    
    for (const law of testLaws) {
      const xmlPath = `/home/coffee/projects/LawFinder/laws_data/sample/${law.id}.xml`;
      
      if (!existsSync(xmlPath)) {
        console.log(`⚠️ ${law.name}のXMLファイルが見つかりません: ${xmlPath}`);
        continue;
      }
      
      console.log(`\n### ${law.name}`);
      console.log('─'.repeat(60));
      
      try {
        const xmlContent = readFileSync(xmlPath, 'utf-8');
        const dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
        const document = dom.window.document;
        
        // 条文を取得
        const articles = Array.from(document.querySelectorAll('Article'))
          .slice(0, law.testArticles);
        
        let totalV37 = 0;
        let totalV40 = 0;
        let totalAbbreviations = 0;
        let totalContext = 0;
        
        articles.forEach((article, index) => {
          const articleNum = article.getAttribute('Num') || `第${index + 1}条`;
          const articleContent = article.textContent || '';
          
          // v3.7とv4.0で検出
          const refsV37 = this.detectorV37.detectReferences(articleContent);
          const refsV40 = this.detectorV40.detectReferences(articleContent, articleNum);
          
          totalV37 += refsV37.length;
          totalV40 += refsV40.length;
          
          // v4.0の新機能をカウント
          refsV40.forEach(ref => {
            if (ref.metadata?.expandedFrom) totalAbbreviations++;
            if (ref.metadata?.relativeType) totalContext++;
          });
          
          if (refsV40.length > refsV37.length) {
            console.log(`  📈 ${articleNum}: ${refsV37.length} → ${refsV40.length} (+${refsV40.length - refsV37.length})`);
          }
        });
        
        console.log(`  合計: v3.7=${totalV37}件, v4.0=${totalV40}件`);
        console.log(`  改善: ${totalV40 - totalV37 >= 0 ? '+' : ''}${totalV40 - totalV37}件 (${((totalV40 / totalV37 - 1) * 100).toFixed(1)}%)`);
        
        if (totalAbbreviations > 0) {
          console.log(`  略称展開: ${totalAbbreviations}件`);
        }
        if (totalContext > 0) {
          console.log(`  文脈解決: ${totalContext}件`);
        }
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error.message}`);
      }
    }
  }
  
  /**
   * 検出結果の比較
   */
  private compareDetection(text: string, currentArticle: string | undefined, testCase: string): TestResult {
    // v3.7で検出
    const refsV37 = this.detectorV37.detectReferences(text, currentArticle);
    
    // v4.0で検出
    const refsV40 = this.detectorV40.detectReferences(text, currentArticle);
    
    // 新規検出を特定
    const v37Texts = new Set(refsV37.map(r => r.sourceText));
    const newDetections = refsV40
      .filter(r => !v37Texts.has(r.sourceText))
      .map(r => r.sourceText);
    
    // カテゴリ別カウント
    let abbreviationsExpanded = 0;
    let contextResolved = 0;
    let indirectDetected = 0;
    
    refsV40.forEach(ref => {
      if (ref.metadata?.expandedFrom) abbreviationsExpanded++;
      if (ref.metadata?.relativeType) contextResolved++;
      if (ref.metadata?.indirectType) indirectDetected++;
    });
    
    return {
      testCase,
      v37Count: refsV37.length,
      v40Count: refsV40.length,
      improvement: refsV40.length - refsV37.length,
      newDetections,
      abbreviationsExpanded,
      contextResolved,
      indirectDetected
    };
  }
  
  /**
   * サマリー出力
   */
  private printSummary(results: TestResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 総合結果サマリー');
    console.log('='.repeat(80));
    
    const totalV37 = results.reduce((sum, r) => sum + r.v37Count, 0);
    const totalV40 = results.reduce((sum, r) => sum + r.v40Count, 0);
    const totalImprovement = totalV40 - totalV37;
    const improvementRate = totalV37 > 0 ? ((totalV40 / totalV37 - 1) * 100) : 0;
    
    const totalAbbreviations = results.reduce((sum, r) => sum + r.abbreviationsExpanded, 0);
    const totalContext = results.reduce((sum, r) => sum + r.contextResolved, 0);
    const totalIndirect = results.reduce((sum, r) => sum + r.indirectDetected, 0);
    
    console.log('\n### 検出数比較');
    console.log(`  v3.7.0: ${totalV37}件`);
    console.log(`  v4.0.0: ${totalV40}件`);
    console.log(`  改善数: ${totalImprovement >= 0 ? '+' : ''}${totalImprovement}件`);
    console.log(`  改善率: ${improvementRate >= 0 ? '+' : ''}${improvementRate.toFixed(1)}%`);
    
    console.log('\n### v4.0.0 新機能の貢献');
    console.log(`  📚 略称辞書展開: ${totalAbbreviations}件`);
    console.log(`  🔗 文脈依存解決: ${totalContext}件`);
    console.log(`  🔍 間接参照検出: ${totalIndirect}件`);
    
    console.log('\n### 略称辞書統計');
    const dictStats = abbreviationDictionary.getStatistics();
    console.log(`  総エントリ数: ${dictStats.totalEntries}件`);
    console.log(`  カテゴリ別:`);
    Object.entries(dictStats.byCategory).forEach(([category, count]) => {
      console.log(`    - ${category}: ${count}件`);
    });
    console.log(`  法令番号付き: ${dictStats.withLawNumbers}件`);
    console.log(`  エイリアス付き: ${dictStats.withAliases}件`);
    
    // 評価
    console.log('\n### 評価');
    if (improvementRate >= 10) {
      console.log('🎉 **大幅な精度向上を達成！（+10%以上）**');
    } else if (improvementRate >= 5) {
      console.log('✅ **有意な精度向上（+5-10%）**');
    } else if (improvementRate > 0) {
      console.log('⚠️ **軽微な改善（+5%未満）**');
    } else {
      console.log('❌ **改善効果なし**');
    }
    
    // 推奨事項
    console.log('\n### 推奨事項');
    if (totalAbbreviations > totalContext && totalAbbreviations > totalIndirect) {
      console.log('✅ 略称辞書が最も効果的 - 辞書の継続的な拡充を推奨');
    }
    if (totalContext < 5) {
      console.log('⚠️ 文脈依存解決がまだ限定的 - アルゴリズムの改善余地あり');
    }
    if (totalIndirect < 5) {
      console.log('⚠️ 間接参照検出が限定的 - パターンの追加を検討');
    }
  }
}

// メイン実行
async function main() {
  const tester = new V40DetectorTester();
  
  // 失敗パターンのテスト
  tester.testFailurePatterns();
  
  // 実法令データのテスト
  await tester.testRealLawData();
}

main().catch(console.error);