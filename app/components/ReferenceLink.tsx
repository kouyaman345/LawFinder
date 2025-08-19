'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface ReferenceData {
  type: 'internal' | 'external' | 'range' | 'application' | 'deleted';
  targetLawId?: string;
  targetArticle?: string;
  text: string;
  metadata?: any;
}

interface ReferenceLinkProps {
  reference: ReferenceData;
  currentLawId: string;
}

/**
 * 参照リンクコンポーネント
 * Neo4jから取得した参照データをもとにリンクを生成
 */
export function ReferenceLink({ reference, currentLawId }: ReferenceLinkProps) {
  const [tooltip, setTooltip] = useState<string>('');
  
  useEffect(() => {
    // ツールチップテキストの設定
    if (reference.metadata?.expandedFrom) {
      setTooltip(`略称: ${reference.metadata.expandedFrom}`);
    } else if (reference.metadata?.isDeleted) {
      setTooltip('削除された条文');
    } else if (reference.type === 'application') {
      setTooltip('準用・適用');
    }
  }, [reference]);
  
  // リンクのスタイルを参照タイプによって変更
  const getLinkStyle = () => {
    switch (reference.type) {
      case 'deleted':
        return 'text-gray-400 line-through cursor-not-allowed';
      case 'external':
        return 'text-blue-600 underline hover:text-blue-800';
      case 'internal':
        return 'text-green-600 underline hover:text-green-800';
      case 'range':
        return 'text-purple-600 underline hover:text-purple-800';
      case 'application':
        return 'text-orange-600 underline hover:text-orange-800';
      default:
        return 'text-blue-600 underline hover:text-blue-800';
    }
  };
  
  // リンク先URLの生成
  const generateHref = () => {
    if (reference.type === 'deleted') {
      return '#'; // 削除条文はリンクなし
    }
    
    if (reference.type === 'internal' || !reference.targetLawId) {
      // 同一法令内の参照
      return `#article-${reference.targetArticle || reference.text}`;
    }
    
    // 他法令への参照
    const targetLaw = reference.targetLawId || currentLawId;
    const targetArticle = reference.targetArticle ? `#article-${reference.targetArticle}` : '';
    return `/laws/${targetLaw}${targetArticle}`;
  };
  
  // 削除条文の場合はリンクではなくspan
  if (reference.type === 'deleted') {
    return (
      <span 
        className={getLinkStyle()}
        title={tooltip}
      >
        {reference.text}
      </span>
    );
  }
  
  // 通常のリンク
  return (
    <Link
      href={generateHref()}
      className={getLinkStyle()}
      title={tooltip}
      data-reference-type={reference.type}
      data-target-law={reference.targetLawId}
      data-target-article={reference.targetArticle}
    >
      {reference.text}
    </Link>
  );
}

/**
 * テキスト内の参照を自動的にリンク化
 */
export function AutoLinkReferences({ 
  text, 
  references, 
  currentLawId 
}: {
  text: string;
  references: ReferenceData[];
  currentLawId: string;
}) {
  if (!references || references.length === 0) {
    return <>{text}</>;
  }
  
  // 参照を位置順にソート
  const sortedRefs = [...references].sort((a, b) => {
    const posA = text.indexOf(a.text);
    const posB = text.indexOf(b.text);
    return posA - posB;
  });
  
  const elements: JSX.Element[] = [];
  let lastIndex = 0;
  
  sortedRefs.forEach((ref, index) => {
    const startIndex = text.indexOf(ref.text, lastIndex);
    
    if (startIndex === -1) return;
    
    // 参照前のテキスト
    if (startIndex > lastIndex) {
      elements.push(
        <span key={`text-${index}`}>
          {text.substring(lastIndex, startIndex)}
        </span>
      );
    }
    
    // 参照リンク
    elements.push(
      <ReferenceLink
        key={`ref-${index}`}
        reference={ref}
        currentLawId={currentLawId}
      />
    );
    
    lastIndex = startIndex + ref.text.length;
  });
  
  // 最後の残りテキスト
  if (lastIndex < text.length) {
    elements.push(
      <span key="text-last">
        {text.substring(lastIndex)}
      </span>
    );
  }
  
  return <>{elements}</>;
}