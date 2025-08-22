'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AutoLinkEnhancedReferences, ReferenceLegend } from './EnhancedReferenceLink';
import { TableOfContents } from './TableOfContents';
import { DeletedArticles } from './DeletedArticles';

interface Reference {
  sourceArticle: string;
  sourceParagraph?: number;
  sourceItem?: string;
  targetLawId?: string | null;
  targetLawName?: string | null;
  targetArticle?: string | null;
  targetParagraph?: number;
  type: string;
  text: string;
  confidence: number;
  metadata?: any;
  sourceStartPos?: number;
  sourceEndPos?: number;
  lineNumber?: number;
}

interface LawDetailClientEnhancedProps {
  lawData: {
    lawTitle: string;
    lawNum: string;
    lawId: string;
    enactStatements?: string[];
    structure: any;
    articles: any[];
  };
  allReferences: Reference[];
  lawId: string;
}

export function LawDetailClientEnhanced({ 
  lawData, 
  allReferences, 
  lawId 
}: LawDetailClientEnhancedProps) {
  const [showFirstParagraphNumber, setShowFirstParagraphNumber] = useState(false);
  const [hiddenArticles, setHiddenArticles] = useState<Set<string>>(new Set());
  const [hiddenStructureArticles, setHiddenStructureArticles] = useState<Set<string>>(new Set());
  const [selectedReferenceType, setSelectedReferenceType] = useState<string>('all');
  const [referenceStats, setReferenceStats] = useState<Record<string, number>>({});

  // 参照タイプ別の統計を計算
  useEffect(() => {
    const stats: Record<string, number> = {};
    allReferences.forEach(ref => {
      stats[ref.type] = (stats[ref.type] || 0) + 1;
    });
    setReferenceStats(stats);
  }, [allReferences]);

  const onArticleVisibilityChange = (articleId: string, isHidden: boolean) => {
    const newHidden = new Set(hiddenArticles);
    if (isHidden) {
      newHidden.add(articleId);
    } else {
      newHidden.delete(articleId);
    }
    setHiddenArticles(newHidden);
  };
  
  const onStructureVisibilityChange = (nodeId: string, isHidden: boolean, affectedArticles: string[]) => {
    const newHiddenStructure = new Set(hiddenStructureArticles);
    affectedArticles.forEach(articleNum => {
      if (isHidden) {
        newHiddenStructure.add(articleNum);
      } else {
        newHiddenStructure.delete(articleNum);
      }
    });
    setHiddenStructureArticles(newHiddenStructure);
  };

  // 選択された参照タイプでフィルタリング
  const filteredReferences = selectedReferenceType === 'all' 
    ? allReferences 
    : allReferences.filter(ref => ref.type === selectedReferenceType);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* メインコンテンツエリア */}
      <div className="flex flex-1">
        {/* 左サイドバー: 目次 */}
        <aside className="w-80 bg-white border-r overflow-y-auto">
          <div className="sticky top-0 bg-white border-b p-4 z-10">
            <h2 className="font-bold text-lg">目次</h2>
            <label className="flex items-center mt-2 text-sm">
              <input
                type="checkbox"
                checked={showFirstParagraphNumber}
                onChange={(e) => setShowFirstParagraphNumber(e.target.checked)}
                className="mr-2"
              />
              第一項番号を表示
            </label>
          </div>
          <TableOfContents 
            structure={lawData.structure} 
            articles={lawData.articles}
            enactStatements={lawData.enactStatements}
            onArticleVisibilityChange={onArticleVisibilityChange}
            onStructureVisibilityChange={onStructureVisibilityChange}
          />
        </aside>

        {/* メインコンテンツ */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6">
            {/* 法令ヘッダー */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h1 className="text-2xl font-bold mb-2">{lawData.lawTitle}</h1>
              <p className="text-gray-600">{lawData.lawNum}</p>
              
              {/* 参照統計と操作バー */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold">
                      参照関係: {allReferences.length}件
                    </span>
                    <select
                      value={selectedReferenceType}
                      onChange={(e) => setSelectedReferenceType(e.target.value)}
                      className="text-sm px-3 py-1 border rounded-md"
                    >
                      <option value="all">すべて表示</option>
                      <option value="internal">同一法令内 ({referenceStats.internal || 0})</option>
                      <option value="external">他法令 ({referenceStats.external || 0})</option>
                      <option value="relative">相対参照 ({referenceStats.relative || 0})</option>
                      <option value="range">範囲参照 ({referenceStats.range || 0})</option>
                      <option value="application">準用・適用 ({referenceStats.application || 0})</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
                      印刷
                    </button>
                    <button className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
                      ダウンロード
                    </button>
                    <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                      参照グラフ表示
                    </button>
                  </div>
                </div>
                
                {/* 参照タイプ凡例 */}
                <ReferenceLegend />
              </div>
            </div>

            {/* 制定文 */}
            {lawData.enactStatements && lawData.enactStatements.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">制定文</h2>
                {lawData.enactStatements.map((statement, index) => (
                  <p key={index} className="mb-2 leading-relaxed">{statement}</p>
                ))}
              </div>
            )}

            {/* 条文表示 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {lawData.articles
                .filter(article => !hiddenArticles.has(article.articleNumber) && 
                                  !hiddenStructureArticles.has(article.articleNumber))
                .map((article) => {
                  // この条文に関連する参照を取得
                  const articleReferences = filteredReferences.filter(
                    ref => ref.sourceArticle === article.articleNumber
                  );
                  
                  // 現在のコンテキスト
                  const currentContext = {
                    lawId: lawId,
                    lawName: lawData.lawTitle,
                    articleNumber: article.articleNumber
                  };
                  
                  return (
                    <div 
                      key={article.articleNumber} 
                      id={`article-${article.articleNumber}`}
                      className="mb-8 pb-8 border-b last:border-b-0"
                    >
                      {/* 条文番号とタイトル */}
                      <h3 className="text-lg font-bold mb-3">
                        第{article.articleNumber}条
                        {article.articleTitle && (
                          <span className="ml-2 font-normal">
                            （{article.articleTitle}）
                          </span>
                        )}
                      </h3>
                      
                      {/* 削除条文の場合 */}
                      {article.isDeleted && (
                        <div className="text-gray-500 italic">
                          削除
                        </div>
                      )}
                      
                      {/* 条文内容（参照リンク付き） */}
                      {!article.isDeleted && article.paragraphs && article.paragraphs.map((paragraph: any, pIndex: number) => {
                        // 段落に関連する参照を取得
                        const paragraphReferences = articleReferences.filter(
                          ref => !ref.sourceParagraph || ref.sourceParagraph === pIndex + 1
                        );
                        
                        const paragraphContext = {
                          ...currentContext,
                          paragraphNumber: pIndex + 1
                        };
                        
                        return (
                          <div 
                            key={pIndex} 
                            id={`article-${article.articleNumber}-p${pIndex + 1}`}
                            className="mb-3"
                          >
                            {(showFirstParagraphNumber || pIndex > 0) && (
                              <span className="mr-2 text-gray-600">
                                {pIndex + 1}
                              </span>
                            )}
                            <AutoLinkEnhancedReferences
                              text={paragraph.content}
                              references={paragraphReferences}
                              currentContext={paragraphContext}
                            />
                            
                            {/* 号がある場合 */}
                            {paragraph.items && paragraph.items.length > 0 && (
                              <div className="ml-8 mt-2">
                                {paragraph.items.map((item: any, iIndex: number) => {
                                  const itemContext = {
                                    ...paragraphContext,
                                    itemNumber: String(iIndex + 1)
                                  };
                                  
                                  const itemReferences = paragraphReferences.filter(
                                    ref => ref.sourceItem === String(iIndex + 1)
                                  );
                                  
                                  return (
                                    <div key={iIndex} className="mb-2">
                                      <span className="mr-2 text-gray-600">
                                        {iIndex + 1}
                                      </span>
                                      <AutoLinkEnhancedReferences
                                        text={item.content}
                                        references={itemReferences}
                                        currentContext={itemContext}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              
              {/* 削除条文リスト */}
              <DeletedArticles 
                articles={lawData.articles.filter(a => a.isDeleted)} 
              />
            </div>
          </div>
        </main>

        {/* 右サイドバー: 参照情報 */}
        <aside className="w-80 bg-white border-l overflow-y-auto">
          <div className="sticky top-0 bg-white border-b p-4 z-10">
            <h2 className="font-bold text-lg">参照情報</h2>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {filteredReferences.slice(0, 20).map((ref, index) => (
                <div key={index} className="text-sm border-b pb-2">
                  <div className="flex justify-between items-start">
                    <span className="text-gray-600">
                      第{ref.sourceArticle}条
                      {ref.sourceParagraph && `第${ref.sourceParagraph}項`}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      ref.type === 'internal' ? 'bg-blue-100 text-blue-700' :
                      ref.type === 'external' ? 'bg-green-100 text-green-700' :
                      ref.type === 'relative' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {ref.type === 'internal' ? '内部' :
                       ref.type === 'external' ? '外部' :
                       ref.type === 'relative' ? '相対' : ref.type}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="font-medium">{ref.text}</span>
                    {ref.targetLawName && (
                      <span className="text-gray-500 ml-2">
                        → {ref.targetLawName}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {filteredReferences.length > 20 && (
                <div className="text-center text-sm text-gray-500">
                  他 {filteredReferences.length - 20} 件
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}