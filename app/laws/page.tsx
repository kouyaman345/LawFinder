'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Law {
  id: string;
  title: string;
  lawNumber: string | null;
  promulgationDate: string | null;
  effectiveDate: string | null;
  _count: {
    articles: number;
  };
}

interface ApiResponse {
  data: Law[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function LawListPage() {
  const [laws, setLaws] = useState<Law[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchLaws();
  }, [page, search]);

  const fetchLaws = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
      });
      
      const response = await fetch(`/api/laws?${params}`);
      const data: ApiResponse = await response.json();
      
      setLaws(data.data);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching laws:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLaws();
  };

  return (
    <div className="min-h-screen">
      <header className="egov-header">
        <div className="egov-container">
          <h1 className="text-2xl font-bold">法令一覧</h1>
        </div>
      </header>

      <nav className="egov-nav">
        <div className="egov-container py-3">
          <div className="flex space-x-6">
            <Link href="/" className="hover:text-egov-blue">ホーム</Link>
            <Link href="/laws" className="hover:text-egov-blue font-bold">法令一覧</Link>
            <Link href="/search" className="hover:text-egov-blue">検索</Link>
            <Link href="/references" className="hover:text-egov-blue">参照関係</Link>
          </div>
        </div>
      </nav>

      <main className="egov-container py-8">
        <form onSubmit={handleSearchSubmit} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="法令名または法令番号で検索"
              className="flex-1 px-4 py-2 border border-egov-border rounded"
            />
            <button type="submit" className="egov-button">
              検索
            </button>
          </div>
        </form>

        {loading ? (
          <div className="text-center py-8">読み込み中...</div>
        ) : (
          <>
            <div className="egov-card">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">法令名</th>
                    <th className="text-left py-2">法令番号</th>
                    <th className="text-left py-2">条文数</th>
                    <th className="text-left py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {laws.map((law) => (
                    <tr key={law.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <Link
                          href={`/laws/${law.id}`}
                          className="text-egov-blue hover:underline"
                        >
                          {law.title}
                        </Link>
                      </td>
                      <td className="py-3">{law.lawNumber || '-'}</td>
                      <td className="py-3">{law._count.articles}条</td>
                      <td className="py-3">
                        <Link
                          href={`/laws/${law.id}`}
                          className="text-sm egov-button"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  前へ
                </button>
                <span className="px-3 py-1">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}