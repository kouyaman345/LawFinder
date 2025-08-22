import prisma from '../../src/lib/prisma';
import LawsListClient from '../components/LawsListClient';

export default async function LawListPage() {
  // サーバーサイドでデータベースから法令を取得
  // LawMasterとLawVersionの新スキーマに対応
  const lawMasters = await prisma.lawMaster.findMany({
    orderBy: { title: 'asc' },
    include: {
      currentVersion: {
        select: {
          promulgationDate: true,
          versionDate: true,
          _count: {
            select: {
              articles: true
            }
          }
        }
      }
    }
  });
  
  // 参照数を別途取得
  const references = await prisma.reference.groupBy({
    by: ['sourceLawId'],
    _count: {
      _all: true
    }
  });
  
  const referenceMap = new Map(references.map(r => [r.sourceLawId, r._count._all]));
  
  // データを整形
  const laws = lawMasters.map(lm => ({
    id: lm.id,
    title: lm.title,
    lawNumber: lm.lawNumber,
    promulgationDate: lm.currentVersion?.promulgationDate || null,
    enforcementDate: lm.currentVersion?.versionDate || null,
    category: lm.lawType || '未分類',
    _count: {
      articles: lm.currentVersion?._count?.articles || 0,
      references: referenceMap.get(lm.id) || 0
    }
  }));

  // カテゴリ別の集計
  const categories = laws.reduce((acc, law) => {
    const cat = law.category || '未分類';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // クライアントコンポーネントにデータを渡す
  return <LawsListClient initialLaws={laws} />;
}