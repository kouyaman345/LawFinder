import { PrismaClient } from '../../src/generated/prisma';
import LawsListClient from '../components/LawsListClient';

const prisma = new PrismaClient();

export default async function LawListPage() {
  // サーバーサイドでデータベースから法令を取得
  const laws = await prisma.law.findMany({
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      lawNumber: true,
      _count: {
        select: { articles: true }
      }
    }
  });

  // クライアントコンポーネントにデータを渡す
  return <LawsListClient initialLaws={laws} />;
}