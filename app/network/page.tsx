'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useNavigationHistory, HistoryEntry } from '../hooks/useNavigationHistory';

const NetworkGraph = dynamic(() => import('../components/NetworkGraph'), { ssr: false });

interface LawNode {
  lawId: string;
  title: string;
  incoming: number;
  outgoing: number;
  total?: number;
}

interface ReferenceDetail {
  sourceArticle: string | null;
  targetArticle: string | null;
  text: string;
  type: string;
  confidence: number;
}

interface LawRefGroup {
  lawId: string;
  title: string;
  references: ReferenceDetail[];
}

interface RefSection {
  count: number;
  returnedCount: number;
  page: number;
  pageSize: number;
  laws: LawRefGroup[];
}

interface ReferenceData {
  lawId: string;
  lawTitle: string;
  outgoing: RefSection;
  incoming: RefSection;
  totalReferences: number;
}

interface ArticleInfo {
  articleNumber: string;
  outgoing: number;
  incoming: number;
  total: number;
}

interface ImpactItem {
  lawId: string;
  articleNumber: string | null;
  nodeType: string;
  impactLevel: number;
  pathCount: number;
  lawTitle: string;
  impactScore: number;
}

interface ImpactData {
  sourceLawId: string;
  sourceArticle: string;
  analysisDepth: number;
  totalImpacted: number;
  impactedLaws: number;
  summary: { highImpact: number; mediumImpact: number; lowImpact: number };
  impactGroups: { high: ImpactItem[]; medium: ImpactItem[]; low: ImpactItem[] };
}

