'use client';

import { useState, useEffect } from 'react';
import { AutoLinkReferences } from './ReferenceLink';

interface Article {
  id: number;
  lawId: string;
  articleNum: string;
  articleCaption?: string;
  paragraphs: any[];
  division?: string;
  part?: string;
  chapter?: string;
  section?: string;
}

interface Reference {
  id?: number;
  sourceArticle: string;
  targetLaw?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: string;
  metadata?: any;
}

interface LawContentWithReferencesProps {
  articles: Article[];
  lawId: string;
}

/**
 * 参照リンク付き法令コンテンツ表示コンポーネント
 */
export function LawContentWithReferences({ articles, lawId }: LawContentWithReferencesProps) {
  const [references, setReferences] = useState<Map<string, Reference[]>>(new Map());
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // 参照データを取得
    fetchReferences();
  }, [lawId]);
  
  const fetchReferences = async () => {
    try {
      const response = await fetch(`/api/laws/${lawId}/references`);
      if (response.ok) {
        const data = await response.json();
        
        // 条文ごとに参照をグループ化
        const refMap = new Map<string, Reference[]>();
        data.references.forEach((ref: Reference) => {
          const key = ref.sourceArticle;
          if (!refMap.has(key)) {
            refMap.set(key, []);
          }
          refMap.get(key)!.push(ref);
        });
        
        setReferences(refMap);
      }
    } catch (error) {
      console.error('参照データの取得に失敗:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const renderParagraph = (paragraph: any, articleNum: string) => {
    const paragraphText = paragraph.sentenceOrColumns?.map((s: any) => 
      s.sentence || s.column || ''
    ).join('') || '';
    
    // この条文の参照データを取得
    const articleRefs = references.get(articleNum) || [];
    
    // 参照データを変換
    const referenceData = articleRefs.map(ref => ({
      type: ref.referenceType as any,
      targetLawId: ref.targetLaw,
      targetArticle: ref.targetArticle,
      text: ref.referenceText,
      metadata: ref.metadata
    }));
    
    return (
      <div key={paragraph.num} className="mb-2">
        <span className="text-gray-600 mr-2">{paragraph.num}</span>
        <span className="text-gray-800">
          <AutoLinkReferences
            text={paragraphText}
            references={referenceData}
            currentLawId={lawId}
          />
        </span>
      </div>
    );
  };
  
  const renderArticle = (article: Article) => {
    return (
      <div 
        key={article.id} 
        id={`article-${article.articleNum}`}
        className="mb-6 p-4 bg-white rounded-lg shadow-sm"
      >
        <h3 className="text-lg font-bold mb-3 text-gray-900">
          {article.articleCaption || article.articleNum}
        </h3>
        
        {article.paragraphs.map(p => renderParagraph(p, article.articleNum))}
        
        {/* 参照統計を表示 */}
        {references.get(article.articleNum)?.length > 0 && (
          <div className="mt-3 text-sm text-gray-500">
            参照: {references.get(article.articleNum)?.length}件
          </div>
        )}
      </div>
    );
  };
  
  if (loading) {
    return <div className="text-center py-8">参照データを読み込み中...</div>;
  }
  
  return (
    <div className="space-y-6">
      {/* 参照統計サマリー */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-semibold text-blue-900">参照統計</h4>
        <p className="text-blue-700">
          総参照数: {Array.from(references.values()).flat().length}件
        </p>
      </div>
      
      {/* 条文一覧 */}
      {articles.map(renderArticle)}
    </div>
  );
}