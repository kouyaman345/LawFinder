'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronDownIcon, PlusIcon, MinusIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

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
  onArticleVisibilityChange?: (articleId: string, isHidden: boolean) => void;
  onStructureVisibilityChange?: (nodeId: string, isHidden: boolean, affectedArticles: string[]) => void;
}

export function TableOfContents({ structure, articles, onArticleVisibilityChange, onStructureVisibilityChange }: TOCProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
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

  const toggleVisibility = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // 親要素のクリックイベントを防ぐ
    const newHidden = new Set(hiddenNodes);
    const isHidden = newHidden.has(nodeId);
    
    if (isHidden) {
      newHidden.delete(nodeId);
    } else {
      newHidden.add(nodeId);
    }
    setHiddenNodes(newHidden);
    
    // 条文の表示非表示をコールバックで通知
    if (onArticleVisibilityChange && nodeId.startsWith('article-')) {
      onArticleVisibilityChange(nodeId, !isHidden);
    }
    
    // 編・章・節の表示非表示をコールバックで通知
    if (onStructureVisibilityChange && (nodeId.startsWith('part-') || nodeId.startsWith('chapter-') || nodeId.startsWith('section-'))) {
      const affectedArticles = getAffectedArticles(nodeId);
      onStructureVisibilityChange(nodeId, !isHidden, affectedArticles);
    }
  };
  
  // 編・章・節に含まれる条文を取得
  const getAffectedArticles = (nodeId: string): string[] => {
    const affectedArticles: string[] = [];
    
    if (nodeId.startsWith('part-')) {
      const partNum = nodeId.replace('part-', '');
      const part = structure.parts.find(p => p.num === partNum);
      if (part) {
        part.chapters.forEach(chapterNum => {
          const chapter = structure.chapters.find(c => c.num === chapterNum);
          if (chapter) {
            // 章直下の条文
            affectedArticles.push(...chapter.articles);
            // 節に含まれる条文
            chapter.sections.forEach(sectionNum => {
              const section = structure.sections.find(s => s.num === sectionNum);
              if (section) {
                affectedArticles.push(...section.articles);
              }
            });
          }
        });
      }
    } else if (nodeId.startsWith('chapter-')) {
      const chapterNum = nodeId.replace('chapter-', '');
      const chapter = structure.chapters.find(c => c.num === chapterNum);
      if (chapter) {
        // 章直下の条文
        affectedArticles.push(...chapter.articles);
        // 節に含まれる条文
        chapter.sections.forEach(sectionNum => {
          const section = structure.sections.find(s => s.num === sectionNum);
          if (section) {
            affectedArticles.push(...section.articles);
          }
        });
      }
    } else if (nodeId.startsWith('section-')) {
      const sectionNum = nodeId.replace('section-', '');
      const section = structure.sections.find(s => s.num === sectionNum);
      if (section) {
        affectedArticles.push(...section.articles);
      }
    }
    
    return affectedArticles;
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
    key: string,
    context: string = ''
  ) => {
    // 条文の場合、コンテキストを含むIDを生成
    const nodeId = nodeType === 'article' 
      ? `article-${context}-${nodeData.articleNum}`
      : `${nodeType}-${nodeData.num || nodeData.articleNum}`;
    const isExpanded = expandedNodes.has(nodeId);
    const isHidden = hiddenNodes.has(nodeId);
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
          } ${isHidden ? 'toc-node-hidden' : ''}`}
          onClick={() => {
            if (nodeType === 'article') {
              scrollToArticle(nodeData.articleNum);
            } else if (hasChildren) {
              toggleNode(nodeId);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
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
          {/* Eye/Eye-slash アイコン - 条文を含むすべてのノードに表示 */}
          <button
            className="toc-visibility-toggle"
            onClick={(e) => toggleVisibility(nodeId, e)}
            title={isHidden ? "表示" : "非表示"}
          >
            {isHidden ? 
              <EyeSlashIcon className="w-4 h-4" /> : 
              <EyeIcon className="w-4 h-4" />
            }
          </button>
        </div>
        
        {/* 子ノードの表示 - 自身が非表示でない場合のみ */}
        {hasChildren && isExpanded && !isHidden && (
          <div className="toc-children">
            {nodeType === 'part' && nodeData.chapters.map((chapterNum: string, idx: number) => {
              const chapter = structure.chapters.find(c => c.num === chapterNum);
              if (!chapter) return null;
              const newContext = context ? `${context}-part${nodeData.num}` : `part${nodeData.num}`;
              return renderTreeNode('chapter', chapter, level + 1, `part-${nodeData.num}-chapter-${chapterNum}-${idx}`, newContext);
            })}
            
            {nodeType === 'chapter' && (
              <>
                {nodeData.sections.map((sectionNum: string, idx: number) => {
                  const section = structure.sections.find(s => s.num === sectionNum);
                  if (!section) return null;
                  const newContext = context ? `${context}-chapter${nodeData.num}` : `chapter${nodeData.num}`;
                  return renderTreeNode('section', section, level + 1, `chapter-${nodeData.num}-section-${sectionNum}-${idx}`, newContext);
                })}
                {nodeData.articles.map((articleNum: string, idx: number) => {
                  const article = articles.find(a => a.articleNum === articleNum);
                  if (!article) return null;
                  const newContext = context ? `${context}-chapter${nodeData.num}` : `chapter${nodeData.num}`;
                  return renderTreeNode('article', article, level + 1, `chapter-${nodeData.num}-article-${articleNum}-${idx}`, newContext);
                })}
              </>
            )}
            
            {nodeType === 'section' && nodeData.articles.map((articleNum: string, idx: number) => {
              const article = articles.find(a => a.articleNum === articleNum);
              if (!article) return null;
              const newContext = context ? `${context}-section${nodeData.num}` : `section${nodeData.num}`;
              return renderTreeNode('article', article, level + 1, `section-${nodeData.num}-article-${articleNum}-${idx}`, newContext);
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
            renderTreeNode('part', part, 0, `part-${part.num}`, '')
          )}
          
          {/* 編に属さない章 */}
          {structure.chapters.filter(chapter => 
            !structure.parts.some(part => part.chapters.includes(chapter.num))
          ).map((chapter, idx) => 
            renderTreeNode('chapter', chapter, 0, `root-chapter-${chapter.num}-${idx}`, '')
          )}
          
          {/* どこにも属さない条文 */}
          {(() => {
            const orphanArticles = articles.filter(article => {
              const inSection = structure.sections.some(s => s.articles.includes(article.articleNum));
              const inChapter = structure.chapters.some(c => c.articles.includes(article.articleNum));
              return !inSection && !inChapter;
            });
            
            if (orphanArticles.length > 0) {
              const orphanNodesExpanded = expandedNodes.has('orphan-articles');
              const orphanNodesHidden = hiddenNodes.has('orphan-articles');
              
              return (
                <div key="orphan-articles-section" className="toc-node">
                  <div 
                    className="toc-node-content toc-node-level-0"
                    onClick={() => toggleNode('orphan-articles')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <span className="toc-toggle-icon">
                        {orphanNodesExpanded ? 
                          <ChevronDownIcon className="w-4 h-4" /> : 
                          <ChevronRightIcon className="w-4 h-4" />
                        }
                      </span>
                      <span className="toc-node-part">その他の条文</span>
                    </div>
                    <button
                      className="toc-visibility-toggle"
                      onClick={(e) => toggleVisibility('orphan-articles', e)}
                      title={orphanNodesHidden ? "表示" : "非表示"}
                    >
                      {orphanNodesHidden ? 
                        <EyeSlashIcon className="w-4 h-4" /> : 
                        <EyeIcon className="w-4 h-4" />
                      }
                    </button>
                  </div>
                  {orphanNodesExpanded && !orphanNodesHidden && (
                    <div className="toc-children">
                      {orphanArticles.map((article, idx) => 
                        renderTreeNode('article', article, 1, `orphan-article-${article.articleNum}-${idx}`, 'orphan')
                      )}
                    </div>
                  )}
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