'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface Law {
  id: string;
  title: string;
  lawNumber: string;
  promulgationDate?: Date | null;
  enforcementDate?: Date | null;
  category?: string | null;
  _count: {
    articles: number;
    references?: number;
  };
}

interface LawsListEnhancedProps {
  initialLaws: Law[];
  categories: Record<string, number>;
}

export default function LawsListEnhanced({ 
  initialLaws, 
  categories 
}: LawsListEnhancedProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'number' | 'date'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // フィルタリングとソート
  const filteredAndSortedLaws = useMemo(() => {
    let filtered = initialLaws;
    
    // カテゴリフィルタ
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(law => 
        (law.category || '未分類') === selectedCategory
      );
    }
    
    // 検索フィルタ
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(law => 
        law.title.toLowerCase().includes(term) ||
        law.lawNumber.toLowerCase().includes(term)
      );
    }
    
    // ソート
    const sorted = [...filtered].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'title':
          compareValue = a.title.localeCompare(b.title, 'ja');
          break;
        case 'number':
          compareValue = a.lawNumber.localeCompare(b.lawNumber, 'ja');
          break;
        case 'date':
          const dateA = a.promulgationDate ? new Date(a.promulgationDate).getTime() : 0;
          const dateB = b.promulgationDate ? new Date(b.promulgationDate).getTime() : 0;
          compareValue = dateA - dateB;
          break;
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return sorted;
  }, [initialLaws, searchTerm, selectedCategory, sortBy, sortOrder]);

  // ページネーション
  const totalPages = Math.ceil(filteredAndSortedLaws.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentLaws = filteredAndSortedLaws.slice(startIndex, endIndex);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '-';
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* ヘッダー統計 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">法令一覧</h1>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-blue-600 font-semibold">総法令数</div>
            <div className="text-2xl font-bold text-blue-900">
              {initialLaws.length.toLocaleString()}
            </div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-green-600 font-semibold">カテゴリ数</div>
            <div className="text-2xl font-bold text-green-900">
              {Object.keys(categories).length}
            </div>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <div className="text-purple-600 font-semibold">総条文数</div>
            <div className="text-2xl font-bold text-purple-900">
              {initialLaws.reduce((sum, law) => sum + law._count.articles, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-orange-600 font-semibold">参照関係</div>
            <div className="text-2xl font-bold text-orange-900">
              {initialLaws.reduce((sum, law) => sum + (law._count.references || 0), 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* フィルタとソート */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* 検索 */}
          <div className="flex-1 min-w-[300px]">
            <input
              type="text"
              placeholder="法令名または法令番号で検索..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* カテゴリフィルタ */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべてのカテゴリ</option>
            {Object.entries(categories).map(([cat, count]) => (
              <option key={cat} value={cat}>
                {cat} ({count})
              </option>
            ))}
          </select>
          
          {/* 表示数 */}
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={20}>20件</option>
            <option value={50}>50件</option>
            <option value={100}>100件</option>
            <option value={200}>200件</option>
          </select>
          
          {/* 表示モード */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-md ${
                viewMode === 'list' 
                  ? 'bg-blue-600 text-white' 
                  : 'border hover:bg-gray-50'
              }`}
            >
              リスト
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-md ${
                viewMode === 'grid' 
                  ? 'bg-blue-600 text-white' 
                  : 'border hover:bg-gray-50'
              }`}
            >
              グリッド
            </button>
          </div>
        </div>
        
        {/* 検索結果数 */}
        <div className="mt-4 text-sm text-gray-600">
          {filteredAndSortedLaws.length}件の法令が見つかりました
          {searchTerm && ` (検索: "${searchTerm}")`}
          {selectedCategory !== 'all' && ` (カテゴリ: ${selectedCategory})`}
        </div>
      </div>

      {/* 法令リスト */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('title')}
                    className="flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
                  >
                    法令名
                    {sortBy === 'title' && (
                      sortOrder === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('number')}
                    className="flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
                  >
                    法令番号
                    {sortBy === 'number' && (
                      sortOrder === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">カテゴリ</th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
                  >
                    公布日
                    {sortBy === 'date' && (
                      sortOrder === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-center">条文数</th>
                <th className="px-6 py-3 text-center">参照数</th>
              </tr>
            </thead>
            <tbody>
              {currentLaws.map((law) => (
                <tr key={law.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/laws/${law.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {law.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {law.lawNumber}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                      {law.category || '未分類'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(law.promulgationDate)}
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    {law._count.articles}
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    {law._count.references || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // グリッドビュー
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentLaws.map((law) => (
            <Link
              key={law.id}
              href={`/laws/${law.id}`}
              className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-blue-600 hover:text-blue-800 mb-2">
                {law.title}
              </h3>
              <p className="text-sm text-gray-600 mb-2">{law.lawNumber}</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{law.category || '未分類'}</span>
                <span>{law._count.articles}条</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              前へ
            </button>
            
            {/* ページ番号 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = currentPage - 2 + i;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 border rounded-md ${
                    currentPage === pageNum 
                      ? 'bg-blue-600 text-white' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            }).filter(Boolean)}
            
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              最後
            </button>
          </div>
        </div>
      )}
    </div>
  );
}