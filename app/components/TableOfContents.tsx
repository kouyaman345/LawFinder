'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronDownIcon, PlusIcon, MinusIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface TOCProps {
  structure: {
    divisions?: Array<{
      num: string;
      title: string;
      parts: string[];
      chapters: string[];
      articles: string[];
    }>;
    parts: Array<{
      num: string;
      title: string;
      chapters: string[];
      articles: string[];
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
  enactStatements?: string[]; // 制定文を追加
  onArticleVisibilityChange?: (articleId: string, isHidden: boolean) => void;
  onStructureVisibilityChange?: (nodeId: string, isHidden: boolean, affectedArticles: string[]) => void;
}

export function TableOfContents({ structure, articles, enactStatements, onArticleVisibilityChange, onStructureVisibilityChange }: TOCProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [activeArticle, setActiveArticle] = useState<string>('');

  // 初期状態で区分（本則・附則）と編を展開
  useEffect(() => {
    const initialExpanded = new Set<string>();
    
    // 区分（本則・附則）を展開
    if (structure.divisions) {
      structure.divisions.forEach(division => {
        initialExpanded.add(`division-${division.num}`);
      });
    }
    
    // 編を展開
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
    nodeType: 'division' | 'part' | 'chapter' | 'section' | 'article',
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
      (nodeType === 'division' && (nodeData.parts?.length > 0 || nodeData.chapters?.length > 0 || nodeData.articles?.length > 0)) ||
      (nodeType === 'part' && (nodeData.chapters?.length > 0 || nodeData.articles?.length > 0)) ||
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
            {nodeType === 'division' && (
              <>
                {nodeData.parts?.map((partTitle: string, idx: number) => {
                  const part = structure.parts.find(p => p.title === partTitle);
                  if (!part) return null;
                  const newContext = context ? `${context}-div${nodeData.num}` : `div${nodeData.num}`;
                  return renderTreeNode('part', part, level + 1, `div-${nodeData.num}-part-${part.num}-${idx}`, newContext);
                })}
                {nodeData.chapters?.map((chapterTitle: string, idx: number) => {
                  const chapter = structure.chapters.find(c => c.title === chapterTitle);
                  if (!chapter) return null;
                  const newContext = context ? `${context}-div${nodeData.num}` : `div${nodeData.num}`;
                  return renderTreeNode('chapter', chapter, level + 1, `div-${nodeData.num}-chapter-${chapter.num}-${idx}`, newContext);
                })}
                {nodeData.articles?.map((articleNum: string, idx: number) => {
                  const article = articles.find(a => a.articleNum === articleNum);
                  if (!article) return null;
                  const newContext = context ? `${context}-div${nodeData.num}` : `div${nodeData.num}`;
                  return renderTreeNode('article', article, level + 1, `div-${nodeData.num}-article-${articleNum}-${idx}`, newContext);
                })}
              </>
            )}
            
            {nodeType === 'part' && (
              <>
                {nodeData.chapters?.map((chapterTitle: string, idx: number) => {
                  const chapter = structure.chapters.find(c => c.title === chapterTitle);
                  if (!chapter) return null;
                  const newContext = context ? `${context}-part${nodeData.num}` : `part${nodeData.num}`;
                  return renderTreeNode('chapter', chapter, level + 1, `part-${nodeData.num}-chapter-${chapter.num}-${idx}`, newContext);
                })}
                {nodeData.articles?.map((articleNum: string, idx: number) => {
                  const article = articles.find(a => a.articleNum === articleNum);
                  if (!article) return null;
                  const newContext = context ? `${context}-part${nodeData.num}` : `part${nodeData.num}`;
                  return renderTreeNode('article', article, level + 1, `part-${nodeData.num}-article-${articleNum}-${idx}`, newContext);
                })}
              </>
            )}
            
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
          {/* 制定文 */}
          {enactStatements && enactStatements.length > 0 && (
            <div className="toc-node">
              <div 
                className="toc-node-content toc-node-level-0"
                onClick={() => {
                  const element = document.getElementById('enact-statements');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <span className="toc-toggle-icon"></span>
                  <span className="toc-node-part">制定文</span>
                </div>
              </div>
            </div>
          )}
          
          {/* 区分（本則・附則）の表示 */}
          {structure.divisions && structure.divisions.length > 0 ? (
            structure.divisions.map((division) => 
              renderTreeNode('division', division, 0, `division-${division.num}`, '')
            )
          ) : (
            <>
              {/* 区分がない場合は従来通り編から表示 */}
              {structure.parts.map((part) => 
                renderTreeNode('part', part, 0, `part-${part.num}`, '')
              )}
              
              {/* 編に属さない章 */}
              {structure.chapters.filter(chapter => 
                !structure.parts.some(part => part.chapters.includes(chapter.title))
              ).map((chapter, idx) => 
                renderTreeNode('chapter', chapter, 0, `root-chapter-${chapter.num}-${idx}`, '')
              )}
            </>
          )}
          
          {/* どこにも属さない条文（通常は存在しないはず） */}
          {(() => {
            const orphanArticles = articles.filter(article => {
              // divisionに属しているかチェック
              const inDivision = structure.divisions?.some(d => 
                d.articles.includes(article.articleNum) ||
                d.parts.some((partTitle: string) => {
                  const part = structure.parts.find(p => p.title === partTitle);
                  return part && (
                    part.articles.includes(article.articleNum) ||
                    part.chapters.some((chapterTitle: string) => {
                      const chapter = structure.chapters.find(c => c.title === chapterTitle);
                      return chapter && (
                        chapter.articles.includes(article.articleNum) ||
                        chapter.sections.some((sectionNum: string) => {
                          const section = structure.sections.find(s => s.num === sectionNum);
                          return section && section.articles.includes(article.articleNum);
                        })
                      );
                    })
                  );
                }) ||
                d.chapters.some((chapterTitle: string) => {
                  const chapter = structure.chapters.find(c => c.title === chapterTitle);
                  return chapter && (
                    chapter.articles.includes(article.articleNum) ||
                    chapter.sections.some((sectionNum: string) => {
                      const section = structure.sections.find(s => s.num === sectionNum);
                      return section && section.articles.includes(article.articleNum);
                    })
                  );
                })
              );
              
              // 編・章・節に属しているかチェック（divisionがない場合）
              if (!structure.divisions || structure.divisions.length === 0) {
                const inPart = structure.parts.some(p => 
                  p.articles.includes(article.articleNum) ||
                  p.chapters.some((chapterTitle: string) => {
                    const chapter = structure.chapters.find(c => c.title === chapterTitle);
                    return chapter && (
                      chapter.articles.includes(article.articleNum) ||
                      chapter.sections.some((sectionNum: string) => {
                        const section = structure.sections.find(s => s.num === sectionNum);
                        return section && section.articles.includes(article.articleNum);
                      })
                    );
                  })
                );
                
                const inChapter = structure.chapters.some(c => 
                  c.articles.includes(article.articleNum) ||
                  c.sections.some((sectionNum: string) => {
                    const section = structure.sections.find(s => s.num === sectionNum);
                    return section && section.articles.includes(article.articleNum);
                  })
                );
                
                const inSection = structure.sections.some(s => 
                  s.articles.includes(article.articleNum)
                );
                
                return !inPart && !inChapter && !inSection;
              }
              
              return !inDivision;
            });
            
            // デバッグ用：orphanArticlesが存在する場合は警告
            if (orphanArticles.length > 0) {
              console.warn(`警告: ${orphanArticles.length}個の条文がどこにも属していません`);
              console.warn('orphan articles:', orphanArticles.slice(0, 5).map(a => a.articleNum));
            }
            
            // orphanArticlesは通常存在しないので、この部分は表示しない
            return null;
          })()}
        </div>
      </div>
    </aside>
  );
}