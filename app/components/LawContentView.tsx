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
  const [hiddenStructureArticles, setHiddenStructureArticles] = useState<Set<string>>(new Set());

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

  return (
    <>
      {/* 目次セクション（左側） */}
      <TableOfContents 
        structure={lawData.structure} 
        articles={lawData.articles}
        onArticleVisibilityChange={onArticleVisibilityChange}
        onStructureVisibilityChange={onStructureVisibilityChange}
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
            // 個別の条文非表示状態をチェック
            const isArticleHidden = Array.from(hiddenArticles).some(hiddenId => 
              hiddenId.endsWith(`-${article.articleNum}`)
            );
            
            // 編・章・節による非表示状態をチェック
            const isStructureHidden = hiddenStructureArticles.has(article.articleNum);
            
            // どちらかで非表示の場合は非表示にする
            const isHidden = isArticleHidden || isStructureHidden;
            
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