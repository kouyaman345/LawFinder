#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    const lawCount = await prisma.law.count();
    console.log(`法令数: ${lawCount}`);
    
    if (lawCount > 0) {
      const laws = await prisma.law.findMany({
        take: 5,
        select: {
          id: true,
          title: true,
          articles: {
            select: {
              id: true
            }
          }
        }
      });
      
      console.log('\nサンプル法令:');
      laws.forEach(law => {
        console.log(`- ${law.id}: ${law.title} (${law.articles.length}条)`);
      });
    } else {
      console.log('データベースに法令データがありません。');
      console.log('データをインポートしてください: npm run import:sample');
    }
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();