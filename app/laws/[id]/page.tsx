'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRightIcon, ChevronDownIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface Item {
  id: string;
  itemNumber: string;
  content: string;
}

interface Paragraph {
  id: string;
  paragraphNumber: number;
  content: string;
  items: Item[];
}

interface Article {
  id: string;
  articleNumber: string;
  articleTitle: string | null;
  content: string;
  paragraphs: Paragraph[];
  referencesFrom: Reference[];
  part?: string | null;
  chapter?: string | null;
  section?: string | null;
  subsection?: string | null;
  division?: string | null;
}

interface Reference {
  id: string;
  referenceText: string;
  referenceType: string;
  confidence: number | null;
  toArticle: {
    id: string;
    articleNumber: string;
    law: {
      id: string;
      title: string;
    };
  } | null;
}

interface Law {
  id: string;
  title: string;
  lawNumber: string | null;
  metadata: any;
  enactStatements: any;
  amendmentHistory: any;
  articles: Article[];
}

interface TocNode {
  type: 'part' | 'chapter' | 'section' | 'subsection' | 'division' | 'article';
  name: string;
  articles: Article[];
  children: TocNode[];
  isExpanded: boolean;
  isVisible: boolean;
}

export default function LawDetailPage() {
  const params = useParams();
  const [law, setLaw] = useState<Law | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [tocTree, setTocTree] = useState<TocNode[]>([]);
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchLaw = async () => {
      try {
        const id = params.id;
        const response = await fetch(`/api/laws/${id}`);
        if (!response.ok) {
          throw new Error('法令の取得に失敗しました');
        }
        const data = await response.json();
        setLaw(data);
        
        // 階層構造を構築
        buildTocTree(data.articles);
        
        // 最初の条文をアクティブに設定
        if (data.articles && data.articles.length > 0) {
          setActiveArticleId(data.articles[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchLaw();
  }, [params.id]);

  const buildTocTree = (articles: Article[]) => {
    const tree: TocNode[] = [];
    let currentPart: TocNode | null = null;
    let currentChapter: TocNode | null = null;
    let currentSection: TocNode | null = null;
    let currentSubsection: TocNode | null = null;

    articles.forEach(article => {
      // 編レベル
      if (article.part && (!currentPart || currentPart.name !== article.part)) {
        currentPart = {
          type: 'part',
          name: article.part,
          articles: [],
          children: [],
          isExpanded: true,
          isVisible: true
        };
        tree.push(currentPart);
        currentChapter = null;
        currentSection = null;
        currentSubsection = null;
      }

      // 章レベル
      if (article.chapter && (!currentChapter || currentChapter.name !== article.chapter)) {
        currentChapter = {
          type: 'chapter',
          name: article.chapter,
          articles: [],
          children: [],
          isExpanded: true,
          isVisible: true
        };
        if (currentPart) {
          currentPart.children.push(currentChapter);
        } else {
          tree.push(currentChapter);
        }
        currentSection = null;
        currentSubsection = null;
      }

      // 節レベル
      if (article.section && (!currentSection || currentSection.name !== article.section)) {
        currentSection = {
          type: 'section',
          name: article.section,
          articles: [],
          children: [],
          isExpanded: true,
          isVisible: true
        };
        if (currentChapter) {
          currentChapter.children.push(currentSection);
        } else if (currentPart) {
          currentPart.children.push(currentSection);
        } else {
          tree.push(currentSection);
        }
        currentSubsection = null;
      }

      // 条文を適切な階層に追加
      const articleNode: TocNode = {
        type: 'article',
        name: `第${article.articleNumber}条${article.articleTitle ? ` ${article.articleTitle}` : ''}`,
        articles: [article],
        children: [],
        isExpanded: false,
        isVisible: true
      };

      if (currentSection) {
        currentSection.articles.push(article);
      } else if (currentChapter) {
        currentChapter.articles.push(article);
      } else if (currentPart) {
        currentPart.articles.push(article);
      } else {
        tree.push(articleNode);
      }
    });

    setTocTree(tree);
  };

  const toggleNode = (node: TocNode) => {
    const updateNode = (nodes: TocNode[]): TocNode[] => {
      return nodes.map(n => {
        if (n === node) {
          return { ...n, isExpanded: !n.isExpanded };
        }
        if (n.children.length > 0) {
          return { ...n, children: updateNode(n.children) };
        }
        return n;
      });
    };
    setTocTree(updateNode(tocTree));
  };

  const toggleVisibility = (node: TocNode) => {
    const nodeId = `${node.type}-${node.name}`;
    const newHiddenSections = new Set(hiddenSections);
    
    if (newHiddenSections.has(nodeId)) {
      newHiddenSections.delete(nodeId);
    } else {
      newHiddenSections.add(nodeId);
    }
    
    setHiddenSections(newHiddenSections);
  };

  const isNodeHidden = (node: TocNode): boolean => {
    return hiddenSections.has(`${node.type}-${node.name}`);
  };

  const scrollToArticle = (articleId: string) => {
    setActiveArticleId(articleId);
    const element = document.getElementById(`article-${articleId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderTocNode = (node: TocNode, level: number = 0) => {
    const hasChildren = node.children.length > 0 || node.articles.length > 0;
    const isHidden = isNodeHidden(node);
    const paddingLeft = `${level * 16}px`;

    if (node.type === 'article') {
      const article = node.articles[0];
      return (
        <li key={article.id} style={{ paddingLeft }}>
          <button
            onClick={() => scrollToArticle(article.id)}
            className={`text-left w-full px-2 py-1 rounded hover:bg-gray-100 text-sm flex items-center ${
              activeArticleId === article.id ? 'bg-blue-50 text-blue-700' : ''
            }`}
          >
            第{article.articleNumber}条
            {article.articleTitle && (
              <span className="text-gray-600 ml-1">{article.articleTitle}</span>
            )}
          </button>
        </li>
      );
    }

    return (
      <li key={`${node.type}-${node.name}`}>
        <div 
          style={{ paddingLeft }}
          className="flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded"
        >
          <button
            onClick={() => hasChildren && toggleNode(node)}
            className="flex items-center flex-1 text-left text-sm font-medium"
          >
            {hasChildren && (
              node.isExpanded ? 
                <ChevronDownIcon className="w-4 h-4 mr-1" /> : 
                <ChevronRightIcon className="w-4 h-4 mr-1" />
            )}
            {!hasChildren && <span className="w-5" />}
            {node.name}
          </button>
          <button
            onClick={() => toggleVisibility(node)}
            className="p-1 hover:bg-gray-200 rounded"
            title={isHidden ? "表示" : "非表示"}
          >
            {isHidden ? 
              <EyeSlashIcon className="w-4 h-4 text-gray-400" /> : 
              <EyeIcon className="w-4 h-4 text-gray-600" />
            }
          </button>
        </div>
        {node.isExpanded && !isHidden && (
          <ul>
            {node.children.map(child => renderTocNode(child, level + 1))}
            {node.articles.map(article => renderTocNode({
              type: 'article',
              name: '',
              articles: [article],
              children: [],
              isExpanded: false,
              isVisible: true
            }, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  const renderReference = (reference: Reference) => {
    const typeStyles = {
      internal: 'text-blue-600 hover:text-blue-800',
      external: 'text-red-600 hover:text-red-800',
      relative: 'text-green-600 hover:text-green-800'
    };

    const style = typeStyles[reference.referenceType as keyof typeof typeStyles] || typeStyles.internal;

    if (reference.toArticle) {
      return (
        <a
          href={`#article-${reference.toArticle.id}`}
          className={`${style} underline`}
          onClick={(e) => {
            e.preventDefault();
            scrollToArticle(reference.toArticle!.id);
          }}
        >
          {reference.referenceText}
        </a>
      );
    }

    return <span className={style}>{reference.referenceText}</span>;
  };

  const shouldShowArticle = (article: Article): boolean => {
    if (article.part && hiddenSections.has(`part-${article.part}`)) return false;
    if (article.chapter && hiddenSections.has(`chapter-${article.chapter}`)) return false;
    if (article.section && hiddenSections.has(`section-${article.section}`)) return false;
    if (article.subsection && hiddenSections.has(`subsection-${article.subsection}`)) return false;
    if (article.division && hiddenSections.has(`division-${article.division}`)) return false;
    return true;
  };

  const renderArticleContent = (article: Article) => {
    if (!shouldShowArticle(article)) return null;

    return (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">
          第{article.articleNumber}条
          {article.articleTitle && <span className="ml-2">{article.articleTitle}</span>}
        </h3>
        {article.paragraphs.map((paragraph, pIndex) => (
          <div key={paragraph.id} className="mb-4">
            {article.paragraphs.length > 1 && (
              <div className="flex">
                <span className="w-8 text-right mr-2">{paragraph.paragraphNumber}</span>
                <div className="flex-1 pl-4">{paragraph.content}</div>
              </div>
            )}
            {article.paragraphs.length === 1 && paragraph.paragraphNumber === 1 && (
              <div className="pl-4">{paragraph.content}</div>
            )}
            {paragraph.items.length > 0 && (
              <div className="mt-2">
                {paragraph.items.map((item) => (
                  <div key={item.id} className="flex mb-1">
                    <span className="w-12 text-right mr-2">{item.itemNumber}</span>
                    <div className="flex-1 pl-8">{item.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {article.referencesFrom.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 pl-4">
            <span className="font-semibold">参照: </span>
            {article.referencesFrom.map((ref, index) => (
              <span key={ref.id}>
                {index > 0 && '、'}
                {renderReference(ref)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (error || !law) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">{error || '法令が見つかりません'}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左サイドバー（目次） */}
      <aside className="w-80 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b bg-gray-100">
          <h2 className="text-lg font-bold">{law.title}</h2>
          {law.metadata?.lawNumber && (
            <p className="text-sm text-gray-600 mt-1">{law.metadata.lawNumber}</p>
          )}
          <Link
            href="/laws"
            className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
          >
            ← 法令一覧に戻る
          </Link>
        </div>
        <nav className="p-4">
          <h3 className="font-semibold mb-2">目次</h3>
          <ul className="space-y-1">
            {tocTree.map(node => renderTocNode(node))}
          </ul>
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8 bg-white min-h-full">
          <header className="mb-8 pb-6 border-b-2">
            <h1 className="text-2xl font-bold mb-2">{law.title}</h1>
            {law.enactStatements?.text && (
              <div className="text-sm text-gray-600 mt-4 p-4 bg-gray-50 rounded">
                {law.enactStatements.text}
              </div>
            )}
          </header>

          <div className="space-y-8">
            {law.articles.map((article) => (
              <article
                key={article.id}
                id={`article-${article.id}`}
                className="scroll-mt-8"
              >
                {renderArticleContent(article)}
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}