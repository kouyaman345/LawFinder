'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { RelativeReferenceResolver } from '../../src/services/relative-reference-resolver';

interface ReferenceData {
  type: 'internal' | 'external' | 'relative' | 'range' | 'multiple' | 'structural' | 'application' | 'deleted';
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  targetParagraph?: number;
  targetItem?: string;
  text: string;
  confidence?: number;
  metadata?: any;
  // 位置情報
  sourceStartPos?: number;
  sourceEndPos?: number;
  lineNumber?: number;
}

interface CurrentContext {
  lawId: string;
  lawName?: string;
  articleNumber: string;
  paragraphNumber?: number;
  itemNumber?: string;
}

interface EnhancedReferenceLinkProps {
  reference: ReferenceData;
  currentContext: CurrentContext;
  showConfidence?: boolean;
}

// 相対参照解決器のインスタンス
const resolver = new RelativeReferenceResolver();

/**
 * 拡張参照リンクコンポーネント
 * 相対参照（前項、次条など）を自動解決してリンク化
 */
export function EnhancedReferenceLink({ 
  reference, 
  currentContext,
  showConfidence = false
}: EnhancedReferenceLinkProps) {
  const [resolvedReference, setResolvedReference] = useState<ReferenceData>(reference);
  const [tooltip, setTooltip] = useState<string>('');
  const [isHovering, setIsHovering] = useState(false);
  
  useEffect(() => {
    // 相対参照の解決
    if (reference.type === 'relative') {
      const resolved = resolver.resolve(reference.text, currentContext);
      if (resolved && resolved.confidence > 0.5) {
        setResolvedReference({
          ...reference,
          targetArticle: resolved.articleNumber,
          targetParagraph: resolved.paragraphNumber,
          metadata: {
            ...reference.metadata,
            resolved: true,
            originalText: reference.text,
            resolvedTo: resolved.articleDisplay
          }
        });
        
        // ツールチップに解決結果を表示
        let tooltipText = `「${reference.text}」→ ${resolved.articleDisplay}`;
        if (resolved.paragraphNumber) {
          tooltipText += `第${resolved.paragraphNumber}項`;
        }
        if (resolved.error) {
          tooltipText += ` (${resolved.error})`;
        }
        setTooltip(tooltipText);
      } else {
        setTooltip(`相対参照: ${reference.text}`);
      }
    } else {
      // 通常の参照のツールチップ
      generateTooltip(reference);
    }
  }, [reference, currentContext]);
  
  const generateTooltip = (ref: ReferenceData) => {
    let tooltipText = '';
    
    // 参照タイプ
    const typeLabels: Record<string, string> = {
      internal: '同一法令内',
      external: '他法令',
      relative: '相対参照',
      range: '範囲参照',
      multiple: '複数参照',
      structural: '構造参照',
      application: '準用・適用',
      deleted: '削除条文'
    };
    tooltipText = typeLabels[ref.type] || '';
    
    // 参照先情報
    if (ref.targetLawName) {
      tooltipText += ` → ${ref.targetLawName}`;
    }
    if (ref.targetArticle) {
      tooltipText += ` 第${ref.targetArticle}条`;
    }
    if (ref.targetParagraph) {
      tooltipText += ` 第${ref.targetParagraph}項`;
    }
    
    // 信頼度
    if (showConfidence && ref.confidence) {
      tooltipText += ` (信頼度: ${Math.round(ref.confidence * 100)}%)`;
    }
    
    // 位置情報
    if (ref.lineNumber) {
      tooltipText += ` [行:${ref.lineNumber}]`;
    }
    
    setTooltip(tooltipText);
  };
  
  // リンクのスタイルクラスを生成
  const getLinkClass = () => {
    const baseClass = 'ref-link transition-all duration-200';
    const typeClass = `${resolvedReference.type}-ref`;
    const hoverClass = isHovering ? 'ref-link-hover' : '';
    const confidenceClass = resolvedReference.confidence && resolvedReference.confidence < 0.8 
      ? 'low-confidence' : '';
    
    return `${baseClass} ${typeClass} ${hoverClass} ${confidenceClass}`.trim();
  };
  
  // リンク先URLの生成
  const generateHref = () => {
    if (resolvedReference.type === 'deleted') {
      return '#'; // 削除条文はリンクなし
    }
    
    // 同一法令内の参照
    if (resolvedReference.type === 'internal' || 
        resolvedReference.type === 'relative' || 
        !resolvedReference.targetLawId) {
      const articleId = resolvedReference.targetArticle || resolvedReference.text;
      const paragraphId = resolvedReference.targetParagraph 
        ? `-p${resolvedReference.targetParagraph}` : '';
      return `#article-${articleId}${paragraphId}`;
    }
    
    // 他法令への参照
    const targetLaw = resolvedReference.targetLawId || currentContext.lawId;
    const targetArticle = resolvedReference.targetArticle 
      ? `#article-${resolvedReference.targetArticle}` : '';
    return `/laws/${targetLaw}${targetArticle}`;
  };
  
  // 削除条文の場合
  if (resolvedReference.type === 'deleted') {
    return (
      <span 
        className="text-gray-400 line-through cursor-not-allowed"
        title={tooltip}
      >
        {resolvedReference.text}
      </span>
    );
  }
  
  // 通常のリンク
  return (
    <Link
      href={generateHref()}
      className={getLinkClass()}
      title={tooltip}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-reference-type={resolvedReference.type}
      data-target-law={resolvedReference.targetLawId}
      data-target-article={resolvedReference.targetArticle}
      data-confidence={resolvedReference.confidence}
    >
      {resolvedReference.text}
      {/* 信頼度が低い場合は警告アイコン */}
      {showConfidence && resolvedReference.confidence && resolvedReference.confidence < 0.7 && (
        <span className="ml-1 text-yellow-500 text-xs">⚠</span>
      )}
    </Link>
  );
}

