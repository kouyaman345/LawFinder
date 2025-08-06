import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDbStatus() {
  try {
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    const paragraphCount = await prisma.paragraph.count();

    console.log('📊 データベース状態:');
    console.log(`  法令数: ${lawCount}`);
    console.log(`  条文数: ${articleCount}`);
    console.log(`  項数: ${paragraphCount}`);

    if (lawCount > 0) {
      console.log('\n📚 保存済み法令:');
      const laws = await prisma.law.findMany({
        select: {
          id: true,
          title: true,
          _count: {
            select: { articles: true }
          }
        }
      });
      
      for (const law of laws) {
        console.log(`  - ${law.title} (${law.id}): ${law._count.articles}条`);
      }
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDbStatus();