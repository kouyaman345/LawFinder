'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LawContentView } from './LawContentView';
import { DetectedReference } from '../../src/utils/reference-detector';

interface LawDetailClientProps {
  lawData: {
    lawTitle: string;
    lawNum: string;
    structure: any;
    articles: any[];
  };
  allReferences: DetectedReference[];
  lawId: string;
}

export function LawDetailClient({ lawData, allReferences, lawId }: LawDetailClientProps) {
  const [showFirstParagraphNumber, setShowFirstParagraphNumber] = useState(false);

  return (
    <div className="law-page-layout">
      {/* ヘッダー */}
      <div className="gov-header">
        <div className="header-container">
          <h1 className="site-title">LawFinder 法令検索</h1>
          <nav className="header-nav">
            <Link href="/">ホーム</Link>
            <Link href="/laws">法令検索</Link>
            <Link href="#">新規制定・改正法令</Link>
          </nav>
        </div>
      </div>

      {/* パンくずリストと第一項番号表示オプション */}
      <div className="breadcrumb-container">
        <div className="breadcrumb">
          <Link href="/">ホーム</Link>
          <span> &gt; </span>
          <Link href="/laws">法令一覧</Link>
          <span> &gt; </span>
          <span>{lawData.lawTitle}</span>
        </div>
        
        {/* 第一項番号表示オプション */}
        <div className="paragraph-number-option">
          <label className="option-label">
            <input
              type="checkbox"
              checked={showFirstParagraphNumber}
              onChange={(e) => setShowFirstParagraphNumber(e.target.checked)}
            />
            <span>第一項に項番号を表示</span>
          </label>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="law-main-container">
        <LawContentView
          lawData={lawData}
          allReferences={allReferences}
          lawId={lawId}
          showFirstParagraphNumber={showFirstParagraphNumber}
        />
      </div>
    </div>
  );
}