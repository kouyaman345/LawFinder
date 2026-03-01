'use client';

import { useState, useCallback } from 'react';

export interface HistoryEntry {
  lawId: string;
  title: string;
  timestamp: number;
}

export function useNavigationHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const push = useCallback((lawId: string, title: string) => {
    setHistory(prev => {
      // If we're not at the end, truncate forward history
      const truncated = prev.slice(0, currentIndex + 1);

      // Skip if same as current entry
      if (truncated.length > 0 && truncated[truncated.length - 1].lawId === lawId) {
        return truncated;
      }

      return [...truncated, { lawId, title, timestamp: Date.now() }];
    });
    setCurrentIndex(prev => {
      // Only increment if the lawId is different from current
      return prev + 1;
    });
  }, [currentIndex]);

  const goBack = useCallback((): HistoryEntry | null => {
    if (currentIndex <= 0) return null;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    return history[newIndex];
  }, [currentIndex, history]);

  const goForward = useCallback((): HistoryEntry | null => {
    if (currentIndex >= history.length - 1) return null;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    return history[newIndex];
  }, [currentIndex, history]);

  return {
    history,
    currentIndex,
    push,
    goBack,
    goForward,
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < history.length - 1,
  };
}
