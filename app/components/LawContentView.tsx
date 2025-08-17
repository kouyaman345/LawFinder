'use client';

import React, { useState } from 'react';
import { TableOfContents } from './TableOfContents';
import { LawArticle } from './LawArticle';
import { DeletedArticles } from './DeletedArticles';
interface Reference {
  sourceArticle: string;
  targetLawId?: string | null;
  targetArticle?: string | null;
  type: string;
  text: string;
  confidence: number;
  metadata?: any;
}

interface LawContentViewProps {
  lawData: {
    lawTitle: string;
    lawNum: string;
    enactStatements?: string[]; // 制定文を追加
    structure: any;
    articles: any[];
  };
  allReferences: Reference[];
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
        enactStatements={lawData.enactStatements}
        onArticleVisibilityChange={onArticleVisibilityChange}
        onStructureVisibilityChange={onStructureVisibilityChange}
      />

      {/* 条文表示エリア */}
      <div className="articles-container">
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

        {/* 法令ヘッダー */}
        <div className="law-header">
          <h1 className="law-title">{lawData.lawTitle}</h1>
          <p className="law-number">{lawData.lawNum}</p>
        </div>
        
        {/* 制定文 */}
        {lawData.enactStatements && lawData.enactStatements.length > 0 && (
          <div id="enact-statements" className="enact-statements-section">
            <h2 className="section-title">制定文</h2>
            {lawData.enactStatements.map((statement, index) => (
              <p key={index} className="enact-statement">{statement}</p>
            ))}
          </div>
        )}

        {/* 条文セクション */}
        <div className="articles-section">
          {lawData.articles.map((article, index) => {
            // 削除条文の範囲表示を処理
            if (article.isDeleted && article.articleNum.includes('から') && article.articleNum.includes('まで')) {
              // 範囲削除の表示（例: "六百十八から六百八十三まで"）
              const match = article.articleNum.match(/^(.+?)から(.+?)まで$/);
              if (match) {
                return (
                  <DeletedArticles
                    key={`deleted-${article.articleNum}-${index}`}
                    startNum={match[1]}
                    endNum={match[2]}
                    id={`art${article.articleNum}`}
                  />
                );
              }
            }
            
            // 個別削除条文の連続をグループ化
            if (article.isDeleted && index < lawData.articles.length - 1) {
              // 連続する削除条文を探す
              let endIndex = index;
              while (endIndex < lawData.articles.length - 1 && 
                     lawData.articles[endIndex + 1].isDeleted &&
                     !lawData.articles[endIndex + 1].articleNum.includes('から')) {
                endIndex++;
              }
              
              // 複数の連続削除条文がある場合
              if (endIndex > index) {
                const deletedRange = lawData.articles.slice(index, endIndex + 1);
                // 次のループでスキップする
                for (let i = index + 1; i <= endIndex; i++) {
                  lawData.articles[i]._skip = true;
                }
                
                return (
                  <DeletedArticles
                    key={`deleted-range-${index}`}
                    startNum={article.articleNum}
                    endNum={lawData.articles[endIndex].articleNum}
                    id={`art${article.articleNum}`}
                  />
                );
              }
            }
            
            // スキップフラグがある場合は表示しない
            if (article._skip) {
              return null;
            }
            
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