/**
 * テキスト内の参照を自動的にリンク化（相対参照解決付き）
 */
export function AutoLinkEnhancedReferences({ 
  text, 
  references, 
  currentContext 
}: {
  text: string;
  references: ReferenceData[];
  currentContext: CurrentContext;
}) {
  if (!references || references.length === 0) {
    return <>{text}</>;
  }
  
  // 参照を位置順にソート
  const sortedRefs = [...references].sort((a, b) => {
    const posA = a.sourceStartPos || text.indexOf(a.text);
    const posB = b.sourceStartPos || text.indexOf(b.text);
    return posA - posB;
  });
  
  const elements: JSX.Element[] = [];
  let lastIndex = 0;
  
  sortedRefs.forEach((ref, index) => {
    const startIndex = ref.sourceStartPos || text.indexOf(ref.text, lastIndex);
    
    if (startIndex === -1 || startIndex < lastIndex) return;
    
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
      <EnhancedReferenceLink
        key={`ref-${index}`}
        reference={ref}
        currentContext={currentContext}
      />
    );
    
    lastIndex = ref.sourceEndPos || (startIndex + ref.text.length);
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

/**
 * 参照タイプ別の凡例コンポーネント
 */
export function ReferenceLegend() {
  const types = [
    { type: 'internal', label: '同一法令内', className: 'internal-ref' },
    { type: 'external', label: '他法令', className: 'external-ref' },
    { type: 'relative', label: '相対参照', className: 'relative-ref' },
    { type: 'range', label: '範囲参照', className: 'range-ref' },
    { type: 'multiple', label: '複数参照', className: 'multiple-ref' },
    { type: 'structural', label: '構造参照', className: 'structural-ref' },
    { type: 'application', label: '準用・適用', className: 'application-ref' }
  ];
  
  return (
    <div className="reference-legend">
      <h3 className="text-sm font-semibold mb-2">参照タイプ凡例</h3>
      <div className="flex flex-wrap gap-3">
        {types.map(({ type, label, className }) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`ref-link ${className} px-1 text-xs`}>例</span>
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}