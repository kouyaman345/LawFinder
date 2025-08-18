#!/usr/bin/env npx tsx
/**
 * 多様な法令種別での参照検出検証ツール
 * 
 * 憲法・法律・政令・省令・規則等を含む
 * 幅広い法令種別での参照検出精度を検証
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseString } from 'xml2js';
import { EnhancedReferenceDetectorV34 } from '../src/domain/services/EnhancedReferenceDetectorV34';
import { EnhancedReferenceDetectorV33 } from '../src/domain/services/EnhancedReferenceDetectorV33';
import chalk from 'chalk';
import ora from 'ora';

interface LawTypeInfo {
  type: string;
  name: string;
  pattern: RegExp;
  examples: string[];
}

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  lawType: string;
  totalArticles: number;
  totalReferences: number;
  referencesByType: { [key: string]: number };
  simpleReferences: number;
  complexReferences: number;
  detectionRate: number;
  improvements: {
    v33: number;
    v34: number;
    improvement: number;
  };
}

/**
 * 法令種別の分類
 */
class LawTypeClassifier {
  private lawTypes: LawTypeInfo[] = [
    {
      type: '憲法',
      name: 'Constitution',
      pattern: /CONSTITUTION/,
      examples: ['日本国憲法']
    },
    {
      type: '法律',
      name: 'Act',
      pattern: /AC\d{10}/,
      examples: ['民法', '刑法', '商法']
    },
    {
      type: '政令',
      name: 'Cabinet Order',
      pattern: /CO\d{10}/,
      examples: ['○○法施行令']
    },
    {
      type: '省令',
      name: 'Ministerial Ordinance',
      pattern: /M\d{11}/,
      examples: ['○○法施行規則', '○○省令']
    },
    {
      type: '規則',
      name: 'Rule',
      pattern: /Rule|規則/,
      examples: ['最高裁判所規則']
    },
    {
      type: '条例',
      name: 'Ordinance',
      pattern: /条例/,
      examples: ['○○市条例']
    }
  ];
  
  /**
   * 法令IDから法令種別を判定
   */
  classifyByLawId(lawId: string): string {
    for (const lawType of this.lawTypes) {
      if (lawType.pattern.test(lawId)) {
        return lawType.type;
      }
    }
    return '不明';
  }
  
  /**
   * 法令名から法令種別を判定
   */
  classifyByLawName(lawName: string): string {
    if (lawName.includes('憲法')) return '憲法';
    if (lawName.includes('法律') || lawName.endsWith('法')) return '法律';
    if (lawName.includes('政令') || lawName.includes('施行令')) return '政令';
    if (lawName.includes('省令') || lawName.includes('施行規則')) return '省令';
    if (lawName.includes('規則')) return '規則';
    if (lawName.includes('条例')) return '条例';
    return '不明';
  }
}

/**
 * 法令XMLパーサー（簡略版）
 */
class SimpleLawParser {
  async parseLaw(xmlPath: string): Promise<any> {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const lawId = path.basename(path.dirname(xmlPath));
      
      // 簡易的な条文数カウント
      const articleMatches = xmlContent.match(/<Article[^>]*>/g) || [];
      const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
      
      return {
        lawId,
        lawTitle: titleMatch ? titleMatch[1] : path.basename(xmlPath),
        totalArticles: articleMatches.length,
        content: xmlContent
      };
    } catch (error) {
      return null;
    }
  }
}

/**
 * 参照検出比較検証
 */
class ComparativeValidator {
  private detectorV33: EnhancedReferenceDetectorV33;
  private detectorV34: EnhancedReferenceDetectorV34;
  private classifier: LawTypeClassifier;
  private parser: SimpleLawParser;
  
  constructor() {
    this.detectorV33 = new EnhancedReferenceDetectorV33();
    this.detectorV34 = new EnhancedReferenceDetectorV34();
    this.classifier = new LawTypeClassifier();
    this.parser = new SimpleLawParser();
  }
  
