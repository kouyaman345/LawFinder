#!/usr/bin/env npx tsx
/**
 * ハネ改正（波及的改正）影響分析レポート
 * 
 * 法令の特定条文を改正した場合の影響範囲を分析し、
 * 他法令への波及的影響をグラフデータベースから抽出
 */

import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'lawfinder123';

interface ImpactAnalysisResult {
  targetLaw: string;
  targetArticle: string;
  directImpact: ImpactItem[];
  indirectImpact: ImpactItem[];
  crossLawImpact: ImpactItem[];
  totalImpactedArticles: number;
  totalImpactedLaws: number;
  criticalDependencies: ImpactItem[];
}

interface ImpactItem {
  lawId: string;
  lawTitle?: string;
  articleId: string;
  articleNumber: string;
  impactLevel: number; // 1: 直接影響, 2: 間接影響, 3: 波及影響
  referenceType: string;
  referenceText?: string;
}

class HaneKaiseiAnalyzer {
  private driver: any;
  private prisma: PrismaClient;

  constructor() {
    this.driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
    );
    this.prisma = new PrismaClient();
  }

  /**
   * 主要法令のハネ改正影響を分析
   */
  async analyzeMainLaws(): Promise<void> {
    console.log('🔍 ハネ改正影響分析を開始します...\n');

    // 分析対象の主要法令と重要条文
    const targetArticles = [
      { lawId: '129AC0000000089', articleNumber: '709', description: '民法 不法行為' },
      { lawId: '140AC0000000045', articleNumber: '199', description: '刑法 殺人' },
      { lawId: '322AC0000000049', articleNumber: '32', description: '労働基準法 労働時間' },
      { lawId: '417AC0000000086', articleNumber: '2', description: '会社法 定義' },
      { lawId: '132AC0000000048', articleNumber: '1', description: '商法 総則' }
    ];

    const results: ImpactAnalysisResult[] = [];

    for (const target of targetArticles) {
      console.log(`\n📋 ${target.description} の影響分析中...`);
      const result = await this.analyzeImpact(target.lawId, target.articleNumber);
      results.push(result);
      this.printImpactSummary(result, target.description);
    }

    // レポート生成
    await this.generateReport(results);
  }

  /**
   * 特定条文の改正影響を分析
   */
  private async analyzeImpact(lawId: string, articleNumber: string): Promise<ImpactAnalysisResult> {
    const session = this.driver.session();
    const articleId = `${lawId}_${articleNumber}`;

    try {
      // 1. 直接影響（この条文を直接参照している条文）
      const directResult = await session.run(`
        MATCH (target:Article {id: $articleId})<-[r]-(source:Article)
        WITH source, r, target
        MATCH (sourceLaw:Law)-[:HAS_ARTICLE]->(source)
        RETURN DISTINCT
          source.id as articleId,
          source.number as articleNumber,
          sourceLaw.id as lawId,
          sourceLaw.title as lawTitle,
          type(r) as referenceType,
          r.text as referenceText
        LIMIT 100
      `, { articleId });

      const directImpact: ImpactItem[] = directResult.records.map(record => ({
        lawId: record.get('lawId'),
        lawTitle: record.get('lawTitle'),
        articleId: record.get('articleId'),
        articleNumber: record.get('articleNumber'),
        impactLevel: 1,
        referenceType: record.get('referenceType'),
        referenceText: record.get('referenceText')
      }));

      // 2. 間接影響（2段階の参照）
      const indirectResult = await session.run(`
        MATCH path = (target:Article {id: $articleId})<-[*2]-(affected:Article)
        WITH affected, length(path) as distance
        WHERE distance = 2
        MATCH (affectedLaw:Law)-[:HAS_ARTICLE]->(affected)
        RETURN DISTINCT
          affected.id as articleId,
          affected.number as articleNumber,
          affectedLaw.id as lawId,
          affectedLaw.title as lawTitle
        LIMIT 100
      `, { articleId });

      const indirectImpact: ImpactItem[] = indirectResult.records.map(record => ({
        lawId: record.get('lawId'),
        lawTitle: record.get('lawTitle'),
        articleId: record.get('articleId'),
        articleNumber: record.get('articleNumber'),
        impactLevel: 2,
        referenceType: 'INDIRECT',
        referenceText: undefined
      }));

      // 3. 他法令への影響
      const crossLawResult = await session.run(`
        MATCH (target:Article {id: $articleId})<-[r]-(source:Article)
        MATCH (sourceLaw:Law)-[:HAS_ARTICLE]->(source)
        WHERE sourceLaw.id <> $lawId
        RETURN DISTINCT
          source.id as articleId,
          source.number as articleNumber,
          sourceLaw.id as lawId,
          sourceLaw.title as lawTitle,
          type(r) as referenceType,
          r.text as referenceText
        LIMIT 50
      `, { articleId, lawId });

      const crossLawImpact: ImpactItem[] = crossLawResult.records.map(record => ({
        lawId: record.get('lawId'),
        lawTitle: record.get('lawTitle'),
        articleId: record.get('articleId'),
        articleNumber: record.get('articleNumber'),
        impactLevel: 3,
        referenceType: record.get('referenceType'),
        referenceText: record.get('referenceText')
      }));

      // 4. 重要な依存関係（多数から参照されている条文への影響）
      const criticalResult = await session.run(`
        MATCH (target:Article {id: $articleId})<-[*1..2]-(middle:Article)<-[r]-(dependent:Article)
        WITH middle, count(distinct dependent) as refCount
        WHERE refCount > 3
        MATCH (middleLaw:Law)-[:HAS_ARTICLE]->(middle)
        RETURN
          middle.id as articleId,
          middle.number as articleNumber,
          middleLaw.id as lawId,
          middleLaw.title as lawTitle,
          refCount
        ORDER BY refCount DESC
        LIMIT 10
      `, { articleId });

      const criticalDependencies: ImpactItem[] = criticalResult.records.map(record => ({
        lawId: record.get('lawId'),
        lawTitle: record.get('lawTitle'),
        articleId: record.get('articleId'),
        articleNumber: record.get('articleNumber'),
        impactLevel: 1,
        referenceType: 'CRITICAL',
        referenceText: `${record.get('refCount')}件の条文から参照`
      }));

      // 統計情報の集計
      const allImpactedArticles = new Set([
        ...directImpact.map(i => i.articleId),
        ...indirectImpact.map(i => i.articleId),
        ...crossLawImpact.map(i => i.articleId)
      ]);

      const allImpactedLaws = new Set([
        ...directImpact.map(i => i.lawId),
        ...indirectImpact.map(i => i.lawId),
        ...crossLawImpact.map(i => i.lawId)
      ]);

      return {
        targetLaw: lawId,
        targetArticle: articleNumber,
        directImpact,
        indirectImpact,
        crossLawImpact,
        totalImpactedArticles: allImpactedArticles.size,
        totalImpactedLaws: allImpactedLaws.size,
        criticalDependencies
      };

    } finally {
      await session.close();
    }
  }

  /**
   * 影響分析結果のサマリーを出力
   */
  private printImpactSummary(result: ImpactAnalysisResult, description: string): void {
    console.log(`\n📊 ${description} の影響範囲:`);
    console.log(`  直接影響: ${result.directImpact.length}条文`);
    console.log(`  間接影響: ${result.indirectImpact.length}条文`);
    console.log(`  他法令影響: ${result.crossLawImpact.length}条文`);
    console.log(`  影響法令数: ${result.totalImpactedLaws}法令`);
    console.log(`  影響条文総数: ${result.totalImpactedArticles}条文`);

    if (result.criticalDependencies.length > 0) {
      console.log('\n  ⚠️ 重要な依存関係:');
      result.criticalDependencies.slice(0, 3).forEach(dep => {
        console.log(`    - ${dep.lawTitle || dep.lawId} 第${dep.articleNumber}条 (${dep.referenceText})`);
      });
    }
  }

  /**
   * HTMLレポートの生成
   */
  private async generateReport(results: ImpactAnalysisResult[]): Promise<void> {
    const reportDir = path.join(process.cwd(), 'validation-reports');
    await fs.mkdir(reportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const reportPath = path.join(reportDir, `hane-kaisei-report-${timestamp}.html`);

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ハネ改正影響分析レポート</title>
  <style>
    body { font-family: 'メイリオ', sans-serif; margin: 20px; background: #f5f5f5; }
    .header { background: #2c3e50; color: white; padding: 20px; margin-bottom: 20px; }
    .summary { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .analysis { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .impact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .impact-card { background: #f8f9fa; padding: 10px; border-radius: 4px; }
    .direct { border-left: 4px solid #e74c3c; }
    .indirect { border-left: 4px solid #f39c12; }
    .crosslaw { border-left: 4px solid #3498db; }
    .critical { background: #ffe6e6; border-left: 4px solid #c0392b; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #ecf0f1; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat-box { text-align: center; padding: 15px; background: #ecf0f1; border-radius: 8px; }
    .stat-number { font-size: 2em; font-weight: bold; color: #2c3e50; }
    .stat-label { color: #7f8c8d; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 ハネ改正影響分析レポート</h1>
    <p>生成日時: ${new Date().toLocaleString('ja-JP')}</p>
  </div>

  <div class="summary">
    <h2>📊 分析サマリー</h2>
    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${results.length}</div>
        <div class="stat-label">分析対象条文</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${results.reduce((sum, r) => sum + r.totalImpactedArticles, 0)}</div>
        <div class="stat-label">総影響条文数</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${results.reduce((sum, r) => sum + r.totalImpactedLaws, 0)}</div>
        <div class="stat-label">総影響法令数</div>
      </div>
    </div>
  </div>

  ${results.map(result => `
    <div class="analysis">
      <h2>📋 ${result.targetLaw} 第${result.targetArticle}条の影響分析</h2>
      
      <div class="impact-grid">
        <div class="impact-card direct">
          <h3>直接影響</h3>
          <p>${result.directImpact.length}条文</p>
        </div>
        <div class="impact-card indirect">
          <h3>間接影響</h3>
          <p>${result.indirectImpact.length}条文</p>
        </div>
        <div class="impact-card crosslaw">
          <h3>他法令影響</h3>
          <p>${result.crossLawImpact.length}条文</p>
        </div>
      </div>

      ${result.criticalDependencies.length > 0 ? `
        <div class="impact-card critical" style="margin-top: 15px;">
          <h3>⚠️ 重要な依存関係</h3>
          <ul>
            ${result.criticalDependencies.slice(0, 5).map(dep => `
              <li>${dep.lawTitle || dep.lawId} 第${dep.articleNumber}条 - ${dep.referenceText || ''}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${result.directImpact.length > 0 ? `
        <h3>直接参照している条文（上位10件）</h3>
        <table>
          <thead>
            <tr>
              <th>法令</th>
              <th>条文</th>
              <th>参照タイプ</th>
              <th>参照テキスト</th>
            </tr>
          </thead>
          <tbody>
            ${result.directImpact.slice(0, 10).map(item => `
              <tr>
                <td>${item.lawTitle || item.lawId}</td>
                <td>第${item.articleNumber}条</td>
                <td>${item.referenceType}</td>
                <td>${item.referenceText || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      ${result.crossLawImpact.length > 0 ? `
        <h3>他法令への影響（上位10件）</h3>
        <table>
          <thead>
            <tr>
              <th>法令</th>
              <th>条文</th>
              <th>参照タイプ</th>
            </tr>
          </thead>
          <tbody>
            ${result.crossLawImpact.slice(0, 10).map(item => `
              <tr>
                <td>${item.lawTitle || item.lawId}</td>
                <td>第${item.articleNumber}条</td>
                <td>${item.referenceType}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `).join('')}

  <div class="summary">
    <h2>🎯 分析結果の解釈</h2>
    <p>このレポートは、特定の法令条文を改正した場合の波及的影響（ハネ改正）を示しています。</p>
    <ul>
      <li><strong>直接影響</strong>: 改正対象の条文を直接参照している他の条文</li>
      <li><strong>間接影響</strong>: 2段階の参照関係を持つ条文</li>
      <li><strong>他法令影響</strong>: 異なる法令からの参照</li>
      <li><strong>重要な依存関係</strong>: 多数の条文から参照されている中継点となる条文</li>
    </ul>
    <p>影響範囲が大きい条文の改正時は、関連する全ての条文への影響を慎重に検討する必要があります。</p>
  </div>
</body>
</html>
    `;

    await fs.writeFile(reportPath, html, 'utf-8');
    console.log(`\n✅ レポートを生成しました: ${reportPath}`);
  }

  async cleanup(): Promise<void> {
    await this.driver.close();
    await this.prisma.$disconnect();
  }
}

// メイン実行
async function main() {
  const analyzer = new HaneKaiseiAnalyzer();
  
  try {
    await analyzer.analyzeMainLaws();
  } finally {
    await analyzer.cleanup();
  }
}

main()
  .then(() => {
    console.log('\n✅ ハネ改正影響分析が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });