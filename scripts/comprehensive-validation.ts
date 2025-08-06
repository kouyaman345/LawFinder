#!/usr/bin/env npx tsx
/**
 * 包括的な参照検出検証
 * データベース内の全法令で参照検出を実行し、統計を出力
 */

import { PrismaClient } from '@prisma/client';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

interface ValidationStats {
  totalLaws: number;
  totalArticles: number;
  totalReferences: number;
  referencesByType: Record<string, number>;
  averageReferencesPerLaw: number;
  averageReferencesPerArticle: number;
  lawsWithMostReferences: Array<{ id: string; title: string; count: number }>;
  processingTime: number;
}

async function runComprehensiveValidation(): Promise<ValidationStats> {
  console.log('🔍 包括的な参照検出検証を開始します...\n');
  const startTime = performance.now();
  
  const stats: ValidationStats = {
    totalLaws: 0,
    totalArticles: 0,
    totalReferences: 0,
    referencesByType: {},
    averageReferencesPerLaw: 0,
    averageReferencesPerArticle: 0,
    lawsWithMostReferences: [],
    processingTime: 0
  };
  
  // 全法令を取得
  const laws = await prisma.law.findMany({
    include: {
      articles: true
    }
  });
  
  stats.totalLaws = laws.length;
  console.log(`📚 ${stats.totalLaws}件の法令を処理します\n`);
  
  const lawReferenceCounts: Array<{ id: string; title: string; count: number }> = [];
  
  // 各法令で参照検出
  for (const law of laws) {
    let lawReferenceCount = 0;
    
    for (const article of law.articles) {
      stats.totalArticles++;
      
      // 参照検出
      const references = detector.detectAllReferences(article.content);
      lawReferenceCount += references.length;
      stats.totalReferences += references.length;
      
      // タイプ別集計
      for (const ref of references) {
        stats.referencesByType[ref.type] = (stats.referencesByType[ref.type] || 0) + 1;
      }
    }
    
    lawReferenceCounts.push({
      id: law.id,
      title: law.title,
      count: lawReferenceCount
    });
    
    // 進捗表示
    if (laws.indexOf(law) % 10 === 0) {
      const progress = Math.round((laws.indexOf(law) / laws.length) * 100);
      console.log(`進捗: ${progress}% (${laws.indexOf(law)}/${laws.length})`);
    }
  }
  
  // 統計計算
  stats.averageReferencesPerLaw = stats.totalReferences / stats.totalLaws;
  stats.averageReferencesPerArticle = stats.totalReferences / stats.totalArticles;
  
  // 参照が多い法令トップ10
  lawReferenceCounts.sort((a, b) => b.count - a.count);
  stats.lawsWithMostReferences = lawReferenceCounts.slice(0, 10);
  
  stats.processingTime = (performance.now() - startTime) / 1000;
  
  return stats;
}

function printStats(stats: ValidationStats): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 包括的検証結果');
  console.log('='.repeat(80));
  
  console.log('\n【基本統計】');
  console.log(`法令数: ${stats.totalLaws.toLocaleString()}`);
  console.log(`条文数: ${stats.totalArticles.toLocaleString()}`);
  console.log(`検出参照数: ${stats.totalReferences.toLocaleString()}`);
  console.log(`平均参照数（法令あたり）: ${stats.averageReferencesPerLaw.toFixed(1)}`);
  console.log(`平均参照数（条文あたり）: ${stats.averageReferencesPerArticle.toFixed(1)}`);
  
  console.log('\n【参照タイプ別統計】');
  const sortedTypes = Object.entries(stats.referencesByType)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [type, count] of sortedTypes) {
    const percentage = ((count / stats.totalReferences) * 100).toFixed(1);
    console.log(`  ${type}: ${count.toLocaleString()}件 (${percentage}%)`);
  }
  
  console.log('\n【参照が多い法令トップ10】');
  stats.lawsWithMostReferences.forEach((law, index) => {
    console.log(`  ${index + 1}. ${law.title} (${law.id}): ${law.count}件`);
  });
  
  console.log(`\n処理時間: ${stats.processingTime.toFixed(2)}秒`);
  console.log('処理速度: ' + (stats.totalLaws / stats.processingTime).toFixed(1) + '法令/秒');
}

// メイン実行
if (require.main === module) {
  runComprehensiveValidation()
    .then(stats => {
      printStats(stats);
      return prisma.$disconnect();
    })
    .then(() => {
      console.log('\n✅ 検証が完了しました');
      process.exit(0);
    })
    .catch(async error => {
      console.error('❌ エラー:', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { runComprehensiveValidation };