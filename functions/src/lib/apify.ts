// ─────────────────────────────────────────────────────────
// DropScout TR — Apify client (actor runner)
// Secrets:
//   APIFY_TOKEN                       — API token
//   APIFY_GAP_ACTOR_ID                — (legacy) eski TR pazaryeri Gap Radar aktörü
//   APIFY_SUPPLIER_ACTOR_ID           — Tedarikçi Bul aktör ID
//
// Asya domestic Gap Radar (yeni mimari §5):
//   APIFY_DOUYIN_ACTOR_ID             — Çin Douyin (TikTok TR)
//   APIFY_XIAOHONGSHU_ACTOR_ID        — Çin Xiaohongshu (RedNote)
//   APIFY_TAOBAO_ACTOR_ID             — Çin Taobao/Tmall daily ranking
//   APIFY_COUPANG_ACTOR_ID            — Güney Kore Coupang Best
//   APIFY_RAKUTEN_ACTOR_ID            — Japonya Rakuten ranking
//   APIFY_MERCARI_JP_ACTOR_ID         — Japonya Mercari hot items
//
// Not (2026-04-28): TR pazaryeri (Trendyol/HB/N11/Amazon TR) actor secret'leri
// kaldırıldı — TR-içi modüller artık resmi Satıcı API'leri + anonim havuz
// üzerinden çalışır. Detay: docs/architecture.md §3.
//
// Not (2026-04-29): Asya kaynak secret'leri eklendi. Apify hesabı + aktör
// seçimi henüz yapılmadığından secret'ler boş; gapPipeline secret yoksa
// deterministic placeholder döner. Hesap aktif olunca:
//   firebase functions:secrets:set APIFY_DOUYIN_ACTOR_ID
//   ... her aktör için tekrarla
//   firebase deploy --only functions:api
// ─────────────────────────────────────────────────────────

import { defineSecret } from 'firebase-functions/params';

export const APIFY_TOKEN = defineSecret('APIFY_TOKEN');
export const APIFY_GAP_ACTOR_ID = defineSecret('APIFY_GAP_ACTOR_ID');
export const APIFY_SUPPLIER_ACTOR_ID = defineSecret('APIFY_SUPPLIER_ACTOR_ID');

// Asya domestic Gap Radar aktörleri
export const APIFY_DOUYIN_ACTOR_ID = defineSecret('APIFY_DOUYIN_ACTOR_ID');
export const APIFY_XIAOHONGSHU_ACTOR_ID = defineSecret('APIFY_XIAOHONGSHU_ACTOR_ID');
export const APIFY_TAOBAO_ACTOR_ID = defineSecret('APIFY_TAOBAO_ACTOR_ID');
export const APIFY_COUPANG_ACTOR_ID = defineSecret('APIFY_COUPANG_ACTOR_ID');
export const APIFY_RAKUTEN_ACTOR_ID = defineSecret('APIFY_RAKUTEN_ACTOR_ID');
export const APIFY_MERCARI_JP_ACTOR_ID = defineSecret('APIFY_MERCARI_JP_ACTOR_ID');

const BASE_URL = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_MS = 60_000;

export function hasApifyToken(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export interface ApifyRunOptions {
  /** Max aktör çalışma süresi (saniye). Default 60s. */
  timeoutSecs?: number;
  /** Max dataset sonuç sayısı */
  maxItems?: number;
}

/**
 * Senkron aktör çalıştır + dataset item'larını dön.
 * Apify'in run-sync-get-dataset-items endpoint'ini kullanır —
 * 5 dakikadan kısa aktörler için ideal.
 */
export async function runActorSync<TInput, TOutput = Record<string, unknown>>(
  actorId: string,
  input: TInput,
  options: ApifyRunOptions = {}
): Promise<TOutput[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');
  if (!actorId) throw new Error('actorId required');

  const params = new URLSearchParams({ token });
  if (options.timeoutSecs) params.set('timeout', String(options.timeoutSecs));
  if (options.maxItems) params.set('maxItems', String(options.maxItems));

  // Apify actor ID formatı: `username/actorName` içindeki `/` URL için encode edilir
  const actorPath = encodeURIComponent(actorId);
  const url = `${BASE_URL}/acts/${actorPath}/run-sync-get-dataset-items?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    (options.timeoutSecs ? options.timeoutSecs * 1000 : DEFAULT_TIMEOUT_MS) + 5000
  );

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? (parsed as TOutput[]) : [];
    } catch {
      throw new Error(`Apify invalid JSON: ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** GAP actor ID'sini env'den oku, yoksa throw (legacy) */
export function requireGapActorId(): string {
  const id = process.env.APIFY_GAP_ACTOR_ID;
  if (!id) throw new Error('APIFY_GAP_ACTOR_ID not set');
  return id;
}

/** Supplier actor ID'sini env'den oku, yoksa throw */
export function requireSupplierActorId(): string {
  const id = process.env.APIFY_SUPPLIER_ACTOR_ID;
  if (!id) throw new Error('APIFY_SUPPLIER_ACTOR_ID not set');
  return id;
}

export type AsianSourceId =
  | 'douyin'
  | 'xiaohongshu'
  | 'taobao'
  | 'coupang'
  | 'rakuten'
  | 'mercari-jp';

const ASIAN_ACTOR_ENV: Record<AsianSourceId, string> = {
  douyin: 'APIFY_DOUYIN_ACTOR_ID',
  xiaohongshu: 'APIFY_XIAOHONGSHU_ACTOR_ID',
  taobao: 'APIFY_TAOBAO_ACTOR_ID',
  coupang: 'APIFY_COUPANG_ACTOR_ID',
  rakuten: 'APIFY_RAKUTEN_ACTOR_ID',
  'mercari-jp': 'APIFY_MERCARI_JP_ACTOR_ID'
};

/** Asya kaynak için aktör ID'sini env'den oku; yoksa null (placeholder fallback) */
export function getAsianActorId(source: AsianSourceId): string | null {
  return process.env[ASIAN_ACTOR_ENV[source]] || null;
}
