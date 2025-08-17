'use client';

import React from 'react';

interface DeletedArticlesProps {
  startNum: string;
  endNum: string;
  id?: string;
}

/**
 * 削除条文を範囲表示するコンポーネント
 * e-Gov風の表示形式: 「第X条から第Y条まで　削除」
 */
export function DeletedArticles({ startNum, endNum, id }: DeletedArticlesProps) {
  // 範囲が同じ場合は単独表示
  const displayText = startNum === endNum 
    ? `第${startNum}条` 
    : `第${startNum}条から第${endNum}条まで`;
  
  return (
    <article 
      className="law-article deleted-articles" 
      id={id}
      style={{
        padding: '1em 0',
        borderBottom: '1px solid #e0e0e0',
        color: '#666',
        fontStyle: 'italic'
      }}
    >
      <div className="article-number" style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
        {displayText}　削除
      </div>
    </article>
  );
}