export default function NetworkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stats, setStats] = useState<any>(null);
  const [topLaws, setTopLaws] = useState<LawNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LawNode[]>([]);
  const [selectedLaw, setSelectedLaw] = useState<string | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');

  // New state for article-level analysis
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [articleList, setArticleList] = useState<ArticleInfo[]>([]);
  const [impactData, setImpactData] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'law' | 'article'>('law');

  // Navigation history
  const navHistory = useNavigationHistory();

  // Load stats and top laws on mount
  useEffect(() => {
    fetch('/api/network?action=stats')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);

    fetch('/api/network?action=top&limit=30')
      .then(r => r.json())
      .then(d => setTopLaws(d.laws || []))
      .catch(console.error);
  }, []);

  // Handle URL query parameter on mount
  useEffect(() => {
    const lawIdParam = searchParams.get('lawId');
    if (lawIdParam && !selectedLaw) {
      selectLaw(lawIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/network?action=search&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [searchQuery]);

  // Fetch articles list for a law
  const fetchArticles = useCallback(async (lawId: string) => {
    try {
      const res = await fetch(`/api/network?action=articles&lawId=${encodeURIComponent(lawId)}`);
      const data = await res.json();
      setArticleList(data.articles || []);
    } catch (err) {
      console.error(err);
      setArticleList([]);
    }
  }, []);

  // Select a law to view its references
  const selectLaw = useCallback(async (lawId: string, fromHistory = false) => {
    setSelectedLaw(lawId);
    setSelectedArticle(null);
    setViewMode('law');
    setImpactData(null);
    setLoading(true);

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('lawId', lawId);
    router.replace(url.pathname + url.search, { scroll: false });

    try {
      const res = await fetch(`/api/laws/${lawId}/references`);
      const data = await res.json();
      setReferenceData(data);

      // Push to history (unless navigating from back/forward)
      if (!fromHistory) {
        navHistory.push(lawId, data.lawTitle || lawId);
      }

      // Fetch articles
      fetchArticles(lawId);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [router, navHistory, fetchArticles]);

  // Navigate back
  const handleGoBack = useCallback(() => {
    const entry = navHistory.goBack();
    if (entry) {
      selectLaw(entry.lawId, true);
    }
  }, [navHistory, selectLaw]);

  // Navigate forward
  const handleGoForward = useCallback(() => {
    const entry = navHistory.goForward();
    if (entry) {
      selectLaw(entry.lawId, true);
    }
  }, [navHistory, selectLaw]);

  // Select article for impact analysis
  const selectArticle = useCallback(async (articleNumber: string) => {
    if (!selectedLaw) return;
    setSelectedArticle(articleNumber);
    setViewMode('article');
    setImpactLoading(true);

    try {
      const res = await fetch(
        `/api/laws/${selectedLaw}/impact?article=${encodeURIComponent(articleNumber)}&depth=2`
      );
      const data = await res.json();
      setImpactData(data);
    } catch (err) {
      console.error(err);
      setImpactData(null);
    }
    setImpactLoading(false);
  }, [selectedLaw]);

  // Return to law-level view
  const returnToLawView = useCallback(() => {
    setSelectedArticle(null);
    setViewMode('law');
    setImpactData(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#003f8e] text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">
              <Link href="/" className="hover:opacity-80">LawFinder</Link>
              <span className="ml-3 text-sm font-normal opacity-80">法令ネットワーク</span>
            </h1>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">ホーム</Link>
              <Link href="/laws" className="hover:underline">法令検索</Link>
              <Link href="/network" className="text-yellow-300 font-bold">ネットワーク</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.lawCount?.toLocaleString()}</div>
              <div className="text-sm text-gray-600">法令数</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.referenceCount?.toLocaleString()}</div>
              <div className="text-sm text-gray-600">総参照数</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{stats.crossLawReferenceCount?.toLocaleString()}</div>
              <div className="text-sm text-gray-600">法令間参照</div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="法令名で検索（例: 民法、会社法、金融商品取引法）"
              className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              検索
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className={`mt-3 border rounded-lg divide-y overflow-y-auto ${
              selectedLaw ? 'max-h-32' : 'max-h-60'
            }`}>
              {searchResults.map(law => (
                <button
                  key={law.lawId}
                  onClick={() => selectLaw(law.lawId)}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 flex justify-between items-center ${
                    selectedLaw === law.lawId ? 'bg-blue-100' : ''
                  }`}
                >
                  <span className="font-medium">{law.title || law.lawId}</span>
                  <span className="text-sm text-gray-500">
                    {law.outgoing}件参照 / {law.incoming}件被参照
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation History Bar */}
        {navHistory.history.length > 0 && (
          <div className="bg-white rounded-lg shadow px-4 py-2 mb-6 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={handleGoBack}
              disabled={!navHistory.canGoBack}
              className="px-2 py-1 rounded text-sm font-bold bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="戻る"
            >
              &#9664; 戻る
            </button>
            <button
              onClick={handleGoForward}
              disabled={!navHistory.canGoForward}
              className="px-2 py-1 rounded text-sm font-bold bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="進む"
            >
              進む &#9654;
            </button>
            <span className="text-gray-300 mx-1">|</span>
            <div className="flex items-center gap-1 text-sm text-gray-600 overflow-x-auto">
              {navHistory.history.map((entry, idx) => (
                <React.Fragment key={`${entry.lawId}-${idx}`}>
                  {idx > 0 && <span className="text-gray-300">&gt;</span>}
                  <button
                    onClick={() => {
                      // Jump to specific point in history (not yet implemented as direct jump)
                      // For now, just show the breadcrumb
                    }}
                    className={`px-1 py-0.5 rounded truncate max-w-[120px] ${
                      idx === navHistory.currentIndex
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Laws */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
              <h2 className="font-bold text-gray-800">参照数TOP30</h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {topLaws.map((law, i) => (
                <button
                  key={law.lawId}
                  onClick={() => selectLaw(law.lawId)}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 ${
                    selectedLaw === law.lawId ? 'bg-blue-100' : ''
                  }`}
                >
                  <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{law.title}</div>
                    <div className="text-xs text-gray-500">
                      <span className="text-green-600">{law.outgoing}件参照</span>
                      {' / '}
                      <span className="text-orange-600">{law.incoming}件被参照</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reference Detail */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            {!referenceData ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-4">&#128269;</div>
                <p>左のリストまたは検索から法令を選択してください</p>
                <p className="text-sm mt-2">法令間の参照関係を確認できます</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
                  <h2 className="font-bold text-gray-800">
                    {referenceData.lawTitle || referenceData.lawId}
                  </h2>
                  <div className="text-sm text-gray-600 mt-1">
                    ID: {referenceData.lawId} |
                    合計 {referenceData.totalReferences.toLocaleString()} 件の法令間参照
                    {selectedArticle && (
                      <span className="ml-2 text-blue-600 font-medium">
                        | 第{selectedArticle}条を分析中
                      </span>
                    )}
                  </div>
                </div>

                {/* Network Graph */}
                <div className="p-3 border-b">
                  <NetworkGraph
                    lawId={referenceData.lawId}
                    onNodeClick={selectLaw}
                    articleNumber={selectedArticle}
                    mode={viewMode}
                  />
                </div>

                {/* Article Selection Section */}
                {articleList.length > 0 && (
                  <div className="px-4 py-3 border-b bg-blue-50">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-gray-700">条文別参照分析</h3>
                      {selectedArticle && (
                        <button
                          onClick={returnToLawView}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          法令全体に戻る
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {articleList.map(art => (
                        <button
                          key={art.articleNumber}
                          onClick={() => selectArticle(art.articleNumber)}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            selectedArticle === art.articleNumber
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                          }`}
                          title={`参照: ${art.outgoing}件 / 被参照: ${art.incoming}件`}
                        >
                          第{art.articleNumber}条
                          <span className="ml-1 opacity-70">({art.total})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Impact Analysis Panel (shown when article is selected) */}
                {selectedArticle && (
                  <div className="px-4 py-3 border-b">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      ハネ改正影響分析: 第{selectedArticle}条
                    </h3>
                    {impactLoading ? (
                      <div className="text-center py-4 text-gray-500 text-sm">影響分析を実行中...</div>
                    ) : impactData ? (
                      <>
                        {/* Impact summary cards */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                            <div className="text-lg font-bold text-red-600">{impactData.summary.highImpact}</div>
                            <div className="text-xs text-red-500">高影響</div>
                          </div>
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-center">
                            <div className="text-lg font-bold text-yellow-600">{impactData.summary.mediumImpact}</div>
                            <div className="text-xs text-yellow-600">中影響</div>
                          </div>
                          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
                            <div className="text-lg font-bold text-green-600">{impactData.summary.lowImpact}</div>
                            <div className="text-xs text-green-500">低影響</div>
                          </div>
                        </div>

                        {/* Impact list */}
                        {impactData.totalImpacted === 0 ? (
                          <div className="text-center py-3 text-gray-500 text-sm">
                            他の法令からの被参照は見つかりませんでした
                          </div>
                        ) : (
                          <div className="max-h-[300px] overflow-y-auto space-y-1">
                            {[...impactData.impactGroups.high, ...impactData.impactGroups.medium, ...impactData.impactGroups.low].map((item, idx) => (
                              <div key={`${item.lawId}-${item.articleNumber}-${idx}`} className="flex items-center gap-2 text-sm py-1">
                                <button
                                  onClick={() => selectLaw(item.lawId)}
                                  className="text-blue-600 hover:underline truncate flex-1 text-left"
                                  title={item.lawTitle}
                                >
                                  {item.lawTitle}
                                  {item.articleNumber && (
                                    <span className="text-gray-400 ml-1">第{item.articleNumber}条</span>
                                  )}
                                </button>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <div className="w-20 bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        item.impactScore >= 0.7 ? 'bg-red-500' :
                                        item.impactScore >= 0.4 ? 'bg-yellow-500' : 'bg-green-500'
                                      }`}
                                      style={{ width: `${Math.round(item.impactScore * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-8 text-right">
                                    {Math.round(item.impactScore * 100)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4 text-gray-400 text-sm">
                        条文を選択すると影響分析が表示されます
                      </div>
                    )}
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b">
                  <button
                    onClick={() => setActiveTab('outgoing')}
                    className={`flex-1 px-4 py-3 text-sm font-medium ${
                      activeTab === 'outgoing'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    この法令が参照する法令 ({referenceData.outgoing.count.toLocaleString()}件)
                    {referenceData.outgoing.returnedCount < referenceData.outgoing.count && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({referenceData.outgoing.returnedCount.toLocaleString()}件表示中)
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('incoming')}
                    className={`flex-1 px-4 py-3 text-sm font-medium ${
                      activeTab === 'incoming'
                        ? 'border-b-2 border-orange-600 text-orange-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    この法令を参照する法令 ({referenceData.incoming.count.toLocaleString()}件)
                    {referenceData.incoming.returnedCount < referenceData.incoming.count && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({referenceData.incoming.returnedCount.toLocaleString()}件表示中)
                      </span>
                    )}
                  </button>
                </div>

                {/* Reference List */}
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {(activeTab === 'outgoing'
                    ? referenceData.outgoing.laws
                    : referenceData.incoming.laws
                  ).map(lawGroup => (
                    <div key={lawGroup.lawId} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => selectLaw(lawGroup.lawId)}
                          className="text-blue-600 hover:underline font-medium text-sm"
                        >
                          {lawGroup.title || lawGroup.lawId}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {lawGroup.references.length}件
                          </span>
                          <a
                            href={`https://laws.e-gov.go.jp/law/${lawGroup.lawId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-blue-500"
                            title="e-Govで開く"
                          >
                            e-Gov
                          </a>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {lawGroup.references.slice(0, 5).map((ref, idx) => (
                          <div key={idx} className="text-xs text-gray-600 pl-3 border-l-2 border-gray-200">
                            {ref.sourceArticle && (
                              <span className="text-gray-400">第{ref.sourceArticle}条: </span>
                            )}
                            {ref.text}
                          </div>
                        ))}
                        {lawGroup.references.length > 5 && (
                          <div className="text-xs text-gray-400 pl-3">
                            ...他 {lawGroup.references.length - 5}件
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
