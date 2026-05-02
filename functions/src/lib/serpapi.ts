// ─────────────────────────────────────────────────────────
// DropScout TR — SerpAPI (Google Trends) client
// Secret: SERPAPI_KEY. Yoksa placeholder data kullanilir.
// ─────────────────────────────────────────────────────────

import { defineSecret } from 'firebase-functions/params';
import type { TrendDataPoint } from './trends';

export const SERPAPI_KEY = defineSecret('SERPAPI_KEY');

const BASE_URL = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 15_000;

export function hasSerpApiKey(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

interface SerpApiTimelinePoint {
  date?: string;
  timestamp?: string;
  values?: Array<{ value?: string; extracted_value?: number; query?: string }>;
}

interface SerpApiResponse {
  interest_over_time?: { timeline_data?: SerpApiTimelinePoint[] };
  error?: string;
}

/**
 * Google Trends interest_over_time sorgusu (son 3 ay, TR).
 * 30 gunluk ISO date dizisine indirgenmis TrendDataPoint[] doner.
 */
export async function fetchGoogleTrendSeries(query: string): Promise<TrendDataPoint[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY not set');

  const params = new URLSearchParams({
    engine: 'google_trends',
    q: query,
    data_type: 'TIMESERIES',
    date: 'today 3-m',
    geo: 'TR',
    hl: 'tr',
    api_key: key
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`SerpAPI ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as SerpApiResponse;
    if (json.error) throw new Error(`SerpAPI error: ${json.error}`);

    const timeline = json.interest_over_time?.timeline_data || [];
    if (!timeline.length) throw new Error('SerpAPI returned empty timeline');

    // Son 30 gune indir — timeline genelde haftalik/gunluk mixed
    const points: TrendDataPoint[] = timeline.map((p) => {
      const ts = p.timestamp ? Number(p.timestamp) * 1000 : Date.parse(p.date || '');
      const iso = Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : (p.date || '');
      const v = p.values?.[0]?.extracted_value;
      const interest = typeof v === 'number' ? v : Number(p.values?.[0]?.value || 0);
      return { date: iso, interest };
    }).filter((p) => p.date && Number.isFinite(p.interest));

    // Son 30 nokta (yeniden eskiye sirala, en sondan 30 kes)
    return points.slice(-30);
  } finally {
    clearTimeout(timer);
  }
}
