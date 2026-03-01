'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { trackEvent } from '@/app/lib/analytics';

const NetworkGraph = dynamic(() => import('./components/NetworkGraph'), { ssr: false });

// 条文番号のフォーマット: "6_2" → "6の2", "6_2_3" → "6の2の3"
function formatArticleNumber(num: string): string {
  return num.replace(/_/g, 'の');
}

// --- Access History Management ---
const HISTORY_KEY = 'takotsubo-access-history';
const MAX_HISTORY = 50;

interface AccessHistoryItem {
  lawId: string;
  title: string;
  lastAccessed: number;
  accessCount: number;
}

const loadAccessHistory = (): AccessHistoryItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveAccessHistory = (history: AccessHistoryItem[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
};

const recordAccess = (lawId: string, title: string) => {
  const history = loadAccessHistory();
  const existing = history.find(h => h.lawId === lawId);
  if (existing) {
    existing.lastAccessed = Date.now();
    existing.accessCount++;
    existing.title = title || existing.title;
  } else {
    history.unshift({ lawId, title, lastAccessed: Date.now(), accessCount: 1 });
  }
  history.sort((a, b) => b.lastAccessed - a.lastAccessed);
  saveAccessHistory(history);
};

// --- Interfaces ---
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

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LawNode[]>([]);
  const [selectedLaw, setSelectedLaw] = useState<string | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');

  // Article-level analysis state
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [articleList, setArticleList] = useState<ArticleInfo[]>([]);
  const [impactData, setImpactData] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'law' | 'article'>('law');

  // Navigation history
  const navHistory = useNavigationHistory();

  // Access history state
  const [accessHistory, setAccessHistory] = useState<AccessHistoryItem[]>([]);

  // Terms modal state
  const [showTerms, setShowTerms] = useState(false);

  // Load stats and access history on mount
  useEffect(() => {
    fetch('/api/network?action=stats')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);

    setAccessHistory(loadAccessHistory());
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
      trackEvent('search', { search_term: searchQuery, result_count: data.results?.length ?? 0 });
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
    url.pathname = '/';
    url.searchParams.set('lawId', lawId);
    router.replace(url.pathname + url.search, { scroll: false });

    try {
      const res = await fetch(`/api/laws/${lawId}/references`);
      const data = await res.json();
      setReferenceData(data);

      trackEvent('law_select', { law_id: lawId, law_title: data.lawTitle || lawId });

      // Push to navigation history (unless navigating from back/forward)
      if (!fromHistory) {
        navHistory.push(lawId, data.lawTitle || lawId);
      }

      // Record access for localStorage history
      recordAccess(lawId, data.lawTitle || lawId);
      setAccessHistory(loadAccessHistory());

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
    trackEvent('article_select', { law_id: selectedLaw, article_number: articleNumber });
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

  // Clear access history
  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setAccessHistory([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#003f8e] text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">
              たこつぼ
              <span className="ml-3 text-sm font-normal opacity-80">法令参照ネットワーク</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1">
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
                    onClick={() => {}}
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Access History (Left Panel) */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-800 text-sm">アクセス履歴</h2>
                {accessHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    クリア
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {accessHistory.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  法令を検索・閲覧するとここに履歴が表示されます
                </div>
              ) : (
                accessHistory.map((item) => (
                  <button
                    key={item.lawId}
                    onClick={() => selectLaw(item.lawId)}
                    className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2 ${
                      selectedLaw === item.lawId ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{item.title}</div>
                      <div className="text-[10px] text-gray-400">
                        {item.accessCount}回 · {new Date(item.lastAccessed).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Reference Detail */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow">
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
                        | 第{formatArticleNumber(selectedArticle)}条の参照関係
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
                      <h3 className="text-sm font-bold text-gray-700">
                        条文別参照分析
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          全{articleList.length}条
                        </span>
                      </h3>
                      {selectedArticle && (
                        <button
                          onClick={returnToLawView}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          法令全体に戻る
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {articleList.map(art => (
                        <button
                          key={art.articleNumber}
                          onClick={() => selectArticle(art.articleNumber)}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            selectedArticle === art.articleNumber
                              ? 'bg-blue-600 text-white border-blue-600'
                              : art.total > 0
                                ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                                : 'bg-gray-50 text-gray-400 border-gray-200'
                          }`}
                          title={`参照: ${art.outgoing}件 / 被参照: ${art.incoming}件`}
                        >
                          第{formatArticleNumber(art.articleNumber)}条
                          {art.total > 0 && (
                            <span className="ml-1 opacity-70">({art.total})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Impact Analysis Panel (shown when article is selected) */}
                {selectedArticle && (
                  <div className="px-4 py-3 border-b">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      ハネ改正影響分析: 第{formatArticleNumber(selectedArticle)}条
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
                                    <span className="text-gray-400 ml-1">第{formatArticleNumber(item.articleNumber)}条</span>
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
                    onClick={() => { setActiveTab('outgoing'); trackEvent('tab_change', { tab_name: 'outgoing', law_id: referenceData.lawId }); }}
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
                    onClick={() => { setActiveTab('incoming'); trackEvent('tab_change', { tab_name: 'incoming', law_id: referenceData.lawId }); }}
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
                          onClick={() => {
                            trackEvent('reference_click', {
                              source_law_id: referenceData.lawId,
                              target_law_id: lawGroup.lawId,
                              reference_type: activeTab,
                            });
                            selectLaw(lawGroup.lawId);
                          }}
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
                              <span className="text-gray-400">第{formatArticleNumber(ref.sourceArticle)}条: </span>
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

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* About */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">たこつぼについて</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                本サービスは、株式会社NanNaruが提供する法令参照ネットワーク可視化サービスです。
                公開データを基に法令間の参照関係を分析しています。
              </p>
            </div>
            {/* Links */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">リンク</h3>
              <ul className="text-xs space-y-1.5">
                <li>
                  <button onClick={() => setShowTerms(true)} className="text-gray-400 hover:text-white underline">
                    利用規約
                  </button>
                </li>
                <li>
                  <a href="/roadmap" className="text-gray-400 hover:text-white underline">
                    将来計画（ロードマップ）
                  </a>
                </li>
                <li>
                  <a href="https://nan-naru.com/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white underline">
                    株式会社NanNaru 公式サイト
                  </a>
                </li>
              </ul>
            </div>
            {/* Contact */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">お問い合わせ</h3>
              <ul className="text-xs space-y-1.5">
                <li className="text-gray-400">
                  メール: <a href="mailto:info@nan-naru.com" className="hover:text-white underline">info@nan-naru.com</a>
                </li>
                <li className="text-gray-400">
                  Web: <a href="https://nan-naru.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white underline">nan-naru.com</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-4">
            <p className="text-[11px] text-gray-500 text-center leading-relaxed">
              本サービスで提供される情報は、法令間の参照関係の可視化を目的とした参考情報であり、法的助言を構成するものではありません。
              情報の正確性・完全性・最新性について保証するものではなく、本サービスの利用により生じたいかなる損害についても、株式会社NanNaruは責任を負いかねます。
              法令の解釈・適用に関しては、必ず原文をご確認のうえ、専門家にご相談ください。
            </p>
            <p className="text-[10px] text-gray-600 text-center mt-2">&copy; 株式会社NanNaru. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Terms of Use Modal */}
      {showTerms && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">利用規約</h2>
            <div className="text-sm text-gray-700 space-y-3">
              <p>本サービス「たこつぼ」（以下「本サービス」）は、株式会社NanNaru（以下「当社」）が提供する法令参照ネットワーク可視化サービスです。本サービスをご利用いただくにあたり、以下の利用規約に同意いただいたものとみなします。</p>

              <h3 className="font-bold mt-4">1. サービスの目的</h3>
              <p>本サービスは、日本の法令間の参照関係を可視化し、法改正の影響分析（ハネ改正分析）を支援することを目的としています。行政機関、法務担当者、研究者等の業務効率化を支援するツールとしてご活用ください。</p>

              <h3 className="font-bold mt-4">2. 免責事項</h3>
              <p>本サービスで提供される情報は、法令間の参照関係の可視化を目的とした参考情報であり、法的助言を構成するものではありません。情報の正確性、完全性、最新性について保証するものではなく、本サービスの利用により生じたいかなる損害についても、当社は責任を負いかねます。法令の解釈・適用に関しては、必ず原文をご確認のうえ、専門家にご相談ください。</p>

              <h3 className="font-bold mt-4">3. 利用条件</h3>
              <p>本サービスは業務支援を目的として提供されます。以下の行為を禁止します。</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>本サービスのデータの無断での商用利用・再配布</li>
                <li>サービスの運営を妨害する行為</li>
                <li>不正アクセスまたはシステムへの攻撃</li>
                <li>その他、当社が不適切と判断する行為</li>
              </ul>

              <h3 className="font-bold mt-4">4. データの取り扱い</h3>
              <p>本サービスで使用する法令データは、e-Gov法令検索から取得した公開データに基づいています。閲覧履歴はブラウザのローカルストレージに保存され、当社サーバーには送信されません。</p>

              <h3 className="font-bold mt-4">5. アクセス解析</h3>
              <p>本サービスでは、サービスの品質向上およびユーザー体験の改善を目的として、以下のアクセス解析ツールを使用しています。</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>Google アナリティクス 4（GA4）</strong>: ページの閲覧状況、検索キーワード、機能の利用状況等の統計データを収集します。Cookieを使用してデータを収集しますが、個人を特定する情報は取得しません。詳細は<a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Googleのプライバシーポリシー</a>をご確認ください。</li>
                <li><strong>Microsoft Clarity</strong>: ユーザーの操作パターン（クリック、スクロール等）を記録し、UI/UXの改善に活用します。セッション録画およびヒートマップ機能を含みます。詳細は<a href="https://clarity.microsoft.com/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Microsoft Clarityの利用規約</a>をご確認ください。</li>
              </ul>
              <p className="mt-2">これらのツールによるデータ収集を希望されない場合は、ブラウザの設定でCookieを無効にするか、各ツールのオプトアウト機能をご利用ください。</p>

              <h3 className="font-bold mt-4">6. 知的財産権</h3>
              <p>本サービスのシステム、デザイン、アルゴリズムに関する知的財産権は当社に帰属します。</p>

              <h3 className="font-bold mt-4">7. 規約の変更</h3>
              <p>当社は、必要に応じて本規約を変更することがあります。変更後の規約は、本サービス上に掲載した時点から効力を生じるものとします。</p>

              <h3 className="font-bold mt-4">8. お問い合わせ</h3>
              <p>本サービスに関するお問い合わせは、以下までご連絡ください。</p>
              <p className="mt-1">
                株式会社NanNaru<br />
                メール: <a href="mailto:info@nan-naru.com" className="text-blue-600 underline">info@nan-naru.com</a><br />
                Web: <a href="https://nan-naru.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://nan-naru.com/</a>
              </p>
            </div>
            <button
              onClick={() => setShowTerms(false)}
              className="mt-6 w-full bg-gray-800 text-white py-2 rounded hover:bg-gray-700"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
