'use client';

import React, { useState } from 'react';
import { TableOfContents } from './TableOfContents';
import { LawArticle } from './LawArticle';
import { DetectedReference } from '../../src/utils/reference-detector';

interface LawContentViewProps {
  lawData: {
    lawTitle: string;
    lawNum: string;
    structure: any;
    articles: any[];
  };
  allReferences: DetectedReference[];
  lawId: string;
  showFirstParagraphNumber?: boolean;
  onShowFirstParagraphNumberChange?: (show: boolean) => void;
}

export function LawContentView({ 
  lawData, 
  allReferences, 
  lawId, 
  showFirstParagraphNumber = false,
  onShowFirstParagraphNumberChange 
}: LawContentViewProps) {
  const [hiddenArticles, setHiddenArticles] = useState<Set<string>>(new Set());

  const onArticleVisibilityChange = (articleId: string, isHidden: boolean) => {
    const newHidden = new Set(hiddenArticles);
    if (isHidden) {
      newHidden.add(articleId);
    } else {
      newHidden.delete(articleId);
    }
    setHiddenArticles(newHidden);
  };

  return (
    <>
      {/* 目次セクション（左側） */}
      <TableOfContents 
        structure={lawData.structure} 
        articles={lawData.articles}
        onArticleVisibilityChange={onArticleVisibilityChange}
      />

      {/* 条文表示エリア */}
      <div className="articles-container">
        {/* 法令ヘッダー */}
        <div className="law-header">
          <h1 className="law-title">{lawData.lawTitle}</h1>
          <p className="law-number">{lawData.lawNum}</p>
        </div>

        {/* ツールバー */}
        <div className="law-toolbar">
          <div className="toolbar-left">
            <button className="btn-outline">印刷</button>
            <button className="btn-outline">ダウンロード</button>
          </div>
          <div className="toolbar-right">
            <span className="reference-badge">参照関係: {allReferences.length}件</span>
            <span className="llm-badge">実LLM解析済み</span>
          </div>
        </div>

        {/* 条文セクション */}
        <div className="articles-section">
          {lawData.articles.map((article, index) => {
            // すべての可能なコンテキストでの非表示状態をチェック
            const isHidden = Array.from(hiddenArticles).some(hiddenId => 
              hiddenId.endsWith(`-${article.articleNum}`)
            );
            
            return (
              <div 
                key={`article-${article.articleNum}-${index}`}
                style={{ display: isHidden ? 'none' : 'block' }}
              >
                <LawArticle
                  article={article}
                  references={allReferences}
                  currentLawId={lawId}
                  showFirstParagraphNumber={showFirstParagraphNumber}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}