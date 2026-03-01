'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface GraphData {
  center: { lawId: string; title: string; article?: string };
  nodes: { id: string; label: string; group: string }[];
  edges: { from: string; to: string; arrows: string }[];
  stats: {
    outgoing: number;
    incoming: number;
    totalOutgoing?: number;
    totalIncoming?: number;
  };
}

interface NetworkGraphProps {
  lawId: string;
  onNodeClick: (lawId: string) => void;
  articleNumber?: string | null;
  mode?: 'law' | 'article';
}

const STEP = 50;
const MAX_LIMIT = 200;

export default function NetworkGraph({ lawId, onNodeClick, articleNumber, mode = 'law' }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<any>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [limit, setLimit] = useState(STEP);
  const [loading, setLoading] = useState(false);

  const fetchGraph = useCallback(async (lim: number) => {
    setLoading(true);
    try {
      let url: string;
      if (mode === 'article' && articleNumber) {
        url = `/api/network?action=article-graph&lawId=${encodeURIComponent(lawId)}&article=${encodeURIComponent(articleNumber)}&limit=${lim}`;
      } else {
        url = `/api/network?action=graph&lawId=${encodeURIComponent(lawId)}&limit=${lim}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data: GraphData = await res.json();
      setGraphData(data);
    } catch (err) {
      console.error('Graph fetch error:', err);
    }
    setLoading(false);
  }, [lawId, mode, articleNumber]);

  // Reset limit and fetch when lawId/mode/article changes
  useEffect(() => {
    setLimit(STEP);
    fetchGraph(STEP);
  }, [lawId, mode, articleNumber, fetchGraph]);

  // Re-fetch when limit increases
  useEffect(() => {
    if (limit > STEP) {
      fetchGraph(limit);
    }
  }, [limit, fetchGraph]);

  // Render vis.js network
  useEffect(() => {
    if (!graphData || !containerRef.current) return;

    let destroyed = false;

    const render = async () => {
      const { Network } = await import('vis-network');
      const { DataSet } = await import('vis-data');

      if (destroyed || !containerRef.current) return;

      // Destroy previous instance
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }

      const truncate = (s: string, max: number) =>
        s.length > max ? s.slice(0, max) + '…' : s;

      const visNodes = new DataSet(
        graphData.nodes.map(n => ({
          id: n.id,
          label: truncate(n.label, 10),
          title: n.label, // full name on hover tooltip
          group: n.group,
        }))
      );

      const visEdges = new DataSet(
        graphData.edges.map((e, i) => ({
          id: `e${i}`,
          from: e.from,
          to: e.to,
          arrows: e.arrows,
        }))
      );

      const nodeCount = graphData.nodes.length;
      // Dynamically scale repulsion based on node count
      const gravity = nodeCount > 60 ? -8000 : nodeCount > 30 ? -5000 : -3000;
      const springLen = nodeCount > 60 ? 350 : nodeCount > 30 ? 280 : 220;

      const options: any = {
        groups: {
          center: {
            color: { background: '#2563EB', border: '#1E40AF', highlight: { background: '#1D4ED8', border: '#1E3A8A' } },
            font: { color: '#ffffff', size: 14, bold: { color: '#ffffff' } },
            shape: 'box',
            borderWidth: 2,
            margin: 8,
          },
          outgoing: {
            color: { background: '#059669', border: '#047857', highlight: { background: '#047857', border: '#065F46' } },
            font: { color: '#ffffff', size: 11 },
            shape: 'box',
            borderWidth: 1,
            margin: 5,
          },
          incoming: {
            color: { background: '#EA580C', border: '#C2410C', highlight: { background: '#C2410C', border: '#9A3412' } },
            font: { color: '#ffffff', size: 11 },
            shape: 'box',
            borderWidth: 1,
            margin: 5,
          },
        },
        edges: {
          color: { color: '#CBD5E1', highlight: '#3B82F6', opacity: 0.4 },
          width: 1,
          smooth: { type: 'continuous' as const, roundness: 0.2 },
          arrows: { to: { scaleFactor: 0.4 } },
        },
        physics: {
          solver: 'barnesHut' as const,
          barnesHut: {
            gravitationalConstant: gravity,
            centralGravity: 0.3,
            springLength: springLen,
            springConstant: 0.02,
            damping: 0.09,
            avoidOverlap: 1,
          },
          stabilization: { iterations: 300, fit: true },
          minVelocity: 0.75,
        },
        interaction: {
          hover: true,
          tooltipDelay: 100,
          zoomView: true,
          dragView: true,
        },
        layout: { improvedLayout: true },
      };

      const network = new Network(
        containerRef.current!,
        { nodes: visNodes, edges: visEdges },
        options
      );

      network.on('click', (params: any) => {
        if (params.nodes.length > 0) {
          const clickedId = params.nodes[0] as string;
          // Extract lawId from node ID (could be "lawId" or "lawId#articleNumber")
          const extractedLawId = clickedId.includes('#') ? clickedId.split('#')[0] : clickedId;
          if (extractedLawId !== lawId) {
            onNodeClick(extractedLawId);
          }
        }
      });

      networkRef.current = network;
    };

    render();

    return () => {
      destroyed = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [graphData, lawId, onNodeClick]);

  const totalConnections = graphData
    ? (graphData.stats.totalOutgoing ?? graphData.stats.outgoing) + (graphData.stats.totalIncoming ?? graphData.stats.incoming)
    : 0;
  const shownConnections = graphData
    ? graphData.stats.outgoing + graphData.stats.incoming
    : 0;
  const canLoadMore = graphData && limit < MAX_LIMIT && shownConnections < totalConnections;

  return (
    <div>
      {/* Graph container */}
      <div
        ref={containerRef}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg"
        style={{ height: 500 }}
      />

      {/* Legend bar */}
      {graphData && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-b-lg text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ background: '#3B82F6' }} />
              {mode === 'article' ? '選択中の条文' : '選択中の法令'}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ background: '#10B981' }} />
              参照先 ({graphData.stats.outgoing})
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ background: '#F97316' }} />
              被参照 ({graphData.stats.incoming})
            </span>
            {mode === 'article' && (
              <span className="text-gray-400 ml-2">条文モード</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">
              {shownConnections}/{totalConnections}件表示
            </span>
            {canLoadMore && (
              <button
                onClick={() => setLimit(prev => Math.min(prev + STEP, MAX_LIMIT))}
                disabled={loading}
                className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '読込中...' : 'もっと表示'}
              </button>
            )}
          </div>
        </div>
      )}

      {loading && !graphData && (
        <div className="flex items-center justify-center h-[500px] bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-gray-500">グラフを読み込み中...</div>
        </div>
      )}
    </div>
  );
}
