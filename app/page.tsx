import Link from 'next/link';

export default function HomePage() {
  // サンプル法令データ
  const sampleLaws = [
    { id: '129AC0000000089', title: '民法', number: '明治二十九年法律第八十九号', refCount: 1 },
    { id: '132AC0000000048', title: '商法', number: '明治三十二年法律第四十八号', refCount: 832 },
    { id: '140AC0000000045', title: '刑法', number: '明治四十年法律第四十五号', refCount: 178 },
    { id: '417AC0000000086', title: '会社法', number: '平成十七年法律第八十六号', refCount: 2136 },
    { id: '322AC0000000049', title: '労働基準法', number: '昭和二十二年法律第四十九号', refCount: 67 },
    { id: '323AC0000000131', title: '独占禁止法', number: '昭和二十二年法律第五十四号', refCount: 218 },
    { id: '222AC0000000067', title: '民事訴訟法', number: '平成八年法律第百九号', refCount: 356 },
    { id: '155AC0000000048', title: '消費税法', number: '昭和六十三年法律第百八号', refCount: 124 }
  ];

  return (
    <>
      {/* ヘッダー */}
      <div className="gov-header">
        <div className="container">
          <h1 className="site-title">LawFinder 法令検索</h1>
          <nav className="header-nav">
            <Link href="/">ホーム</Link>
            <Link href="/laws">法令検索</Link>
            <Link href="#">新規制定・改正法令</Link>
          </nav>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="container">
        <div className="hero-section">
          <h1>日本法令検索システム</h1>
          <p>法令間の参照関係を可視化し、改正影響を分析</p>
          <p className="tech-info">実LLM（Mistral）による高精度な参照解析</p>
        </div>

        <div className="law-grid">
          {sampleLaws.map((law) => (
            <div key={law.id} className="law-card">
              <h2>
                <Link href={`/laws/${law.id}`}>
                  {law.title}
                </Link>
              </h2>
              <p className="law-number">{law.number}</p>
              <div className="law-card-meta">
                <span className="meta-item">📊 参照関係: {law.refCount}件</span>
                <span className="meta-item">🤖 実LLM解析済み</span>
              </div>
            </div>
          ))}
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