#!/usr/bin/env tsx

/**
 * 大規模検証スクリプト（1000法令）
 * パターン検出の限界とLLM適用の必要性を評価
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

interface DetectedReference {
  type: 'external' | 'internal' | 'relative' | 'structural' | 'application';
  text: string;
  targetLaw?: string;
  targetLawId?: string;
  targetArticle?: string;
  confidence: number;
}

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  totalArticles: number;
  detectedReferences: number;
  mappedReferences: number;
  unmappedReferences: number;
  externalReferences: number;
  internalReferences: number;
  accuracy: number;
  unmappedPatterns: string[];
}

interface PatternAnalysis {
  pattern: string;
  count: number;
  examples: string[];
  category: 'contextual' | 'abbreviation' | 'complex' | 'unknown';
}

class MassiveValidation {
  // 完全な法令IDマッピング（既知の法令）
  private readonly COMPLETE_LAW_MAPPING: Record<string, string> = {
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
    
    // 刑事法
    '刑法': '140AC0000000045',
    '刑事訴訟法': '323AC0000000131',
    
    // 行政法
    '行政手続法': '405AC0000000088',
    '行政事件訴訟法': '337AC0000000139',
    '地方自治法': '322AC0000000067',
    
    // 労働法
    '労働基準法': '322AC0000000049',
    '労働契約法': '419AC0000000128',
    '労働組合法': '324AC0000000174',
    
    // 知的財産法
    '特許法': '334AC0000000121',
    '著作権法': '345AC0000000048',
    
    // 税法
    '所得税法': '340AC0000000033',
    '法人税法': '340AC0000000034',
    '消費税法': '363AC0000000108',
  };

  private lawTitleCache: Map<string, string> = new Map();
  private unmappedPatterns: Map<string, PatternAnalysis> = new Map();

  async initialize() {
    const laws = await prisma.lawMaster.findMany({
      select: { id: true, title: true }
    });

    for (const law of laws) {
      if (law.title) {
        this.lawTitleCache.set(law.title, law.id);
        const shortTitle = law.title.replace(/（.+）/g, '').trim();
        if (shortTitle !== law.title) {
          this.lawTitleCache.set(shortTitle, law.id);
        }
      }
    }

    console.log(`✅ ${laws.length}件の法令情報をキャッシュしました`);
  }

  private findLawId(lawName: string): string | null {
    if (this.COMPLETE_LAW_MAPPING[lawName]) {
      return this.COMPLETE_LAW_MAPPING[lawName];
    }

    if (this.lawTitleCache.has(lawName)) {
      return this.lawTitleCache.get(lawName)!;
    }

    for (const [title, id] of this.lawTitleCache.entries()) {
      if (title.includes(lawName) || lawName.includes(title)) {
        return id;
      }
    }

    return null;
  }

  detectReferences(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];

    // パターン1: 法令名（括弧付き）
    const pattern1 = /([^、。\s（）]*法)（([^）]+)）/g;
    let match;

    while ((match = pattern1.exec(text)) !== null) {
      const lawName = match[1];
      const lawId = this.findLawId(lawName);

      references.push({
        type: 'external',
        text: match[0],
        targetLaw: lawName,
        targetLawId: lawId,
        confidence: lawId ? 0.95 : 0.7
      });

      if (!lawId) {
        this.recordUnmappedPattern(lawName, match[0], 'abbreviation');
      }
    }

    // パターン2: 法令名＋条文
    const pattern2 = /([^、。\s（）]*法)第([一二三四五六七八九十百千]+)条/g;

    while ((match = pattern2.exec(text)) !== null) {
      const lawName = match[1];

      const alreadyDetected = references.some(ref =>
        ref.text.includes(lawName) && ref.text.includes('（')
      );

      if (!alreadyDetected && lawName !== 'この法' && lawName !== '同法') {
        const lawId = this.findLawId(lawName);
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: lawId,
          targetArticle: `第${match[2]}条`,
          confidence: lawId ? 0.9 : 0.6
        });

        if (!lawId) {
          this.recordUnmappedPattern(lawName, match[0], 'abbreviation');
        }
      }
    }

    // パターン3: 同法・同条などの文脈依存参照
    const pattern3 = /(同法|同条|当該.+法)(?:第([一二三四五六七八九十百千]+)条)?/g;

    while ((match = pattern3.exec(text)) !== null) {
      references.push({
        type: 'relative',
        text: match[0],
        targetArticle: match[2] ? `第${match[2]}条` : null,
        confidence: 0.5
      });

      this.recordUnmappedPattern(match[1], match[0], 'contextual');
    }

    // パターン4: この法律・本法
    const pattern4 = /(この法律|本法)(?:第([一二三四五六七八九十百千]+)条)?/g;

    while ((match = pattern4.exec(text)) !== null) {
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: match[2] ? `第${match[2]}条` : null,
        confidence: 0.85
      });
    }

    return references;
  }

  private recordUnmappedPattern(pattern: string, example: string, category: PatternAnalysis['category']) {
    if (!this.unmappedPatterns.has(pattern)) {
      this.unmappedPatterns.set(pattern, {
        pattern,
        count: 0,
        examples: [],
        category
      });
    }

    const analysis = this.unmappedPatterns.get(pattern)!;
    analysis.count++;
    if (analysis.examples.length < 5) {
      analysis.examples.push(example);
    }
  }

  async validateLaw(lawId: string): Promise<ValidationResult | null> {
    const law = await prisma.lawMaster.findUnique({
      where: { id: lawId }
    });

    if (!law) {
      return null;
    }

    const articles = await prisma.article.findMany({
      where: {
        versionId: { startsWith: lawId }
      },
      take: 50 // メモリ対策
    });

    let totalDetected = 0;
    let mappedCount = 0;
    let unmappedCount = 0;
    let externalCount = 0;
    let internalCount = 0;
    const unmappedPatterns: string[] = [];

    for (const article of articles) {
      const refs = this.detectReferences(article.content);
      totalDetected += refs.length;

      for (const ref of refs) {
        if (ref.type === 'external') {
          externalCount++;
          if (ref.targetLawId) {
            mappedCount++;
          } else {
            unmappedCount++;
            if (ref.targetLaw && !unmappedPatterns.includes(ref.targetLaw)) {
              unmappedPatterns.push(ref.targetLaw);
            }
          }
        } else if (ref.type === 'internal') {
          internalCount++;
        }
      }
    }

    const accuracy = externalCount > 0 ? (mappedCount / externalCount) * 100 : 100;

    return {
      lawId,
      lawTitle: law.title,
      totalArticles: articles.length,
      detectedReferences: totalDetected,
      mappedReferences: mappedCount,
      unmappedReferences: unmappedCount,
      externalReferences: externalCount,
      internalReferences: internalCount,
      accuracy,
      unmappedPatterns
    };
  }

  async performMassiveValidation() {
    console.log('='.repeat(80));
    console.log('📊 大規模検証（1000法令）');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}\n`);

    await this.initialize();

    // 1000法令をランダムサンプリング
    const allLaws = await prisma.lawMaster.findMany({
      select: { id: true },
      take: 1000
    });

    const results: ValidationResult[] = [];
    let processedCount = 0;
    let totalDetected = 0;
    let totalMapped = 0;
    let totalUnmapped = 0;

    console.log(`\n📝 ${allLaws.length}法令を検証中...\n`);

    for (const law of allLaws) {
      const result = await this.validateLaw(law.id);
      
      if (result) {
        results.push(result);
        processedCount++;
        totalDetected += result.detectedReferences;
        totalMapped += result.mappedReferences;
        totalUnmapped += result.unmappedReferences;

        if (processedCount % 100 === 0) {
          const currentAccuracy = totalMapped / (totalMapped + totalUnmapped) * 100;
          console.log(`[${processedCount}/1000] 処理済み - 現在の精度: ${currentAccuracy.toFixed(1)}%`);
        }
      }
    }

    // 全体統計
    const overallAccuracy = (totalMapped / (totalMapped + totalUnmapped)) * 100;

    console.log('\n' + '='.repeat(80));
    console.log('📈 全体統計');
    console.log('='.repeat(80));
    console.log(`検証法令数: ${processedCount}`);
    console.log(`総検出参照数: ${totalDetected}`);
    console.log(`外部参照マッピング成功: ${totalMapped}`);
    console.log(`外部参照マッピング失敗: ${totalUnmapped}`);
    console.log(`\n⭐ 総合マッピング精度: ${overallAccuracy.toFixed(1)}%`);

    // パターン分析
    console.log('\n' + '='.repeat(80));
    console.log('🔍 未解決パターン分析');
    console.log('='.repeat(80));

    const topPatterns = Array.from(this.unmappedPatterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    console.log('\n【最頻出の未解決パターン TOP20】');
    for (const pattern of topPatterns) {
      console.log(`\n${pattern.pattern} (${pattern.count}回)`);
      console.log(`  カテゴリ: ${pattern.category}`);
      console.log('  例:');
      pattern.examples.slice(0, 3).forEach(ex => {
        console.log(`    - "${ex}"`);
      });
    }

    // カテゴリ別統計
    const categoryStats = new Map<string, number>();
    for (const pattern of this.unmappedPatterns.values()) {
      const current = categoryStats.get(pattern.category) || 0;
      categoryStats.set(pattern.category, current + pattern.count);
    }

    console.log('\n【カテゴリ別統計】');
    for (const [category, count] of categoryStats.entries()) {
      const percentage = (count / totalUnmapped * 100).toFixed(1);
      console.log(`  ${category}: ${count}件 (${percentage}%)`);
    }

    // 改善提案
    console.log('\n' + '='.repeat(80));
    console.log('💡 改善提案');
    console.log('='.repeat(80));

    const contextualPercentage = ((categoryStats.get('contextual') || 0) / totalUnmapped * 100);
    const abbreviationPercentage = ((categoryStats.get('abbreviation') || 0) / totalUnmapped * 100);

    console.log('\n【パターン検出の限界】');
    console.log(`1. 文脈依存参照（同法・当該法など）: ${contextualPercentage.toFixed(1)}%`);
    console.log(`2. 略称・通称法令: ${abbreviationPercentage.toFixed(1)}%`);
    console.log(`3. 複雑な複合参照: その他`);

    console.log('\n【LLM適用の推奨】');
    if (contextualPercentage > 10) {
      console.log('✅ 文脈依存参照が多いため、LLMによる文脈理解が有効');
    }
    if (abbreviationPercentage > 10) {
      console.log('✅ 略称が多いため、LLMによる法令名推定が有効');
    }
    if (overallAccuracy < 90) {
      console.log('✅ 全体精度が90%未満のため、LLMによる補完が推奨');
    }

    // 精度別分布
    const accuracyRanges = {
      '100%': 0,
      '90-99%': 0,
      '80-89%': 0,
      '70-79%': 0,
      '60-69%': 0,
      '60%未満': 0
    };

    for (const result of results) {
      if (result.accuracy === 100) accuracyRanges['100%']++;
      else if (result.accuracy >= 90) accuracyRanges['90-99%']++;
      else if (result.accuracy >= 80) accuracyRanges['80-89%']++;
      else if (result.accuracy >= 70) accuracyRanges['70-79%']++;
      else if (result.accuracy >= 60) accuracyRanges['60-69%']++;
      else accuracyRanges['60%未満']++;
    }

    console.log('\n【精度分布】');
    for (const [range, count] of Object.entries(accuracyRanges)) {
      const percentage = (count / processedCount * 100).toFixed(1);
      console.log(`  ${range}: ${count}法令 (${percentage}%)`);
    }

    // レポート保存
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalLaws: processedCount,
        totalDetected,
        totalMapped,
        totalUnmapped,
        overallAccuracy
      },
      categoryAnalysis: Object.fromEntries(categoryStats),
      topUnmappedPatterns: topPatterns,
      accuracyDistribution: accuracyRanges,
      recommendations: {
        needsLLM: overallAccuracy < 90 || contextualPercentage > 10,
        contextualReferencesNeedLLM: contextualPercentage > 10,
        abbreviationsNeedLLM: abbreviationPercentage > 10
      }
    };

    const reportPath = `/home/coffee/projects/LawFinder/Report/${new Date().toISOString().slice(0, 16).replace(':', '')}_massive_validation_1000.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 詳細レポート保存: ${reportPath}`);

    return report;
  }
}

// メイン処理
async function main() {
  const validator = new MassiveValidation();
  const report = await validator.performMassiveValidation();
  
  // Markdown形式のレポートも生成
  const mdReport = generateMarkdownReport(report);
  const mdPath = `/home/coffee/projects/LawFinder/Report/${new Date().toISOString().slice(0, 16).replace(':', '')}_massive_validation_1000.md`;
  writeFileSync(mdPath, mdReport);
  console.log(`📄 Markdownレポート保存: ${mdPath}`);

  await prisma.$disconnect();
}

function generateMarkdownReport(report: any): string {
  let md = `# 大規模参照検証レポート（1000法令）\n\n`;
  md += `実行日時: ${report.timestamp}\n\n`;
  
  md += `## 📊 全体統計\n\n`;
  md += `- 検証法令数: ${report.summary.totalLaws}\n`;
  md += `- 総検出参照数: ${report.summary.totalDetected}\n`;
  md += `- マッピング成功: ${report.summary.totalMapped}\n`;
  md += `- マッピング失敗: ${report.summary.totalUnmapped}\n`;
  md += `- **総合精度: ${report.summary.overallAccuracy.toFixed(1)}%**\n\n`;

  md += `## 🔍 カテゴリ別分析\n\n`;
  md += `| カテゴリ | 件数 | 割合 |\n`;
  md += `|---------|------|------|\n`;
  for (const [category, count] of Object.entries(report.categoryAnalysis)) {
    const percentage = ((count as number) / report.summary.totalUnmapped * 100).toFixed(1);
    md += `| ${category} | ${count} | ${percentage}% |\n`;
  }

  md += `\n## 📈 精度分布\n\n`;
  md += `| 精度範囲 | 法令数 | 割合 |\n`;
  md += `|---------|--------|------|\n`;
  for (const [range, count] of Object.entries(report.accuracyDistribution)) {
    const percentage = ((count as number) / report.summary.totalLaws * 100).toFixed(1);
    md += `| ${range} | ${count} | ${percentage}% |\n`;
  }

  md += `\n## 💡 改善提案\n\n`;
  if (report.recommendations.needsLLM) {
    md += `### ✅ LLM導入を推奨\n\n`;
    if (report.recommendations.contextualReferencesNeedLLM) {
      md += `- 文脈依存参照の解決にLLMが有効\n`;
    }
    if (report.recommendations.abbreviationsNeedLLM) {
      md += `- 略称・通称の正規化にLLMが有効\n`;
    }
  }

  md += `\n## 🚫 主要な未解決パターン\n\n`;
  for (const pattern of report.topUnmappedPatterns.slice(0, 10)) {
    md += `### ${pattern.pattern} (${pattern.count}回)\n`;
    md += `- カテゴリ: ${pattern.category}\n`;
    md += `- 例:\n`;
    for (const ex of pattern.examples.slice(0, 3)) {
      md += `  - "${ex}"\n`;
    }
    md += `\n`;
  }

  return md;
}

main().catch(console.error);