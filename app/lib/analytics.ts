/**
 * Google Analytics 4 event tracking utilities for LawFinder.
 *
 * Usage:
 *   import { trackEvent } from '@/app/lib/analytics';
 *   trackEvent('search', { search_term: 'keyword' });
 */

// ---------------------------------------------------------------------------
// Measurement IDs - replace these placeholders before production deployment
// ---------------------------------------------------------------------------
export const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
export const CLARITY_PROJECT_ID = 'XXXXXXXXXX';

// ---------------------------------------------------------------------------
// Custom event type definitions
// ---------------------------------------------------------------------------

/** User performed a law search. */
export interface SearchEvent {
  search_term: string;
  result_count?: number;
}

/** User selected a specific law from a list or search result. */
export interface LawSelectEvent {
  law_id: string;
  law_title?: string;
}

/** User selected an article within a law. */
export interface ArticleSelectEvent {
  law_id: string;
  article_number: string;
  article_title?: string;
}

/** User clicked a reference link (outgoing or incoming). */
export interface ReferenceClickEvent {
  source_law_id: string;
  target_law_id: string;
  reference_type?: string;
}

/** User switched between outgoing / incoming reference tabs. */
export interface TabChangeEvent {
  tab_name: string;
  law_id?: string;
}

/**
 * Union of all recognised custom event payloads keyed by event name.
 * This map is used to enforce type-safe calls to `trackEvent`.
 */
export interface AnalyticsEventMap {
  search: SearchEvent;
  law_select: LawSelectEvent;
  article_select: ArticleSelectEvent;
  reference_click: ReferenceClickEvent;
  tab_change: TabChangeEvent;
}

// ---------------------------------------------------------------------------
// Global type augmentation for gtag on window
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    gtag?: (
      command: string,
      targetOrEvent: string,
      params?: Record<string, unknown>,
    ) => void;
    dataLayer?: unknown[];
  }
}

// ---------------------------------------------------------------------------
// Core tracking helper
// ---------------------------------------------------------------------------

/**
 * Send a custom event to Google Analytics 4.
 *
 * The function is a no-op when `window.gtag` is not available (e.g. during
 * SSR or when analytics scripts have not yet loaded).
 *
 * @example
 * ```ts
 * trackEvent('search', { search_term: 'civil code', result_count: 42 });
 * trackEvent('law_select', { law_id: '405AC0000000089', law_title: 'Civil Code' });
 * ```
 */
export function trackEvent<K extends keyof AnalyticsEventMap>(
  eventName: K,
  params: AnalyticsEventMap[K],
): void {
  if (typeof window === 'undefined' || !window.gtag) {
    return;
  }
  window.gtag('event', eventName, params as unknown as Record<string, unknown>);
}

/**
 * Send a raw GA4 event with an arbitrary name and payload.
 * Prefer `trackEvent` for the predefined event types above.
 */
export function trackRawEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || !window.gtag) {
    return;
  }
  window.gtag('event', eventName, params);
}
