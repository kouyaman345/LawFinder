'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Law {
  id: string;
  title: string;
  lawNumber: string | null;
  _count: {
    articles: number;
  };
}

interface LawsListClientProps {
  initialLaws: Law[];
}

export default function LawsListClient({ initialLaws }: LawsListClientProps) {
  const [laws, setLaws] = useState(initialLaws);
  const [search, setSearch] = useState('');
  const [filteredLaws, setFilteredLaws] = useState(initialLaws);

  useEffect(() => {
    // 検索フィルタリング
    if (search) {
      const filtered = laws.filter(law => 
        law.title.includes(search) || 
        (law.lawNumber && law.lawNumber.includes(search))
      );
      setFilteredLaws(filtered);
    } else {
      setFilteredLaws(laws);
    }
  }, [search, laws]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  // 総条文数を計算
  const totalArticles = filteredLaws.reduce((sum, law) => sum + law._count.articles, 0);

  return (
    <>
      {/* ヘッダー */}
      <div className="gov-header">
        <div className="header-container">
          <h1 className="site-title">LawFinder 法令検索</h1>
          <nav className="header-nav">
            <Link href="/">ホーム</Link>
            <Link href="/laws">法令検索</Link>
            <Link href="#">新規制定・改正法令</Link>
          </nav>
        </div>
      </div>

      {/* パンくずリスト */}
      <div className="breadcrumb">
        <div className="container">
          <Link href="/">ホーム</Link>
          <span> &gt; </span>
          <span>法令一覧</span>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="container" style={{ marginTop: 30, marginBottom: 50 }}>
        <h1 className="law-title" style={{ marginBottom: 30 }}>法令一覧</h1>

        {/* 検索フォーム */}
        <div style={{ background: 'white', padding: 20, border: '1px solid #ddd', marginBottom: 30 }}>
          <form onSubmit={handleSearchSubmit}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="法令名または法令番号で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
              <button
                type="submit"
                className="btn-outline"
                style={{ padding: '8px 20px' }}
              >
                検索
              </button>
            </div>
          </form>
        </div>

        {/* 法令一覧テーブル */}
        <div style={{ background: 'white', border: '1px solid #ddd' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 'bold' }}>法令名</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 'bold' }}>法令番号</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 'bold', width: 100 }}>条文数</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 'bold', width: 100 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredLaws.map((law) => (
                <tr key={law.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 12 }}>
                    <Link href={`/laws/${law.id}`} style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 'bold' }}>
                      {law.title}
                    </Link>
                  </td>
                  <td style={{ padding: 12, fontSize: 14, color: '#666' }}>
                    {law.lawNumber || '-'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', fontSize: 14 }}>
                    {law._count.articles}条
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <Link 
                      href={`/laws/${law.id}`} 
                      className="btn-outline"
                      style={{ padding: '4px 16px', fontSize: 13, display: 'inline-block', textDecoration: 'none' }}
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 統計情報 */}
        <div style={{ marginTop: 30, display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, background: 'white', border: '1px solid #ddd', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#003f8e' }}>{filteredLaws.length}</div>
            <div style={{ fontSize: 14, color: '#666', marginTop: 5 }}>表示中の法令数</div>
          </div>
          <div style={{ flex: 1, background: 'white', border: '1px solid #ddd', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#003f8e' }}>{totalArticles.toLocaleString()}</div>
            <div style={{ fontSize: 14, color: '#666', marginTop: 5 }}>総条文数</div>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="home-footer">
        <div className="container">
          <div className="footer-content">
            <p>LawFinder - 日本法令検索システム</p>
            <p>データベース版（高速化対応）</p>
          </div>
        </div>
      </footer>
    </>
  );
}