import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="egov-header">
        <div className="egov-container">
          <h1 className="text-2xl font-bold">LawFinder - 法令検索・法改正支援システム</h1>
        </div>
      </header>

      <nav className="egov-nav">
        <div className="egov-container py-3">
          <div className="flex space-x-6">
            <Link href="/" className="hover:text-egov-blue">ホーム</Link>
            <Link href="/laws" className="hover:text-egov-blue">法令一覧</Link>
            <Link href="/search" className="hover:text-egov-blue">検索</Link>
            <Link href="/references" className="hover:text-egov-blue">参照関係</Link>
          </div>
        </div>
      </nav>

      <main className="egov-container py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="egov-card">
            <h2 className="text-xl font-bold mb-4">法令検索</h2>
            <p className="text-gray-600 mb-4">
              法令名、条文番号、キーワードから法令を検索できます。
            </p>
            <Link href="/search" className="egov-button">
              検索する
            </Link>
          </div>

          <div className="egov-card">
            <h2 className="text-xl font-bold mb-4">法令一覧</h2>
            <p className="text-gray-600 mb-4">
              登録されている全ての法令を閲覧できます。
            </p>
            <Link href="/laws" className="egov-button">
              一覧を見る
            </Link>
          </div>

          <div className="egov-card">
            <h2 className="text-xl font-bold mb-4">参照関係分析</h2>
            <p className="text-gray-600 mb-4">
              法令間の参照関係をグラフで可視化します。
            </p>
            <Link href="/references" className="egov-button">
              分析する
            </Link>
          </div>
        </div>

        <div className="mt-8 egov-card">
          <h2 className="text-xl font-bold mb-4">最近更新された法令</h2>
          <div className="space-y-2">
            <p className="text-gray-600">データベースから最新の法令情報を取得中...</p>
          </div>
        </div>
      </main>
    </div>
  );
}