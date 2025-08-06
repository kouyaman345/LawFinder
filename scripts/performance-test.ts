import { PrismaClient } from '../src/generated/prisma';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

async function performanceTest() {
  console.log('🚀 パフォーマンステストを開始します\n');

  // 1. 法令一覧の取得速度
  console.log('1️⃣ 法令一覧取得テスト');
  const listStart = performance.now();
  const laws = await prisma.law.findMany({
    select: {
      id: true,
      title: true,
      _count: { select: { articles: true } }
    }
  });
  const listTime = performance.now() - listStart;
  console.log(`  ✅ ${laws.length}件の法令を ${listTime.toFixed(2)}ms で取得\n`);

  // 2. 個別法令の詳細取得速度（民法）
  console.log('2️⃣ 個別法令詳細取得テスト（民法）');
  const detailStart = performance.now();
  const civilCode = await prisma.law.findUnique({
    where: { id: '129AC0000000089' },
    include: {
      articles: {
        include: {
          paragraphs: {
            include: { items: true }
          },
          referencesFrom: true
        }
      }
    }
  });
  const detailTime = performance.now() - detailStart;
  console.log(`  ✅ 民法の詳細（${civilCode?.articles.length}条）を ${detailTime.toFixed(2)}ms で取得\n`);

  // 3. 参照関係の検索速度
  console.log('3️⃣ 参照関係検索テスト');
  const refStart = performance.now();
  const references = await prisma.reference.findMany({
    where: {
      referenceType: 'external',
      targetLawName: '民法'
    },
    take: 100
  });
  const refTime = performance.now() - refStart;
  console.log(`  ✅ ${references.length}件の民法への参照を ${refTime.toFixed(2)}ms で取得\n`);

  // 4. 検索クエリの速度
  console.log('4️⃣ 法令検索テスト');
  const searchStart = performance.now();
  const searchResults = await prisma.law.findMany({
    where: {
      OR: [
        { title: { contains: '法' } },
        { lawNumber: { contains: '昭和' } }
      ]
    },
    select: {
      id: true,
      title: true,
      lawNumber: true
    }
  });
  const searchTime = performance.now() - searchStart;
  console.log(`  ✅ ${searchResults.length}件の検索結果を ${searchTime.toFixed(2)}ms で取得\n`);

  // 5. 統計情報
  console.log('5️⃣ データベース統計');
  const [lawCount, articleCount, referenceCount] = await Promise.all([
    prisma.law.count(),
    prisma.article.count(),
    prisma.reference.count()
  ]);
  console.log(`  📊 法令数: ${lawCount}`);
  console.log(`  📊 条文数: ${articleCount}`);
  console.log(`  📊 参照関係数: ${referenceCount}\n`);

  // 総合評価
  console.log('📈 総合評価:');
  const totalTime = listTime + detailTime + refTime + searchTime;
  console.log(`  ⏱️  総処理時間: ${totalTime.toFixed(2)}ms`);
  console.log(`  🚀 平均レスポンス時間: ${(totalTime / 4).toFixed(2)}ms`);
  
  if (totalTime < 1000) {
    console.log('  ✨ 優秀なパフォーマンスです！');
  } else if (totalTime < 3000) {
    console.log('  ✅ 良好なパフォーマンスです');
  } else {
    console.log('  ⚠️  パフォーマンスの改善が必要かもしれません');
  }

  await prisma.$disconnect();
}

performanceTest().catch(console.error);