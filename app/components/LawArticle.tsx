'use client';

import React from 'react';
import Link from 'next/link';
import { DetectedReference } from '../../src/utils/reference-detector';

interface LawArticleProps {
  article: {
    articleNum: string;
    articleTitle: string | null;
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
  references: DetectedReference[];
  currentLawId: string;
  showFirstParagraphNumber?: boolean;
}

export function LawArticle({ article, references, showFirstParagraphNumber = false }: LawArticleProps) {
  const applyReferenceLinks = (text: string, refs: DetectedReference[]) => {
    let processed = text;
    
    // 参照でソート（長いものを優先）
    const sortedRefs = refs.sort((a, b) => {
      if (a.sourceText.length !== b.sourceText.length) {
        return b.sourceText.length - a.sourceText.length;
      }
      return b.confidence - a.confidence;
    });
    
    // React要素として返すため、分割して処理
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    
    for (const ref of sortedRefs) {
      const index = processed.indexOf(ref.sourceText, lastIndex);
      if (index === -1) continue;
      
      // 参照前のテキスト
      if (index > lastIndex) {
        elements.push(processed.substring(lastIndex, index));
      }
      
      // 参照リンク
      if (ref.type === 'external' && ref.targetLawId && ref.targetArticleNumber) {
        elements.push(
          <Link
            key={`${index}-${ref.sourceText}`}
            href={`/laws/${ref.targetLawId}#art${ref.targetArticleNumber}`}
            className={`ref-link external-ref`}
            title={`他法令への参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.sourceText}
          </Link>
        );
      } else if (ref.type === 'internal' && ref.targetArticleNumber) {
        elements.push(
          <a
            key={`${index}-${ref.sourceText}`}
            href={`#art${ref.targetArticleNumber}`}
            className={`ref-link internal-ref`}
            title={`同一法令内の参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.sourceText}
          </a>
        );
      } else if (ref.type === 'relative') {
        elements.push(
          <span
            key={`${index}-${ref.sourceText}`}
            className={`ref-link relative-ref`}
            title={`相対参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.sourceText}
          </span>
        );
      } else if (ref.type === 'complex') {
        elements.push(
          <span
            key={`${index}-${ref.sourceText}`}
            className={`ref-link complex-ref`}
            title={`複合参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.sourceText}
          </span>
        );
      } else {
        elements.push(
          <span
            key={`${index}-${ref.sourceText}`}
            className="ref-link"
            title={`${ref.type}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）`}
          >
            {ref.sourceText}
          </span>
        );
      }
      
      lastIndex = index + ref.sourceText.length;
    }
    
    // 残りのテキスト
    if (lastIndex < processed.length) {
      elements.push(processed.substring(lastIndex));
    }
    
    return elements;
  };
  
  // この条文に関連する参照を抽出
  const articleRefs = references.filter(r => 
    String(r.sourceArticleNumber) === String(article.articleNum)
  );
  
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
            para.content && para.content.includes(r.sourceText)
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
                      item.content && item.content.includes(r.sourceText)
                    );
                    
                    return (
                      <div key={itemIdx} className="article-item">
                        <span className="item-number">{item.title}</span>
                        <span>{applyReferenceLinks(item.content, itemRefs)}</span>
                        
                        {item.subitems && item.subitems.length > 0 && (
                          <div className="subitems">
                            {item.subitems.map((subitem, subIdx) => {
                              const subitemRefs = articleRefs.filter(r => 
                                subitem.content && subitem.content.includes(r.sourceText)
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