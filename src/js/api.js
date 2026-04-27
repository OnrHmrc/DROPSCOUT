/* ══════════════════════════════════════════════════
   DropScout TR — Frontend HTTP Wrapper
   ══════════════════════════════════════════════════
   Tüm dış istek bu modülden geçer.
   ─ Firebase ID token otomatik eklenir (Authorization: Bearer)
   ─ JSON parse + hata normalizasyonu
   ─ 5xx ve network hatalarinda exponential backoff retry
   ─ Prod: Firebase Hosting /api/** → europe-west1 api function
   ─ Dev:  Vite proxy /api/** → functions emulator (5001)
*/

import { auth } from './firebase-config.js';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? 'unknown_error';
    this.body = body ?? null;
  }
}

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Oturum açık değil', { status: 401, code: 'no_session' });
  return user.getIdToken();
}

function shouldRetry(status) {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Düşük seviyeli istek. retry/timeout/auth header dahil.
 * @param {string} path — '/api/health' gibi
 * @param {RequestInit & { skipAuth?: boolean, timeout?: number }} opts
 */
export async function apiFetch(path, opts = {}) {
  const { skipAuth = false, timeout = DEFAULT_TIMEOUT_MS, headers: extraHeaders, ...rest } = opts;

  const headers = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {})
  };

  if (!skipAuth) {
    const token = await getToken();
    headers.Authorization = `Bearer ${token}`;
  }

  let attempt = 0;
  let lastErr;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(path, { ...rest, headers, signal: controller.signal });
      clearTimeout(timer);

      const text = await res.text();
      const body = text ? safeJson(text) : null;

      if (!res.ok) {
        if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
          await sleep(300 * Math.pow(2, attempt));
          attempt++;
          continue;
        }
        throw new ApiError(body?.message || res.statusText, {
          status: res.status,
          code: body?.error || 'http_error',
          body
        });
      }

      return body;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;

      if (err instanceof ApiError) throw err;

      // network/abort error
      if (attempt < MAX_RETRIES) {
        await sleep(300 * Math.pow(2, attempt));
        attempt++;
        continue;
      }

      throw new ApiError(err?.message || 'Ağ hatası', {
        status: 0,
        code: err?.name === 'AbortError' ? 'timeout' : 'network_error'
      });
    }
  }

  throw lastErr;
}

function safeJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

// ─── Endpoint kısayolları ───────────────────

/** Sunucu sağlık kontrolü (auth'lu) */
export async function getHealth() {
  return apiFetch('/api/health', { method: 'GET' });
}

/**
 * Kullanıcının aktif planı + kota durumu + özellik bayrakları.
 * @returns {Promise<{
 *   plan: 'start'|'pro'|'business',
 *   status: 'trialing'|'active'|'expired'|'none',
 *   trialEndsAt: number|null,
 *   planExpiresAt: number|null,
 *   definition: { name: string, priceTl: number, features: object },
 *   quotas: Record<string, { usedDaily: number, usedMonthly: number, remainingDaily: number|null, remainingMonthly: number|null, limitDaily: number|null, limitMonthly: number|null }>
 * }>}
 */
export async function getMyPlan() {
  return apiFetch('/api/me/plan', { method: 'GET' });
}

/**
 * Son N ayın Claude token kullanım + USD maliyet özeti.
 * @param {number=} months — varsayılan 3
 */
export async function getMyUsage(months = 3) {
  return apiFetch(`/api/me/usage?months=${encodeURIComponent(months)}`, { method: 'GET' });
}

/**
 * Ürün için AI içgörüsü (Claude Haiku 4.5). 30g Firestore cache'li.
 * @param {object} data — { productId?, url?, platform, category, salePrice?, cost?, dropScore?, marginPct?, competitorCount?, monthlySales?, trend? }
 * @returns {Promise<{ insight: { scoreReasoning: string, strengths: string[], weaknesses: string[], strategy: string, actions: string[] }, cached: boolean, productHash: string }>}
 */
export async function analyzeProduct(data) {
  return apiFetch('/api/analyze-product', {
    method: 'POST',
    body: JSON.stringify(data),
    timeout: 30_000
  });
}

// ─── Platform bağlantıları ──────────────────

/**
 * Platform bağla: credentials doğrulanır, şifreli kaydedilir, mağaza verisi çekilir.
 * @param {'trendyol'|'hepsiburada'|'n11'} platform
 * @param {object} credentials — platform-specific (supplierId/apiKey/apiSecret | merchantId/apiUser/apiPass | apiKey/apiSecret)
 * @param {string=} storeName — opsiyonel görünen ad
 */
export async function connectPlatform(platform, credentials, storeName) {
  return apiFetch('/api/platforms/connect', {
    method: 'POST',
    body: JSON.stringify({ platform, credentials, storeName }),
    timeout: 30_000
  });
}

/** Bağlı platform için yeni snapshot çek ve kaydet */
export async function syncPlatform(platform) {
  return apiFetch('/api/platforms/sync', {
    method: 'POST',
    body: JSON.stringify({ platform }),
    timeout: 30_000
  });
}

/** Platform durumu — bağlıysa son mağaza snapshot'ı + sync geçmişi döner, credentials asla */
export async function getPlatformStatus(platform) {
  return apiFetch(`/api/platforms/status?platform=${encodeURIComponent(platform)}`, { method: 'GET' });
}

/** Platform bağlantısını sil (credentials + snapshot) */
export async function disconnectPlatform(platform) {
  return apiFetch('/api/platforms/disconnect', {
    method: 'POST',
    body: JSON.stringify({ platform })
  });
}

// ─── Trend Radar ────────────────────────────

/**
 * Trend Radar verisi — kullanıcının plan tier'ına göre tazelik döner:
 * business her 6sa, pro ~1g, start ~3g.
 * @param {string=} category — sadece tek kategori istenecekse (örn. "elektronik")
 */
export async function getTrends(category) {
  const path = category
    ? `/api/trends?category=${encodeURIComponent(category)}`
    : '/api/trends';
  return apiFetch(path, { method: 'GET' });
}

// ─── Gap Radar (Business) ────────────────────

/**
 * Gap Radar kategori snapshot'i — Business plan gerektirir.
 * Backend Apify aktor calistirir veya cache'ten doner.
 * @param {string} category — TRACKED_CATEGORIES id'si (orn "elektronik")
 */
export async function getGapRadar(category) {
  return apiFetch(`/api/gap-radar?category=${encodeURIComponent(category)}`, {
    method: 'GET',
    timeout: 60_000
  });
}

// ─── Tedarikci Bul (Pro+) ─────────────────────

/**
 * Tedarikci arama — Pro veya Business plan + aylik kota tuketir.
 * Cache'li (7 gun).
 * @param {{ query: string, maxItems?: number }} input
 */
export async function searchSuppliers(input) {
  return apiFetch('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(input),
    timeout: 60_000
  });
}

export { ApiError };
