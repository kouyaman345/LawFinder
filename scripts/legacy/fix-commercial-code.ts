#!/usr/bin/env npx tsx
/**
 * 商法のデータを修正するスクリプト
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 漢数字を数値に変換
function kanjiToNumber(kanji: string): number {
  const map: { [key: string]: number } = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000
  };
  
  let result = 0;
  let temp = 0;
  
  for (const char of kanji) {
    const num = map[char];
    if (!num) continue;
    
    if (num >= 10) {
      result += (temp || 1) * num;
      temp = 0;
    } else {
      temp = temp * 10 + num;
    }
  }
  
  return result + temp;
}

async function fixCommercialCode() {
  console.log('商法のデータを修正中...');
  
  // 商法の第1条を確認
  const article1 = await prisma.article.findFirst({
    where: {
      lawId: '132AC0000000048',
      articleNumber: '一'
    }
  });
  
  if (article1) {
    // 第1条を正しく更新
    await prisma.article.update({
      where: { id: article1.id },
      data: {
        articleTitle: '（趣旨等）',
        isDeleted: false,
        sortOrder: 1
      }
    });
    console.log('✅ 第1条を修正しました');
  }
  
  // 全条文を取得
  const allArticles = await prisma.article.findMany({
    where: { lawId: '132AC0000000048' },
    orderBy: { id: 'asc' }
  });
  
  console.log(`\n商法の条文数: ${allArticles.length}`);
  
  // 各条文のsortOrderを設定
  let updateCount = 0;
  let deleteCount = 0;
  
  for (const article of allArticles) {
    // 削除条文の範囲表記は特別処理
    if (article.articleNumber.includes(':')) {
      const parts = article.articleNumber.split(':');
      const startNum = parseInt(parts[0], 10);
      
      // 削除フラグを設定
      await prisma.article.update({
        where: { id: article.id },
        data: { 
          isDeleted: true,
          sortOrder: startNum,
          articleTitle: '削除'
        }
      });
      deleteCount++;
      continue;
    }
    
    // 通常の条文
    const num = kanjiToNumber(article.articleNumber);
    if (num > 0 && article.sortOrder !== num) {
      await prisma.article.update({
        where: { id: article.id },
        data: { sortOrder: num }
      });
      updateCount++;
    }
    
    // 削除条文の判定（内容が「削除」のみの場合）
    if (article.articleTitle === '削除' && !article.isDeleted) {
      await prisma.article.update({
        where: { id: article.id },
        data: { isDeleted: true }
      });
      deleteCount++;
    }
  }
  
  console.log(`✅ ${updateCount}件のsortOrderを修正しました`);
  console.log(`✅ ${deleteCount}件を削除条文として設定しました`);
  
  // 確認
  const check = await prisma.article.findMany({
    where: {
      lawId: '132AC0000000048',
      sortOrder: { in: [1, 587, 618, 683] }
    },
    orderBy: { sortOrder: 'asc' }
  });
  
  console.log('\n確認（第1条、第587条、第618条、第683条）:');
  for (const article of check) {
    const status = article.isDeleted ? '【削除】' : '';
    console.log(`  第${article.articleNumber}条 ${status} - ${article.articleTitle}`);
  }
}

// 実行
if (require.main === module) {
  fixCommercialCode()
    .then(() => prisma.$disconnect())
    .catch((error) => {
      console.error('❌ エラー:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}