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

const STEP = 30;
const MAX_LIMIT = 100;

export default function NetworkGraph({ lawId, onNodeClick, articleNumber, mode = 'law' }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<any>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [limit, setLimit] = useState(STEP);
  const [loading, setLoading] = useState(false);
  const [stabilizing, setStabilizing] = useState(false);
  const [stabilizationProgress, setStabilizationProgress] = useState(0);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);

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
        s.length > max ? s.slice(0, max) + '...' : s;

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

      // Adaptive physics parameters based on node count
      const gravity = nodeCount > 80 ? -5000 : nodeCount > 40 ? -3000 : -1500;
      const springLen = nodeCount > 80 ? 250 : nodeCount > 40 ? 180 : 130;
      const damping = nodeCount > 80 ? 0.5 : nodeCount > 40 ? 0.3 : 0.09;
      const stabilizationIter = nodeCount > 80 ? 150 : nodeCount > 40 ? 200 : 300;
      const minVel = nodeCount > 80 ? 3.0 : nodeCount > 40 ? 1.5 : 0.75;

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
            damping: damping,
            avoidOverlap: 1,
          },
          stabilization: { iterations: stabilizationIter, fit: true },
          minVelocity: minVel,
          maxVelocity: 30,
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

      // Track stabilization progress
      setStabilizing(true);
      setStabilizationProgress(0);
      setPhysicsEnabled(true);

      network.on('stabilizationProgress', (params: any) => {
        setStabilizationProgress(Math.round((params.iterations / params.total) * 100));
      });

      network.on('stabilizationIterationsDone', () => {
        setStabilizing(false);
        setStabilizationProgress(100);
        // Disable physics after stabilization to prevent endless movement
        network.setOptions({ physics: { enabled: false } });
        setPhysicsEnabled(false);
      });

      network.on('click', (params: any) => {
        if (params.nodes.length > 0) {
          const clickedId = params.nodes[0] as string;
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
      {/* Graph container with stabilization overlay */}
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg"
          style={{ height: 500 }}
        />

        {/* Stabilization progress overlay */}
        {stabilizing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg z-10">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">
                安定化中... {stabilizationProgress}%
              </div>
              <div className="w-48 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${stabilizationProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

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
            {/* Physics toggle button */}
            <button
              onClick={() => {
                if (networkRef.current) {
                  const newState = !physicsEnabled;
                  networkRef.current.setOptions({ physics: { enabled: newState } });
                  setPhysicsEnabled(newState);
                }
              }}
              className={`px-2 py-1 rounded text-xs ${
                physicsEnabled
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {physicsEnabled ? '物理停止' : '物理開始'}
            </button>

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
