#!/usr/bin/env tsx

/**
 * e-govの正解データと参照検出を比較検証
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyWithEGov() {
  console.log('='.repeat(80));
  console.log('📊 e-govとの参照検出比較検証');
  console.log('='.repeat(80));
  
  // テストケース：商法（132AC0000000048）
  const testLawId = '132AC0000000048';
  const egovUrl = `https://laws.e-gov.go.jp/law/${testLawId}`;
  
  console.log(`\n🔍 検証対象: 商法`);
  console.log(`  法令ID: ${testLawId}`);
  console.log(`  e-Gov URL: ${egovUrl}\n`);
  
  try {
    // 1. e-govから参照データを取得
    console.log('📥 e-govから参照データを取得中...');
    
    // WebFetchを使ってe-govのページから参照リンクを抽出
    const egovPrompt = `
      このe-Gov法令ページから以下を抽出してください：
      
      1. 他の法令への参照リンク（青色のリンク）の数
      2. 最初の10個の参照リンクについて：
         - リンクテキスト（例：「民法第九十条」）
         - リンク先の法令ID（URLから抽出）
         - どの条文から参照しているか
      
      JSON形式で返してください：
      {
        "totalLinks": 数値,
        "references": [
          {
            "text": "リンクテキスト",
            "targetLawId": "法令ID",
            "sourceArticle": "参照元の条文"
          }
        ]
      }
    `;
    
    // 実際のe-govデータ取得はWebFetchツールで行う
    console.log(`  URL: ${egovUrl}`);
    console.log('  ※ブラウザで確認することをお勧めします\n');
    
    // 2. データベースから検出結果を取得
    console.log('📊 データベースの検出結果を取得中...');
    
    // 商法の参照データを取得
    const ourReferences = await prisma.reference.findMany({
      where: {
        sourceLawId: testLawId,
        referenceType: 'external'
      },
      take: 20
    });
    
    console.log(`  検出した外部参照: ${ourReferences.length}件\n`);
    
    // 3. サンプル比較
    console.log('📝 検出結果サンプル:');
    ourReferences.slice(0, 10).forEach((ref, i) => {
      console.log(`  ${i + 1}. ${ref.referenceText}`);
      console.log(`     → ${ref.targetLawId || '(未特定)'}`);
    });
    
    // 4. 全体統計
    const stats = await prisma.reference.groupBy({
      by: ['referenceType'],
      where: {
        sourceLawId: testLawId
      },
      _count: true
    });
    
    console.log('\n📊 商法の参照統計:');
    stats.forEach(stat => {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    });
    
    // 5. 主要法令への参照を確認
    const majorLaws = {
      '民法': '129AC0000000089',
      '会社法': '417AC0000000086',
      '民事訴訟法': '408AC0000000109'
    };
    
    console.log('\n🔗 主要法令への参照:');
    for (const [name, id] of Object.entries(majorLaws)) {
      const count = await prisma.reference.count({
        where: {
          sourceLawId: testLawId,
          targetLawId: id
        }
      });
      console.log(`  ${name}への参照: ${count}件`);
    }
    
    // 6. 検証手順の提案
    console.log('\n' + '='.repeat(80));
    console.log('📋 検証手順:');
    console.log('1. ブラウザで以下のURLを開く:');
    console.log(`   ${egovUrl}`);
    console.log('\n2. ページ内の青色リンク（他法令への参照）を確認');
    console.log('   - リンクの数');
    console.log('   - どの法令を参照しているか');
    console.log('   - 特に民法、会社法への参照');
    console.log('\n3. 上記の検出結果と比較');
    console.log('   - 見逃している参照はないか');
    console.log('   - 誤検出はないか');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 特定の条文で詳細比較
async function detailedArticleComparison() {
  console.log('\n📖 商法第1条の詳細比較');
  console.log('-'.repeat(40));
  
  // 商法第1条の内容と参照を取得
  const article = await prisma.article.findFirst({
    where: {
      versionId: { startsWith: '132AC0000000048' },
      articleNumber: '第一条'
    }
  });
  
  if (article) {
    console.log('条文内容:');
    console.log(article.content.substring(0, 200) + '...\n');
    
    // この条文からの参照
    const refs = await prisma.reference.findMany({
      where: {
        sourceLawId: '132AC0000000048',
        sourceArticle: '第一条'
      }
    });
    
    console.log(`検出した参照: ${refs.length}件`);
    refs.forEach(ref => {
      console.log(`  - ${ref.referenceText} (${ref.referenceType})`);
    });
  }
  
  await prisma.$disconnect();
}

// メイン処理
async function main() {
  await verifyWithEGov();
  await detailedArticleComparison();
}

main().catch(console.error);