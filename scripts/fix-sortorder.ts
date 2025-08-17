#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 漢数字を数値に変換
function kanjiToNumber(kanji: string): number {
  const map: { [key: string]: number } = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000
  };
  
  if (kanji.includes(':')) {
    // 範囲表記の場合は開始番号を使用
    const start = kanji.split(':')[0];
    return parseInt(start, 10);
  }
  
  let result = 0;
  let temp = 0;
  let inHundreds = false;
  
  for (let i = 0; i < kanji.length; i++) {
    const char = kanji[i];
    const num = map[char];
    
    if (!num) continue;
    
    if (num === 100) {
      if (temp === 0) temp = 1;
      result += temp * 100;
      temp = 0;
      inHundreds = true;
    } else if (num === 10) {
      if (temp === 0) temp = 1;
      if (inHundreds) {
        result += temp * 10;
      } else {
        result += temp * 10;
      }
      temp = 0;
    } else {
      temp = num;
    }
  }
  
  return result + temp;
}

async function fixAll() {
  const articles = await prisma.article.findMany({
    where: { 
      lawId: '132AC0000000048',
      sortOrder: 0
    }
  });
  
  console.log(`sortOrderが0の条文: ${articles.length}件`);
  
  let fixCount = 0;
  for (const article of articles) {
    const num = kanjiToNumber(article.articleNumber);
    if (num > 0) {
      await prisma.article.update({
        where: { id: article.id },
        data: { sortOrder: num }
      });
      console.log(`✅ 第${article.articleNumber}条 -> sortOrder: ${num}`);
      fixCount++;
    }
  }
  
  console.log(`\n合計${fixCount}件を修正しました`);
  
  // 確認
  const check = await prisma.article.findMany({
    where: { lawId: '132AC0000000048' },
    orderBy: { sortOrder: 'asc' },
    take: 20
  });
  
  console.log('\n修正後の最初の20件:');
  check.forEach(a => {
    console.log(`sortOrder: ${String(a.sortOrder).padStart(4, ' ')} | 第${a.articleNumber}条`);
  });
}

fixAll()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('エラー:', error);
    prisma.$disconnect();
    process.exit(1);
  });