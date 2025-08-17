'use client';

import React from 'react';
import Link from 'next/link';
interface Reference {
  sourceArticle: string;
  targetLawId?: string | null;
  targetArticle?: string | null;
  type: string;
  text: string;
  confidence: number;
  metadata?: any;
}

interface LawArticleProps {
  article: {
    articleNum: string;
    articleTitle: string | null;
    isDeleted?: boolean;
    paragraphs: Array<{
      content: string;
      items: Array<{
        title: string;
        content: string;
        subitems?: Array<{
          title: string;
          content: string;
          subsubitems?: Array<{
            title: string;
            content: string;
          }>;
        }>;
      }>;
    }>;
  };
  references: Reference[];
  currentLawId: string;
  showFirstParagraphNumber?: boolean;
}

export function LawArticle({ article, references, currentLawId, showFirstParagraphNumber = false }: LawArticleProps) {
  const applyReferenceLinks = (text: string, refs: Reference[]) => {
    if (!refs || refs.length === 0) {
      return text;
    }
    
    // 参照を位置情報付きで準備
    const refsWithPos = refs.map(ref => {
      const index = text.indexOf(ref.text);
      return {
        ...ref,
        startPos: index,
        endPos: index >= 0 ? index + ref.text.length : -1
      };
    }).filter(r => r.startPos >= 0);
    
    // 重複を除去（より長い参照を優先）
    const nonOverlappingRefs: typeof refsWithPos = [];
    for (const ref of refsWithPos) {
      let isOverlapped = false;
      for (const existing of nonOverlappingRefs) {
        // 重複チェック
        if ((ref.startPos >= existing.startPos && ref.startPos < existing.endPos) ||
            (existing.startPos >= ref.startPos && existing.startPos < ref.endPos)) {
          // より長い方を残す
          if (ref.text.length > existing.text.length) {
            const idx = nonOverlappingRefs.indexOf(existing);
            nonOverlappingRefs[idx] = ref;
          }
          isOverlapped = true;
          break;
        }
      }
      if (!isOverlapped) {
        nonOverlappingRefs.push(ref);
      }
    }
    
    // 位置でソート
    nonOverlappingRefs.sort((a, b) => a.startPos - b.startPos);
    
    // React要素として返すため、分割して処理
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    
    for (const ref of nonOverlappingRefs) {
      // 参照前のテキスト
      if (ref.startPos > lastIndex) {
        elements.push(text.substring(lastIndex, ref.startPos));
      }
      
      // 参照リンク
      if (ref.type === 'external' && ref.targetLawId && ref.targetArticle) {
        elements.push(
          <Link
            key={`${ref.startPos}-${ref.text}`}
            href={`/laws/${ref.targetLawId}#art${ref.targetArticle}`}
            className={`ref-link external-ref`}
            title={`他法令への参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.text}
          </Link>
        );
      } else if (ref.type === 'internal' && ref.targetArticle) {
        elements.push(
          <a
            key={`${ref.startPos}-${ref.text}`}
            href={`#art${ref.targetArticle}`}
            className={`ref-link internal-ref`}
            title={`同一法令内の参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.text}
          </a>
        );
      } else if (ref.type === 'relative' && ref.targetArticle) {
        elements.push(
          <a
            key={`${ref.startPos}-${ref.text}`}
            href={`#art${ref.targetArticle}`}
            className={`ref-link relative-ref`}
            title={`相対参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.text}
          </a>
        );
      } else if (ref.type === 'range' || ref.type === 'multiple') {
        elements.push(
          <span
            key={`${ref.startPos}-${ref.text}`}
            className={`ref-link ${ref.type}-ref`}
            title={`${ref.type === 'range' ? '範囲参照' : '複数参照'}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.text}
          </span>
        );
      } else {
        elements.push(
          <span
            key={`${ref.startPos}-${ref.text}`}
            className="ref-link"
            title={`${ref.type}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.text}
          </span>
        );
      }
      
      lastIndex = ref.endPos;
    }
    
    // 残りのテキスト
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }
    
    return elements;
  };
  
  // この条文に関連する参照を抽出
  const articleRefs = references.filter(r => 
    String(r.sourceArticle) === String(article.articleNum)
  );
  
  // 削除条文の場合は簡略表示
  if (article.isDeleted) {
    return (
      <article className="law-article deleted-article" id={`art${article.articleNum}`}>
        <div className="article-number" style={{ color: '#666', fontStyle: 'italic' }}>
          第{article.articleNum}条　削除
        </div>
      </article>
    );
  }
  
  return (
    <article className="law-article" id={`art${article.articleNum}`}>
      <div className="article-number">
        第{article.articleNum}条
        {article.articleTitle && !article.articleTitle.startsWith('第') && (
          <span className="article-title">　{article.articleTitle}</span>
        )}
      </div>
      
      <div className="article-content">
        {article.paragraphs.map((para, idx) => {
          // 項が複数ある場合のみ番号付けを考慮
          const hasMutipleParagraphs = article.paragraphs.length > 1;
          const paragraphNum = hasMutipleParagraphs ? idx + 1 : 0;
          
          // 項番号表示の判定
          let shouldShowNumber = false;
          if (hasMutipleParagraphs) {
            if (showFirstParagraphNumber) {
              // オプションがONの場合：第一項から番号を表示
              shouldShowNumber = true;
            } else {
              // オプションがOFFの場合：第二項以降のみ番号を表示
              shouldShowNumber = paragraphNum > 1;
            }
          }
          
          const paragraphRefs = articleRefs.filter(r => 
            para.content && para.content.includes(r.text)
          );
          
          return (
            <div key={idx} className="article-paragraph">
              {shouldShowNumber && (
                <span className="paragraph-number">{paragraphNum}</span>
              )}
              <span>
                {applyReferenceLinks(para.content, paragraphRefs)}
              </span>
              
              {para.items.length > 0 && (
                <div className="article-items">
                  {para.items.map((item, itemIdx) => {
                    const itemRefs = articleRefs.filter(r => 
                      item.content && item.content.includes(r.text)
                    );
                    
                    return (
                      <div key={itemIdx} className="article-item">
                        <span className="item-number">{item.title}</span>
                        <span>{applyReferenceLinks(item.content, itemRefs)}</span>
                        
                        {item.subitems && item.subitems.length > 0 && (
                          <div className="subitems">
                            {item.subitems.map((subitem, subIdx) => {
                              const subitemRefs = articleRefs.filter(r => 
                                subitem.content && subitem.content.includes(r.text)
                              );
                              
                              return (
                                <div key={subIdx} className="subitem">
                                  <span className="subitem-number">{subitem.title}</span>
                                  <span>{applyReferenceLinks(subitem.content, subitemRefs)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}