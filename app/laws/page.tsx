'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// サンプルデータ（APIが実装されるまでの仮データ）
const sampleLaws = [
  { id: '129AC0000000089', title: '民法', lawNumber: '明治二十九年法律第八十九号', _count: { articles: 1050 } },
  { id: '132AC0000000048', title: '商法', lawNumber: '明治三十二年法律第四十八号', _count: { articles: 457 } },
  { id: '140AC0000000045', title: '刑法', lawNumber: '明治四十年法律第四十五号', _count: { articles: 264 } },
  { id: '417AC0000000086', title: '会社法', lawNumber: '平成十七年法律第八十六号', _count: { articles: 1152 } },
  { id: '322AC0000000049', title: '労働基準法', lawNumber: '昭和二十二年法律第四十九号', _count: { articles: 138 } },
  { id: '323AC0000000131', title: '独占禁止法', lawNumber: '昭和二十二年法律第五十四号', _count: { articles: 128 } },
  { id: '222AC0000000067', title: '民事訴訟法', lawNumber: '平成八年法律第百九号', _count: { articles: 405 } },
  { id: '155AC0000000048', title: '消費税法', lawNumber: '昭和六十三年法律第百八号', _count: { articles: 72 } }
];

export default function LawListPage() {
  const [laws, setLaws] = useState(sampleLaws);
  const [search, setSearch] = useState('');
  const [filteredLaws, setFilteredLaws] = useState(sampleLaws);

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
      <main className="container" style={{ marginTop: '30px', marginBottom: '50px' }}>
        <h1 className="law-title" style={{ marginBottom: '30px' }}>法令一覧</h1>

        {/* 検索フォーム */}
        <div style={{ background: 'white', padding: '20px', border: '1px solid #ddd', marginBottom: '30px' }}>
          <form onSubmit={handleSearchSubmit}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="法令名または法令番号で検索"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>法令名</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>法令番号</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '100px' }}>条文数</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '100px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredLaws.map((law) => (
                <tr key={law.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <Link
                      href={`/laws/${law.id}`}
                      style={{
                        color: '#0066cc',
                        textDecoration: 'none',
                        fontWeight: 'bold'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {law.title}
                    </Link>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>
                    {law.lawNumber || '-'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px' }}>
                    {law._count.articles}条
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <Link
                      href={`/laws/${law.id}`}
                      className="btn-outline"
                      style={{
                        padding: '4px 16px',
                        fontSize: '13px',
                        display: 'inline-block',
                        textDecoration: 'none'
                      }}
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredLaws.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              検索条件に一致する法令が見つかりませんでした。
            </div>
          )}
        </div>

        {/* 統計情報 */}
        <div style={{ marginTop: '30px', display: 'flex', gap: '20px' }}>
          <div style={{ 
            flex: 1, 
            background: 'white', 
            border: '1px solid #ddd', 
            padding: '20px',
            textAlign: 'center' 
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#003f8e' }}>
              {filteredLaws.length}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
              表示中の法令数
            </div>
          </div>
          <div style={{ 
            flex: 1, 
            background: 'white', 
            border: '1px solid #ddd', 
            padding: '20px',
            textAlign: 'center' 
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#003f8e' }}>
              {filteredLaws.reduce((sum, law) => sum + law._count.articles, 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
              総条文数
            </div>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="home-footer">
        <div className="container">
          <div className="footer-content">
            <p>LawFinder - 日本法令検索システム</p>
            <p>ローカルLLM: Mistral（実LLM版）</p>
          </div>
        </div>
      </footer>
    </>
  );
}