'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronDownIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

interface TOCProps {
  structure: {
    parts: Array<{
      num: string;
      title: string;
      chapters: string[];
    }>;
    chapters: Array<{
      num: string;
      title: string;
      sections: string[];
      articles: string[];
    }>;
    sections: Array<{
      num: string;
      title: string;
      articles: string[];
    }>;
  };
  articles: Array<{
    articleNum: string;
    articleTitle: string | null;
  }>;
}

export function TableOfContents({ structure, articles }: TOCProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeArticle, setActiveArticle] = useState<string>('');

  // 初期状態で第1レベルのみ展開
  useEffect(() => {
    const initialExpanded = new Set<string>();
    structure.parts.forEach(part => {
      initialExpanded.add(`part-${part.num}`);
    });
    // 編に属さない章も展開
    structure.chapters.filter(chapter => 
      !structure.parts.some(part => part.chapters.includes(chapter.num))
    ).forEach(chapter => {
      initialExpanded.add(`chapter-${chapter.num}`);
    });
    setExpandedNodes(initialExpanded);
  }, [structure]);

  // スクロール位置に応じてアクティブな条文を更新
  useEffect(() => {
    const handleScroll = () => {
      const articleElements = document.querySelectorAll('.law-article');
      let currentArticle = '';
      
      articleElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom > 100) {
          currentArticle = element.id.replace('art', '');
        }
      });
      
      if (currentArticle) {
        setActiveArticle(currentArticle);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // 初期実行
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = () => {
    const allNodes = new Set<string>();
    structure.parts.forEach(part => {
      allNodes.add(`part-${part.num}`);
      part.chapters.forEach(chapterNum => {
        allNodes.add(`chapter-${chapterNum}`);
        const chapter = structure.chapters.find(c => c.num === chapterNum);
        if (chapter) {
          chapter.sections.forEach(sectionNum => {
            allNodes.add(`section-${sectionNum}`);
          });
        }
      });
    });
    structure.chapters.forEach(chapter => {
      allNodes.add(`chapter-${chapter.num}`);
      chapter.sections.forEach(sectionNum => {
        allNodes.add(`section-${sectionNum}`);
      });
    });
    setExpandedNodes(allNodes);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const scrollToArticle = (articleNum: string) => {
    const element = document.getElementById(`art${articleNum}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderTreeNode = (
    nodeType: 'part' | 'chapter' | 'section' | 'article',
    nodeData: any,
    level: number = 0,
    key: string
  ) => {
    const nodeId = `${nodeType}-${nodeData.num || nodeData.articleNum}`;
    const isExpanded = expandedNodes.has(nodeId);
    const hasChildren = nodeType !== 'article' && (
      (nodeType === 'part' && nodeData.chapters?.length > 0) ||
      (nodeType === 'chapter' && (nodeData.sections?.length > 0 || nodeData.articles?.length > 0)) ||
      (nodeType === 'section' && nodeData.articles?.length > 0)
    );

    return (
      <div key={key} className="toc-node">
        <div 
          className={`toc-node-content toc-node-level-${level} ${
            nodeType === 'article' && activeArticle === nodeData.articleNum ? 'active' : ''
          }`}
          onClick={() => {
            if (nodeType === 'article') {
              scrollToArticle(nodeData.articleNum);
            } else if (hasChildren) {
              toggleNode(nodeId);
            }
          }}
        >
          <span className="toc-toggle-icon">
            {hasChildren && (
              isExpanded ? 
                <ChevronDownIcon className="w-4 h-4" /> : 
                <ChevronRightIcon className="w-4 h-4" />
            )}
          </span>
          <span className={`toc-node-${nodeType}`}>
            {nodeType === 'article' ? (
              <>
                第{nodeData.articleNum}条
                {nodeData.articleTitle && ` ${nodeData.articleTitle}`}
              </>
            ) : (
              nodeData.title
            )}
          </span>
        </div>
        
        {/* 子ノードの表示 */}
        {hasChildren && isExpanded && (
          <div className="toc-children">
            {nodeType === 'part' && nodeData.chapters.map((chapterNum: string, idx: number) => {
              const chapter = structure.chapters.find(c => c.num === chapterNum);
              if (!chapter) return null;
              return renderTreeNode('chapter', chapter, level + 1, `part-${nodeData.num}-chapter-${chapterNum}-${idx}`);
            })}
            
            {nodeType === 'chapter' && (
              <>
                {nodeData.sections.map((sectionNum: string, idx: number) => {
                  const section = structure.sections.find(s => s.num === sectionNum);
                  if (!section) return null;
                  return renderTreeNode('section', section, level + 1, `chapter-${nodeData.num}-section-${sectionNum}-${idx}`);
                })}
                {nodeData.articles.map((articleNum: string, idx: number) => {
                  const article = articles.find(a => a.articleNum === articleNum);
                  if (!article) return null;
                  return renderTreeNode('article', article, level + 1, `chapter-${nodeData.num}-article-${articleNum}-${idx}`);
                })}
              </>
            )}
            
            {nodeType === 'section' && nodeData.articles.map((articleNum: string, idx: number) => {
              const article = articles.find(a => a.articleNum === articleNum);
              if (!article) return null;
              return renderTreeNode('article', article, level + 1, `section-${nodeData.num}-article-${articleNum}-${idx}`);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="toc-section">
      <div className="toc-header">
        <span>目次</span>
        <div className="toc-controls">
          <button 
            className="toc-control-btn" 
            onClick={expandAll}
            title="全て展開"
          >
            <PlusIcon className="w-3 h-3 inline" />
          </button>
          <button 
            className="toc-control-btn" 
            onClick={collapseAll}
            title="全て折りたたむ"
          >
            <MinusIcon className="w-3 h-3 inline" />
          </button>
        </div>
      </div>
      
      <div className="toc-content">
        <div className="toc-tree">
          {/* 編の表示 */}
          {structure.parts.map((part) => 
            renderTreeNode('part', part, 0, `part-${part.num}`)
          )}
          
          {/* 編に属さない章 */}
          {structure.chapters.filter(chapter => 
            !structure.parts.some(part => part.chapters.includes(chapter.num))
          ).map((chapter, idx) => 
            renderTreeNode('chapter', chapter, 0, `root-chapter-${chapter.num}-${idx}`)
          )}
          
          {/* どこにも属さない条文 */}
          {(() => {
            const orphanArticles = articles.filter(article => {
              const inSection = structure.sections.some(s => s.articles.includes(article.articleNum));
              const inChapter = structure.chapters.some(c => c.articles.includes(article.articleNum));
              return !inSection && !inChapter;
            });
            
            if (orphanArticles.length > 0) {
              return (
                <div key="orphan-articles-section" className="toc-node">
                  <div className="toc-node-content toc-node-level-0">
                    <span className="toc-toggle-icon"></span>
                    <span className="toc-node-chapter">その他の条文</span>
                  </div>
                  <div className="toc-children">
                    {orphanArticles.map((article, idx) => 
                      renderTreeNode('article', article, 1, `orphan-article-${article.articleNum}-${idx}`)
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </aside>
  );
}