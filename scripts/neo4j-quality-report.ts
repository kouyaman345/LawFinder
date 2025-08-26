#!/usr/bin/env npx tsx

/**
 * Neo4jデータ品質レポート生成
 * 
 * 参照グラフデータベースの品質を分析し
 * 詳細なレポートを生成
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface QualityMetrics {
  coverage: {
    totalLaws: number;
    lawsWithXml: number;
    lawsWithReferences: number;
    xmlCoverage: number;
    referenceCoverage: number;
  };
  completeness: {
    totalArticles: number;
    articlesWithContent: number;
    articlesWithReferences: number;
    averageArticlesPerLaw: number;
  };
  accuracy: {
    totalReferences: number;
    bySource: Record<string, number>;
    byType: Record<string, number>;
    averageConfidence: number;
    highConfidenceRatio: number;
  };
  consistency: {
    duplicateReferences: number;
    conflictingReferences: number;
    orphanNodes: number;
    missingTargets: number;
  };
  dataQuality: {
    score: number; // 0-100
    grade: string; // A, B, C, D, F
    issues: string[];
    recommendations: string[];
  };
}

class Neo4jQualityReporter {
  private driver: any;
  private metrics: QualityMetrics;
  
  constructor() {
    this.driver = initNeo4jDriver();
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): QualityMetrics {
    return {
      coverage: {
        totalLaws: 0,
        lawsWithXml: 0,
        lawsWithReferences: 0,
        xmlCoverage: 0,
        referenceCoverage: 0
      },
      completeness: {
        totalArticles: 0,
        articlesWithContent: 0,
        articlesWithReferences: 0,
        averageArticlesPerLaw: 0
      },
      accuracy: {
        totalReferences: 0,
        bySource: {},
        byType: {},
        averageConfidence: 0,
        highConfidenceRatio: 0
      },
      consistency: {
        duplicateReferences: 0,
        conflictingReferences: 0,
        orphanNodes: 0,
        missingTargets: 0
      },
      dataQuality: {
        score: 0,
        grade: 'F',
        issues: [],
        recommendations: []
      }
    };
  }

  /**
   * カバレッジ分析
   */
  private async analyzeCoverage(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // 法令統計
      const lawStats = await session.run(`
        MATCH (l:Law)
        RETURN 
          count(l) as total,
          count(CASE WHEN l.hasXml = true THEN 1 END) as withXml,
          count(CASE WHEN l.totalReferences > 0 THEN 1 END) as withRefs
      `);
      
      const lawRecord = lawStats.records[0];
      this.metrics.coverage.totalLaws = lawRecord.get('total').toNumber();
      this.metrics.coverage.lawsWithXml = lawRecord.get('withXml').toNumber();
      this.metrics.coverage.lawsWithReferences = lawRecord.get('withRefs').toNumber();
      
      // カバレッジ率計算
      if (this.metrics.coverage.totalLaws > 0) {
        this.metrics.coverage.xmlCoverage = 
          (this.metrics.coverage.lawsWithXml / this.metrics.coverage.totalLaws) * 100;
        this.metrics.coverage.referenceCoverage = 
          (this.metrics.coverage.lawsWithReferences / this.metrics.coverage.totalLaws) * 100;
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 完全性分析
   */
  private async analyzeCompleteness(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // 条文統計
      const articleStats = await session.run(`
        MATCH (a:Article)
        RETURN 
          count(a) as total,
          count(CASE WHEN a.content IS NOT NULL THEN 1 END) as withContent
      `);
      
      const articleRecord = articleStats.records[0];
      this.metrics.completeness.totalArticles = articleRecord.get('total').toNumber();
      this.metrics.completeness.articlesWithContent = articleRecord.get('withContent').toNumber();
      
      // 参照を持つ条文
      const refArticles = await session.run(`
        MATCH (a:Article)-[:REFERENCES]->()
        RETURN count(DISTINCT a) as count
      `);
      
      this.metrics.completeness.articlesWithReferences = 
        refArticles.records[0].get('count').toNumber();
      
      // 平均条文数
      if (this.metrics.coverage.lawsWithXml > 0) {
        this.metrics.completeness.averageArticlesPerLaw = 
          this.metrics.completeness.totalArticles / this.metrics.coverage.lawsWithXml;
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 精度分析
   */
  private async analyzeAccuracy(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // 参照統計
      const refStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN 
          count(r) as total,
          avg(CASE WHEN r.confidence IS NOT NULL THEN r.confidence ELSE 1.0 END) as avgConf
      `);
      
      const refRecord = refStats.records[0];
      this.metrics.accuracy.totalReferences = refRecord.get('total').toNumber();
      this.metrics.accuracy.averageConfidence = refRecord.get('avgConf') || 1.0;
      
      // ソース別
      const sourceStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN r.source as source, count(r) as count
      `);
      
      sourceStats.records.forEach(record => {
        const source = record.get('source') || 'unknown';
        this.metrics.accuracy.bySource[source] = record.get('count').toNumber();
      });
      
      // タイプ別
      const typeStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN r.type as type, count(r) as count
      `);
      
      typeStats.records.forEach(record => {
        const type = record.get('type') || 'unknown';
        this.metrics.accuracy.byType[type] = record.get('count').toNumber();
      });
      
      // 高信頼度の割合
      const highConfStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.confidence >= 0.9
        RETURN count(r) as count
      `);
      
      const highConfCount = highConfStats.records[0].get('count').toNumber();
      if (this.metrics.accuracy.totalReferences > 0) {
        this.metrics.accuracy.highConfidenceRatio = 
          highConfCount / this.metrics.accuracy.totalReferences;
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 一貫性分析
   */
  private async analyzeConsistency(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // 重複参照
      const duplicates = await session.run(`
        MATCH (s:Article)-[r1:REFERENCES]->(t:Article)
        MATCH (s)-[r2:REFERENCES]->(t)
        WHERE id(r1) < id(r2) AND r1.text = r2.text
        RETURN count(DISTINCT r2) as count
      `);
      
      this.metrics.consistency.duplicateReferences = 
        duplicates.records[0].get('count').toNumber();
      
      // 孤立ノード
      const orphans = await session.run(`
        MATCH (n)
        WHERE NOT (n)--()
        RETURN count(n) as count
      `);
      
      this.metrics.consistency.orphanNodes = 
        orphans.records[0].get('count').toNumber();
      
      // 存在しないターゲット
      const missingTargets = await session.run(`
        MATCH (s:Article)-[r:REFERENCES]->(t)
        WHERE NOT t:Article
        RETURN count(r) as count
      `);
      
      this.metrics.consistency.missingTargets = 
        missingTargets.records[0].get('count').toNumber();
      
    } finally {
      await session.close();
    }
  }

  /**
   * データ品質スコア計算
   */
  private calculateQualityScore(): void {
    let score = 0;
    const issues = [];
    const recommendations = [];
    
    // カバレッジスコア (30点)
    score += (this.metrics.coverage.xmlCoverage / 100) * 15;
    score += (this.metrics.coverage.referenceCoverage / 100) * 15;
    
    if (this.metrics.coverage.xmlCoverage < 50) {
      issues.push('XMLカバレッジが50%未満');
      recommendations.push('より多くの法令XMLファイルを取得してください');
    }
    
    // 完全性スコア (30点)
    const contentRatio = this.metrics.completeness.articlesWithContent / 
                        Math.max(1, this.metrics.completeness.totalArticles);
    score += contentRatio * 30;
    
    if (contentRatio < 0.8) {
      issues.push('条文コンテンツの欠損が20%以上');
      recommendations.push('XMLパーサーの改善または手動データ補完を検討');
    }
    
    // 精度スコア (25点)
    score += this.metrics.accuracy.averageConfidence * 15;
    score += this.metrics.accuracy.highConfidenceRatio * 10;
    
    if (this.metrics.accuracy.averageConfidence < 0.8) {
      issues.push('平均信頼度が80%未満');
      recommendations.push('LLM検出パラメータの調整を推奨');
    }
    
    // 一貫性スコア (15点)
    const consistencyPenalty = 
      (this.metrics.consistency.duplicateReferences * 0.001) +
      (this.metrics.consistency.orphanNodes * 0.0001) +
      (this.metrics.consistency.missingTargets * 0.001);
    score += Math.max(0, 15 - consistencyPenalty);
    
    if (this.metrics.consistency.duplicateReferences > 100) {
      issues.push('重複参照が100件以上存在');
      recommendations.push('重複排除処理の実行を推奨');
    }
    
    // グレード判定
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    
    this.metrics.dataQuality = {
      score: Math.round(score),
      grade,
      issues,
      recommendations
    };
  }

  /**
   * レポート生成
   */
  async generateReport(outputPath?: string): Promise<void> {
    console.log(chalk.cyan('\n📊 データ品質分析中...'));
    
    // 各分析を実行
    await this.analyzeCoverage();
    await this.analyzeCompleteness();
    await this.analyzeAccuracy();
    await this.analyzeConsistency();
    this.calculateQualityScore();
    
    // レポート生成
    const report = this.formatReport();
    
    // コンソール出力
    console.log(report);
    
    // ファイル出力
    if (outputPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = outputPath || `quality_report_${timestamp}.md`;
      fs.writeFileSync(filename, report);
      console.log(chalk.green(`\n✅ レポートを保存: ${filename}`));
    }
  }

  /**
   * レポートフォーマット
   */
  private formatReport(): string {
    const lines: string[] = [];
    
    lines.push('# Neo4j データ品質レポート');
    lines.push(`\n生成日時: ${new Date().toLocaleString('ja-JP')}`);
    
    // 総合スコア
    lines.push('\n## 総合評価');
    lines.push(`- **品質スコア**: ${this.metrics.dataQuality.score}/100`);
    lines.push(`- **グレード**: ${this.metrics.dataQuality.grade}`);
    
    // カバレッジ
    lines.push('\n## カバレッジ分析');
    lines.push(`- 総法令数: ${this.metrics.coverage.totalLaws.toLocaleString()}件`);
    lines.push(`- XMLカバレッジ: ${this.metrics.coverage.xmlCoverage.toFixed(1)}%`);
    lines.push(`- 参照カバレッジ: ${this.metrics.coverage.referenceCoverage.toFixed(1)}%`);
    
    // 完全性
    lines.push('\n## 完全性分析');
    lines.push(`- 総条文数: ${this.metrics.completeness.totalArticles.toLocaleString()}件`);
    lines.push(`- コンテンツ有り: ${this.metrics.completeness.articlesWithContent.toLocaleString()}件`);
    lines.push(`- 参照有り: ${this.metrics.completeness.articlesWithReferences.toLocaleString()}件`);
    lines.push(`- 平均条文数/法令: ${this.metrics.completeness.averageArticlesPerLaw.toFixed(1)}`);
    
    // 精度
    lines.push('\n## 精度分析');
    lines.push(`- 総参照数: ${this.metrics.accuracy.totalReferences.toLocaleString()}件`);
    lines.push(`- 平均信頼度: ${(this.metrics.accuracy.averageConfidence * 100).toFixed(1)}%`);
    lines.push(`- 高信頼度率: ${(this.metrics.accuracy.highConfidenceRatio * 100).toFixed(1)}%`);
    
    lines.push('\n### ソース別参照数');
    Object.entries(this.metrics.accuracy.bySource).forEach(([source, count]) => {
      lines.push(`- ${source}: ${count.toLocaleString()}件`);
    });
    
    lines.push('\n### タイプ別参照数');
    Object.entries(this.metrics.accuracy.byType).forEach(([type, count]) => {
      lines.push(`- ${type}: ${count.toLocaleString()}件`);
    });
    
    // 一貫性
    lines.push('\n## 一貫性分析');
    lines.push(`- 重複参照: ${this.metrics.consistency.duplicateReferences}件`);
    lines.push(`- 孤立ノード: ${this.metrics.consistency.orphanNodes}件`);
    lines.push(`- 欠損ターゲット: ${this.metrics.consistency.missingTargets}件`);
    
    // 課題と推奨事項
    if (this.metrics.dataQuality.issues.length > 0) {
      lines.push('\n## 検出された課題');
      this.metrics.dataQuality.issues.forEach(issue => {
        lines.push(`- ⚠️ ${issue}`);
      });
    }
    
    if (this.metrics.dataQuality.recommendations.length > 0) {
      lines.push('\n## 改善推奨事項');
      this.metrics.dataQuality.recommendations.forEach(rec => {
        lines.push(`- 💡 ${rec}`);
      });
    }
    
    return lines.join('\n');
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const reporter = new Neo4jQualityReporter();
  
  (async () => {
    try {
      const outputPath = process.argv.includes('--output') ?
        process.argv[process.argv.indexOf('--output') + 1] : undefined;
      
      await reporter.generateReport(outputPath);
      
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await reporter.close();
    }
  })();
}

export default Neo4jQualityReporter;