  /**
   * 法令を検証（v3.3とv3.4を比較）
   */
  async validateLaw(xmlPath: string): Promise<ValidationResult | null> {
    const lawData = await this.parser.parseLaw(xmlPath);
    if (!lawData) return null;
    
    // 法令種別を判定
    const lawType = this.classifier.classifyByLawId(lawData.lawId) || 
                   this.classifier.classifyByLawName(lawData.lawTitle);
    
    // テスト用のサンプルテキストを抽出
    const sampleTexts = this.extractSampleTexts(lawData.content);
    
    // v3.3とv3.4で検出
    let v33Total = 0;
    let v34Total = 0;
    const referencesByType: { [key: string]: number } = {};
    
    for (const sample of sampleTexts) {
      const refs33 = this.detectorV33.detectReferences(sample.text, sample.articleNumber);
      const refs34 = this.detectorV34.detectReferences(sample.text, sample.articleNumber);
      
      v33Total += refs33.length;
      v34Total += refs34.length;
      
      // v3.4の結果を詳細分析
      for (const ref of refs34) {
        referencesByType[ref.type] = (referencesByType[ref.type] || 0) + 1;
      }
    }
    
    // 単純/複雑の分類（v3.4ベース）
    const simpleCount = referencesByType['internal'] || 0;
    const complexCount = v34Total - simpleCount;
    
    return {
      lawId: lawData.lawId,
      lawTitle: lawData.lawTitle,
      lawType,
      totalArticles: lawData.totalArticles,
      totalReferences: v34Total,
      referencesByType,
      simpleReferences: simpleCount,
      complexReferences: complexCount,
      detectionRate: v34Total > 0 ? (simpleCount / v34Total) * 100 : 0,
      improvements: {
        v33: v33Total,
        v34: v34Total,
        improvement: v34Total - v33Total
      }
    };
  }
  
