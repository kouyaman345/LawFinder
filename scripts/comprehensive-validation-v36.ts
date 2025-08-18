#!/usr/bin/env tsx

/**
 * v3.6.0 包括的検証スクリプト
 * 実際の法令XMLデータを使用した大規模検証
 */

import { EnhancedReferenceDetectorV36 } from '../src/domain/services/EnhancedReferenceDetectorV36';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  lawType: string;
  totalArticles: number;
  totalReferences: number;
  referenceTypes: Record<string, number>;
  detectionDetails: {
    internal: number;
    external: number;
    relative: number;
    range: number;
    multiple: number;
    application: number;
  };
  lawTypeReferences: Record<string, number>;
  sampleReferences: string[];
}

class ComprehensiveValidator {
  private detector: EnhancedReferenceDetectorV36;
  private results: ValidationResult[] = [];
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV36();
  }
  
  /**
   * 法令IDから法令種別を判定
   */
  private classifyLawType(lawId: string): string {
    // 法令IDのパターンから種別を判定
    if (lawId.includes('CONSTITUTION')) return '憲法';
    if (lawId.startsWith('1') || lawId.startsWith('2')) return '法律';
    if (lawId.startsWith('3')) return '法律/政令';
    if (lawId.startsWith('4')) return '法律/政令';
    if (lawId.startsWith('M')) return '省令';
    if (lawId.startsWith('CO')) return '政令';
    if (lawId.includes('RULE')) return '規則';
    return '法律'; // デフォルト
  }
  
  /**
   * 単一法令の検証
   */
  private async validateLaw(xmlPath: string): Promise<ValidationResult | null> {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const result = await parseStringPromise(xmlContent);
      
      if (!result.Law) return null;
      
      const law = result.Law;
      const lawId = path.basename(path.dirname(xmlPath));
      const lawTitle = law.LawTitle?.[0] || '不明';
      const lawType = this.classifyLawType(lawId);
      
      let totalArticles = 0;
      let totalReferences = 0;
      const referenceTypes: Record<string, number> = {};
      const detectionDetails = {
        internal: 0,
        external: 0,
        relative: 0,
        range: 0,
        multiple: 0,
        application: 0
      };
      const lawTypeReferences: Record<string, number> = {};
      const sampleReferences: string[] = [];
      
      // 条文を探索
      const processArticle = (article: any, articleNum?: string) => {
        if (!article) return;
        
        totalArticles++;
        
        // 条文テキストを取得
        let articleText = '';
        
        // 項を処理
        if (article.Paragraph) {
          for (const para of article.Paragraph) {
            if (para.ParagraphSentence) {
              for (const sentence of para.ParagraphSentence) {
                if (sentence.Sentence) {
                  articleText += sentence.Sentence.join(' ');
                }
              }
            }
          }
        }
        
        if (articleText) {
          // 参照検出
          const refs = this.detector.detectReferences(articleText, articleNum);
          
          for (const ref of refs) {
            totalReferences++;
            
            // タイプ別集計
            if (!referenceTypes[ref.type]) {
              referenceTypes[ref.type] = 0;
            }
            referenceTypes[ref.type]++;
            
            // 詳細集計
            if (ref.type === 'internal') detectionDetails.internal++;
            else if (ref.type === 'external') detectionDetails.external++;
            else if (ref.type === 'relative') detectionDetails.relative++;
            else if (ref.type === 'range') detectionDetails.range++;
            else if (ref.type === 'multiple') detectionDetails.multiple++;
            else if (ref.type === 'application') detectionDetails.application++;
            
            // 法令種別の参照を集計
            if (ref.metadata?.lawType) {
              if (!lawTypeReferences[ref.metadata.lawType]) {
                lawTypeReferences[ref.metadata.lawType] = 0;
              }
              lawTypeReferences[ref.metadata.lawType]++;
            }
            
            // サンプル収集（最初の10個）
            if (sampleReferences.length < 10 && ref.type === 'external') {
              sampleReferences.push(`${ref.targetLaw || ref.sourceText}`);
            }
          }
        }
      };
      
      // 本則の条文を処理
      if (law.LawBody?.[0]?.MainProvision?.[0]) {
        const mainProvision = law.LawBody[0].MainProvision[0];
        
        // 章を処理
        if (mainProvision.Chapter) {
          for (const chapter of mainProvision.Chapter) {
            if (chapter.Article) {
              for (const article of chapter.Article) {
                const articleNum = article.ArticleTitle?.[0]?.match(/第([一二三四五六七八九十百千万\d]+)条/)?.[0];
                processArticle(article, articleNum);
              }
            }
          }
        }
        
        // 章がない場合は直接条文を処理
        if (mainProvision.Article) {
          for (const article of mainProvision.Article) {
            const articleNum = article.ArticleTitle?.[0]?.match(/第([一二三四五六七八九十百千万\d]+)条/)?.[0];
            processArticle(article, articleNum);
          }
        }
      }
      
      return {
        lawId,
        lawTitle,
        lawType,
        totalArticles,
        totalReferences,
        referenceTypes,
        detectionDetails,
        lawTypeReferences,
        sampleReferences
      };
      
    } catch (error) {
      console.error(`Error processing ${xmlPath}:`, error);
      return null;
    }
  }
  
  /**
   * 複数法令の検証を実行
   */
  async validateMultipleLaws(limit: number = 30) {
    console.log('='.repeat(80));
    console.log('v3.6.0 包括的検証レポート - 実法令データでの大規模検証');
    console.log('='.repeat(80));
    console.log(`検証日時: ${new Date().toISOString()}`);
    console.log();
    
    const lawsDataDir = path.join(process.cwd(), 'laws_data');
    
    // 様々な法令種別を選択
    const targetLaws = [
      // 憲法
      '321CONSTITUTION',
      
      // 基本法律
      '129AC0000000089', // 民法
      '132AC0000000048', // 商法
      '140AC0000000045', // 刑法
      '322AC0000000049', // 労働基準法
      
      // 行政法
      '405AC0000000088', // 行政手続法
      '322AC0000000067', // 地方自治法
      
      // 知的財産法
      '334AC0000000121', // 特許法
      '345AC0000000048', // 著作権法
      
      // 税法
      '340AC0000000033', // 所得税法
      '363AC0000000108', // 消費税法
      
      // その他
      '415AC0000000057', // 個人情報保護法
      '416AC0000000075', // 破産法
    ];
    
    // 追加でランダムに法令を選択
    const allDirs = fs.readdirSync(lawsDataDir)
      .filter(dir => fs.statSync(path.join(lawsDataDir, dir)).isDirectory())
      .filter(dir => !dir.startsWith('.') && dir !== 'sample');
    
    // ランダムに追加選択
    const additionalLaws = allDirs
      .filter(dir => !targetLaws.includes(dir.split('_')[0]))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(0, limit - targetLaws.length));
    
    const lawsToValidate = [...targetLaws, ...additionalLaws].slice(0, limit);
    
    console.log(`検証対象法令数: ${lawsToValidate.length}`);
    console.log();
    
    // 各法令を検証
    for (const lawDirPrefix of lawsToValidate) {
      // 該当するディレクトリを探す
      const lawDir = allDirs.find(dir => dir.startsWith(lawDirPrefix));
      if (!lawDir) continue;
      
      const lawPath = path.join(lawsDataDir, lawDir);
      const xmlFiles = fs.readdirSync(lawPath).filter(f => f.endsWith('.xml'));
      
      if (xmlFiles.length > 0) {
        const xmlPath = path.join(lawPath, xmlFiles[0]);
        const result = await this.validateLaw(xmlPath);
        
        if (result) {
          this.results.push(result);
          console.log(`✓ ${result.lawTitle} (${result.totalArticles}条, ${result.totalReferences}参照)`);
        }
      }
    }
    
    // 統計分析
    this.analyzeResults();
  }
  
  /**
   * 結果の分析と表示
   */
  private analyzeResults() {
    console.log();
    console.log('## 全体統計');
    console.log();
    
    const totalLaws = this.results.length;
    const totalArticles = this.results.reduce((sum, r) => sum + r.totalArticles, 0);
    const totalReferences = this.results.reduce((sum, r) => sum + r.totalReferences, 0);
    
    console.log(`| 項目 | 値 |`);
    console.log(`|------|-----|`);
    console.log(`| 検証法令数 | ${totalLaws} |`);
    console.log(`| 総条文数 | ${totalArticles} |`);
    console.log(`| 総参照数 | ${totalReferences} |`);
    console.log(`| 平均参照数/法令 | ${(totalReferences / totalLaws).toFixed(1)} |`);
    console.log(`| 平均参照数/条文 | ${(totalReferences / totalArticles).toFixed(2)} |`);
    console.log();
    
    // 参照タイプ別統計
    console.log('## 参照タイプ別統計');
    console.log();
    
    const typeStats: Record<string, number> = {};
    for (const result of this.results) {
      for (const [type, count] of Object.entries(result.referenceTypes)) {
        if (!typeStats[type]) typeStats[type] = 0;
        typeStats[type] += count;
      }
    }
    
    console.log(`| 参照タイプ | 検出数 | 割合 |`);
    console.log(`|-----------|--------|------|`);
    
    const sortedTypes = Object.entries(typeStats).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      const percentage = ((count / totalReferences) * 100).toFixed(1);
      console.log(`| ${type} | ${count} | ${percentage}% |`);
    }
    console.log();
    
    // 法令種別の参照統計
    console.log('## 検出された法令種別参照');
    console.log();
    
    const lawTypeStats: Record<string, number> = {};
    for (const result of this.results) {
      for (const [type, count] of Object.entries(result.lawTypeReferences)) {
        if (!lawTypeStats[type]) lawTypeStats[type] = 0;
        lawTypeStats[type] += count;
      }
    }
    
    if (Object.keys(lawTypeStats).length > 0) {
      console.log(`| 法令種別 | 検出数 |`);
      console.log(`|---------|--------|`);
      
      const sortedLawTypes = Object.entries(lawTypeStats).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sortedLawTypes) {
        console.log(`| ${type} | ${count} |`);
      }
      console.log();
    }
    
    // 参照が多い法令TOP5
    console.log('## 参照数が多い法令 TOP5');
    console.log();
    
    const topLaws = this.results
      .sort((a, b) => b.totalReferences - a.totalReferences)
      .slice(0, 5);
    
    console.log(`| 順位 | 法令名 | 条文数 | 参照数 | 参照/条文 |`);
    console.log(`|------|--------|--------|--------|-----------|`);
    
    for (let i = 0; i < topLaws.length; i++) {
      const law = topLaws[i];
      const refPerArticle = (law.totalReferences / law.totalArticles).toFixed(2);
      console.log(`| ${i + 1} | ${law.lawTitle.substring(0, 20)} | ${law.totalArticles} | ${law.totalReferences} | ${refPerArticle} |`);
    }
    console.log();
    
    // 外部参照のサンプル
    console.log('## 検出された外部参照の例');
    console.log();
    
    const externalSamples = new Set<string>();
    for (const result of this.results) {
      for (const sample of result.sampleReferences) {
        externalSamples.add(sample);
        if (externalSamples.size >= 20) break;
      }
      if (externalSamples.size >= 20) break;
    }
    
    let sampleCount = 0;
    for (const sample of externalSamples) {
      console.log(`- ${sample}`);
      sampleCount++;
      if (sampleCount >= 10) break;
    }
    console.log();
    
    // 品質指標
    console.log('## 品質指標');
    console.log();
    
    const avgRefPerArticle = totalReferences / totalArticles;
    const hasExternalRefs = this.results.filter(r => r.detectionDetails.external > 0).length;
    const hasRangeRefs = this.results.filter(r => r.detectionDetails.range > 0).length;
    const hasApplicationRefs = this.results.filter(r => r.detectionDetails.application > 0).length;
    
    console.log(`| 指標 | 値 | 評価 |`);
    console.log(`|------|-----|------|`);
    console.log(`| 平均参照密度 | ${avgRefPerArticle.toFixed(2)} | ${avgRefPerArticle > 0.5 ? '✅ 良好' : '⚠️ 要確認'} |`);
    console.log(`| 外部参照検出率 | ${((hasExternalRefs / totalLaws) * 100).toFixed(0)}% | ${hasExternalRefs > totalLaws * 0.3 ? '✅ 良好' : '⚠️ 要確認'} |`);
    console.log(`| 範囲参照検出率 | ${((hasRangeRefs / totalLaws) * 100).toFixed(0)}% | ${hasRangeRefs > 0 ? '✅ 検出' : '❌ 未検出'} |`);
    console.log(`| 準用参照検出率 | ${((hasApplicationRefs / totalLaws) * 100).toFixed(0)}% | ${hasApplicationRefs > 0 ? '✅ 検出' : '❌ 未検出'} |`);
    
    // 結果をJSON形式で保存
    const report = {
      version: 'v3.6.0',
      date: new Date().toISOString(),
      summary: {
        totalLaws,
        totalArticles,
        totalReferences,
        avgReferencesPerLaw: totalReferences / totalLaws,
        avgReferencesPerArticle: avgRefPerArticle
      },
      typeStatistics: typeStats,
      lawTypeStatistics: lawTypeStats,
      topLaws: topLaws.map(l => ({
        title: l.lawTitle,
        articles: l.totalArticles,
        references: l.totalReferences
      })),
      qualityMetrics: {
        externalRefDetectionRate: (hasExternalRefs / totalLaws) * 100,
        rangeRefDetectionRate: (hasRangeRefs / totalLaws) * 100,
        applicationRefDetectionRate: (hasApplicationRefs / totalLaws) * 100
      },
      details: this.results
    };
    
    fs.writeFileSync(
      path.join(process.cwd(), 'comprehensive-validation-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log();
    console.log('詳細レポートを comprehensive-validation-report.json に保存しました');
  }
}

// 実行
const validator = new ComprehensiveValidator();
validator.validateMultipleLaws(30).catch(console.error);