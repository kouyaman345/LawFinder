#!/usr/bin/env npx tsx

/**
 * 究極の参照検出エンジン簡易テスト
 */

import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

const prisma = new PrismaClient();

// UltimateReferenceDetectorのシンプル版
class SimpleUltimateDetector {
  private readonly LAW_DICTIONARY: Record<string, string> = {
    '民法': '129AC0000000089',
    '商法': '132AC0000000048',
    '刑法': '140AC0000000045',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '刑事訴訟法': '323AC0000000131',
    '民事訴訟法': '408AC0000000109',
  };

  detectReferences(text: string) {
    const references = [];
    
    // Phase 1: パターン検出
    const pattern = /([^、。\s（）]*法)(?:（[^）]+）)?(?:第([一二三四五六七八九十百千]+)条)?/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1];
      const lawId = this.LAW_DICTIONARY[lawName];
      
      if (lawId) {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: lawId,
          targetArticle: match[2] ? `第${match[2]}条` : null,
          confidence: 0.95,
          resolutionMethod: 'pattern'
        });
      }
    }
    
    return references;
  }
}

async function runQuickTest() {
  console.log(chalk.cyan('\n🚀 簡易統合テスト'));
  console.log('='.repeat(60));

  const detector = new SimpleUltimateDetector();

  // テストケース
  const testCases = [
    '民法第90条の規定により',
    '商法（明治32年法律第48号）の規定',
    '会社法第309条第2項',
    '刑法第199条及び第200条',
    '労働基準法における労働時間',
  ];

  console.log(chalk.yellow('\n📝 テストケース:'));
  
  for (const testCase of testCases) {
    console.log(`\n入力: "${testCase}"`);
    const refs = detector.detectReferences(testCase);
    
    if (refs.length > 0) {
      console.log(chalk.green('✓ 検出成功:'));
      for (const ref of refs) {
        console.log(`  - ${ref.targetLaw} (${ref.targetLawId})`);
        if (ref.targetArticle) {
          console.log(`    条文: ${ref.targetArticle}`);
        }
      }
    } else {
      console.log(chalk.red('✗ 検出失敗'));
    }
  }

  // データベース検証
  console.log(chalk.cyan('\n📊 データベース連携テスト:'));
  
  try {
    const law = await prisma.law.findFirst({
      where: { lawId: '129AC0000000089' },
      include: {
        articles: {
          take: 1,
          include: { paragraphs: true }
        }
      }
    });

    if (law) {
      console.log(chalk.green(`✓ 法令データ取得成功: ${law.title}`));
      
      if (law.articles.length > 0 && law.articles[0].paragraphs.length > 0) {
        const paragraph = law.articles[0].paragraphs[0];
        console.log(`\n条文サンプル: "${paragraph.content.substring(0, 100)}..."`);
        
        const refs = detector.detectReferences(paragraph.content);
        console.log(`検出された参照: ${refs.length}件`);
      }
    } else {
      console.log(chalk.yellow('⚠️ 民法データが見つかりません'));
    }
  } catch (error) {
    console.error(chalk.red('データベースエラー:'), error);
  }

  await prisma.$disconnect();
}

runQuickTest().catch(console.error);