  /**
   * サンプルテキストを抽出
   */
  private extractSampleTexts(xmlContent: string): Array<{text: string, articleNumber: string}> {
    const samples: Array<{text: string, articleNumber: string}> = [];
    
    // 条文パターンを検出（簡易版）
    const articlePattern = /<Article[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g;
    let match;
    let count = 0;
    
    while ((match = articlePattern.exec(xmlContent)) !== null && count < 10) {
      const articleNumber = match[1];
      const articleContent = match[2];
      
      // テキスト部分を抽出
      const textMatch = articleContent.match(/<Sentence[^>]*>([^<]+)<\/Sentence>/);
      if (textMatch) {
        samples.push({
          text: textMatch[1],
          articleNumber: `第${articleNumber}条`
        });
        count++;
      }
    }
    
    // サンプルが少ない場合は、パターンベースでテスト
    if (samples.length < 5) {
      samples.push(
        { text: '第一条の規定により、次の各号に掲げる事項を定める。', articleNumber: '第二条' },
        { text: '前条の規定にかかわらず、次条に定める場合においては', articleNumber: '第五条' },
        { text: '民法第七百九条の規定により損害賠償の責任を負う。', articleNumber: '第十条' },
        { text: '○○法施行令第三条の規定に基づき', articleNumber: '第一条' },
        { text: '○○省令第五条第二項に定める基準', articleNumber: '第三条' }
      );
    }
    
    return samples;
  }
  
  /**
   * 結果サマリーを生成
   */
  generateSummary(results: ValidationResult[]): string {
    let summary = '# 多様な法令種別での参照検出検証レポート\n\n';
    summary += `検証日時: ${new Date().toISOString()}\n`;
    summary += `検証法令数: ${results.length}\n`;
    summary += `検証バージョン: v3.3.0 vs v3.4.0\n\n`;
    
    // 法令種別ごとの集計
    const byType: { [key: string]: ValidationResult[] } = {};
    for (const result of results) {
      if (!byType[result.lawType]) byType[result.lawType] = [];
      byType[result.lawType].push(result);
    }
    
    summary += '## 法令種別ごとの検出性能\n\n';
    summary += '| 法令種別 | 法令数 | v3.3検出数 | v3.4検出数 | 改善率 | 単純参照率 |\n';
    summary += '|---------|--------|-----------|-----------|--------|----------|\n';
    
    for (const [type, typeResults] of Object.entries(byType)) {
      const v33Sum = typeResults.reduce((sum, r) => sum + r.improvements.v33, 0);
      const v34Sum = typeResults.reduce((sum, r) => sum + r.improvements.v34, 0);
      const avgSimpleRate = typeResults.reduce((sum, r) => sum + r.detectionRate, 0) / typeResults.length;
      const improvementRate = v33Sum > 0 ? ((v34Sum - v33Sum) / v33Sum * 100) : 0;
      
      summary += `| ${type} | ${typeResults.length} | ${v33Sum} | ${v34Sum} | `;
      summary += `${improvementRate >= 0 ? '+' : ''}${improvementRate.toFixed(1)}% | `;
      summary += `${avgSimpleRate.toFixed(1)}% |\n`;
    }
    
    summary += '\n## 全体統計\n\n';
    const totalV33 = results.reduce((sum, r) => sum + r.improvements.v33, 0);
    const totalV34 = results.reduce((sum, r) => sum + r.improvements.v34, 0);
    const totalImprovement = totalV34 - totalV33;
    
    summary += `- v3.3.0 総検出数: ${totalV33}\n`;
    summary += `- v3.4.0 総検出数: ${totalV34}\n`;
    summary += `- 改善数: ${totalImprovement >= 0 ? '+' : ''}${totalImprovement}\n`;
    summary += `- 改善率: ${totalV33 > 0 ? ((totalImprovement / totalV33 * 100).toFixed(1)) : 0}%\n\n`;
    
    // 参照タイプ別統計
    const typeStats: { [key: string]: number } = {};
    for (const result of results) {
      for (const [type, count] of Object.entries(result.referencesByType)) {
        typeStats[type] = (typeStats[type] || 0) + count;
      }
    }
    
    summary += '## 参照タイプ別統計（v3.4.0）\n\n';
    for (const [type, count] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
      summary += `- ${type}: ${count} (${(count/totalV34*100).toFixed(1)}%)\n`;
    }
    
    // 改善が大きかった法令
    const improvements = results
      .filter(r => r.improvements.improvement > 0)
      .sort((a, b) => b.improvements.improvement - a.improvements.improvement)
      .slice(0, 5);
    
    if (improvements.length > 0) {
      summary += '\n## 改善が大きかった法令 TOP5\n\n';
      for (const imp of improvements) {
        summary += `- ${imp.lawTitle} (${imp.lawType}): +${imp.improvements.improvement}件\n`;
      }
    }
    
    return summary;
  }
}

// メイン実行
async function main() {
  const validator = new ComparativeValidator();
  
  console.log(chalk.cyan('=== 多様な法令種別での検証開始 ===\n'));
  
  // 検証対象ディレクトリ
  const dirs = [
    'laws_data/diverse_samples',
    'laws_data/sample'
  ];
  
  const xmlFiles: string[] = [];
  
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.xml'))
        .map(f => path.join(dir, f));
      xmlFiles.push(...files);
    }
  }
  
  if (xmlFiles.length === 0) {
    console.log(chalk.red('検証するXMLファイルが見つかりません'));
    return;
  }
  
  console.log(chalk.green(`${xmlFiles.length}個の法令を検証します\n`));
  
  const results: ValidationResult[] = [];
  
  for (const xmlFile of xmlFiles) {
    const spinner = ora(`検証中: ${path.basename(xmlFile)}`).start();
    const result = await validator.validateLaw(xmlFile);
    
    if (result) {
      results.push(result);
      const improvement = result.improvements.improvement;
      const improvementText = improvement >= 0 ? 
        chalk.green(`+${improvement}`) : 
        chalk.red(`${improvement}`);
      
      spinner.succeed(
        `${result.lawType}: ${result.lawTitle} - ` +
        `v3.4: ${result.improvements.v34}件 (${improvementText})`
      );
    } else {
      spinner.fail(`失敗: ${path.basename(xmlFile)}`);
    }
  }
  
  // レポート生成
  const summary = validator.generateSummary(results);
  const reportPath = `diverse-validation-report-${new Date().toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(reportPath, summary);
  
  // コンソール出力
  console.log(chalk.cyan('\n=== 検証結果サマリー ===\n'));
  
  const totalV33 = results.reduce((sum, r) => sum + r.improvements.v33, 0);
  const totalV34 = results.reduce((sum, r) => sum + r.improvements.v34, 0);
  const improvement = totalV34 - totalV33;
  
  console.log(`v3.3.0 総検出数: ${chalk.yellow(totalV33)}`);
  console.log(`v3.4.0 総検出数: ${chalk.green(totalV34)}`);
  console.log(`改善: ${improvement >= 0 ? chalk.green(`+${improvement}`) : chalk.red(`${improvement}`)}`);
  console.log(`改善率: ${chalk.bold((improvement/totalV33*100).toFixed(1) + '%')}`);
  
  console.log(chalk.green(`\nレポートを ${reportPath} に保存しました`));
}

main().catch(error => {
  console.error(chalk.red('エラー:'), error);
  process.exit(1);
});