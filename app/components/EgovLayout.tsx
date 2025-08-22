'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

interface EgovLayoutProps {
  children: React.ReactNode;
  showSearch?: boolean;
}

/**
 * e-Gov風のレイアウトコンポーネント
 */
export function EgovLayout({ children, showSearch = true }: EgovLayoutProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'title' | 'content' | 'number'>('title');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 検索処理の実装
    const params = new URLSearchParams({
      q: searchQuery,
      type: searchType
    });
    window.location.href = `/laws/search?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-[#003f8e] text-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold mr-8">
                法令検索 LawFinder
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link href="/laws" className="hover:text-blue-200 transition-colors">
                  法令一覧
                </Link>
                <Link href="/laws/category" className="hover:text-blue-200 transition-colors">
                  分野別
                </Link>
                <Link href="/laws/recent" className="hover:text-blue-200 transition-colors">
                  新規制定・改正
                </Link>
                <Link href="/help" className="hover:text-blue-200 transition-colors">
                  ヘルプ
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button className="text-sm hover:text-blue-200">
                English
              </button>
              <button className="text-sm hover:text-blue-200">
                文字サイズ
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 検索バー */}
      {showSearch && (
        <div className="bg-white border-b shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1 flex gap-2">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="title">法令名</option>
                  <option value="content">本文</option>
                  <option value="number">法令番号</option>
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="検索キーワードを入力"
                  className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                検索
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                詳細検索
              </button>
            </form>
            
            {/* クイック検索タグ */}
            <div className="mt-3 flex gap-2 text-sm">
              <span className="text-gray-600">よく検索される法令:</span>
              <Link href="/laws/129AC0000000089" className="text-blue-600 hover:underline">
                民法
              </Link>
              <Link href="/laws/132AC0000000048" className="text-blue-600 hover:underline">
                商法
              </Link>
              <Link href="/laws/417AC0000000086" className="text-blue-600 hover:underline">
                会社法
              </Link>
              <Link href="/laws/140AC0000000045" className="text-blue-600 hover:underline">
                刑法
              </Link>
              <Link href="/laws/322AC0000000049" className="text-blue-600 hover:underline">
                労働基準法
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* パンくずリスト */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-2">
          <nav className="text-sm">
            <Link href="/" className="text-blue-600 hover:underline">
              ホーム
            </Link>
            {pathname !== '/' && (
              <>
                <span className="mx-2 text-gray-400">＞</span>
                {pathname.startsWith('/laws/') && pathname !== '/laws' && (
                  <>
                    <Link href="/laws" className="text-blue-600 hover:underline">
                      法令一覧
                    </Link>
                    <span className="mx-2 text-gray-400">＞</span>
                    <span className="text-gray-700">法令詳細</span>
                  </>
                )}
                {pathname === '/laws' && (
                  <span className="text-gray-700">法令一覧</span>
                )}
              </>
            )}
          </nav>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>

      {/* フッター */}
      <footer className="bg-gray-800 text-white mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <h3 className="font-bold mb-3">法令検索</h3>
              <ul className="space-y-1 text-sm">
                <li><Link href="/laws" className="hover:underline">法令一覧</Link></li>
                <li><Link href="/laws/category" className="hover:underline">分野別検索</Link></li>
                <li><Link href="/laws/recent" className="hover:underline">新規制定・改正</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3">機能</h3>
              <ul className="space-y-1 text-sm">
                <li><Link href="/reference-analysis" className="hover:underline">参照関係分析</Link></li>
                <li><Link href="/impact-analysis" className="hover:underline">改正影響分析</Link></li>
                <li><Link href="/graph" className="hover:underline">グラフ表示</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3">サポート</h3>
              <ul className="space-y-1 text-sm">
                <li><Link href="/help" className="hover:underline">ヘルプ</Link></li>
                <li><Link href="/guide" className="hover:underline">使い方ガイド</Link></li>
                <li><Link href="/faq" className="hover:underline">よくある質問</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3">その他</h3>
              <ul className="space-y-1 text-sm">
                <li><Link href="/about" className="hover:underline">このサイトについて</Link></li>
                <li><Link href="/terms" className="hover:underline">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:underline">プライバシーポリシー</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-gray-700 text-center text-sm">
            <p>© 2025 LawFinder - 日本法令検索システム</p>
            <p className="mt-2 text-gray-400">
              本システムはe-Gov法令検索の機能を参考に開発された独立したシステムです
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}