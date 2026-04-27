/* ══════════════════════════════════════════════════
   DropScout TR — Frontend plan & quota gating
   ══════════════════════════════════════════════════
   Kullanıcının aktif planını ve kota durumunu backend'den çeker
   (5dk cache), UI gating ve kota uyarıları için helper sağlar.
   ─ Tek kaynak: /api/me/plan (backend plans.ts)
   ─ Cache: sessionStorage (tab bazlı; farklı tab'da yenilenir)
   ─ invalidate: upgrade/downgrade sonrası temizleme
*/

import { getMyPlan as apiGetMyPlan } from './api.js';
import { captureError as sentryCapture } from './sentry.js';

const CACHE_KEY = 'dropscout-plan-v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PLAN_ORDER = ['start', 'pro', 'business'];

/** Cache'ten veya API'dan plan bilgisi — 5dk TTL */
export async function getPlan(opts = {}) {
  const force = opts.force === true;

  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  const fresh = await apiGetMyPlan();
  writeCache(fresh);
  return fresh;
}

/** Upgrade/downgrade/ödeme sonrası çağrılır — cache temizler */
export function invalidatePlan() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

/** "current >= required" mı? */
export function planAtLeast(current, required) {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
}

/**
 * Bir meter için bugünkü/ayki kalan hak. Frontend butonlarını
 * disable etmek / sayacı göstermek için.
 */
export function getQuota(planData, meter) {
  return planData?.quotas?.[meter] || null;
}

/** Meter için 1 hak tüketilebilir mi? (sadece UI öngörüsü — backend gerçek kapıyı tutar) */
export function canConsume(planData, meter) {
  const q = getQuota(planData, meter);
  if (!q) return false;
  if (q.limitDaily !== null && q.remainingDaily !== null && q.remainingDaily <= 0) return false;
  if (q.limitMonthly !== null && q.remainingMonthly !== null && q.remainingMonthly <= 0) return false;
  if (q.limitMonthly === 0) return false; // özellik plana dahil değil
  return true;
}

/**
 * Sayfa yüklendiğinde belirli bir özellik için gate uygular:
 *   gateFeature('#gapRadarPanel', 'business', { mode: 'hide'|'disable' })
 * mode 'hide': öğeyi tamamen gizler
 * mode 'disable': opak + tıklanamaz + "Pro'ya yükselt" etiketi
 */
export async function gateFeature(selector, requiredPlan, opts = {}) {
  const mode = opts.mode || 'disable';
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return null;

  try {
    const { plan } = await getPlan();
    if (planAtLeast(plan, requiredPlan)) {
      el.removeAttribute('data-plan-locked');
      return { allowed: true, plan };
    }

    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.setAttribute('data-plan-locked', requiredPlan);
      el.style.opacity = '0.55';
      el.style.pointerEvents = 'none';
      el.style.position = el.style.position || 'relative';
      if (!el.querySelector('[data-plan-badge]')) {
        const badge = document.createElement('div');
        badge.setAttribute('data-plan-badge', '');
        badge.textContent = `${requiredPlan.toUpperCase()} planına özel — yükselt`;
        Object.assign(badge.style, {
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'var(--accent, #6366f1)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: '600',
          padding: '4px 10px',
          borderRadius: '999px',
          pointerEvents: 'auto',
          cursor: 'pointer',
          zIndex: '10'
        });
        badge.addEventListener('click', () => {
          window.location.href = '/pricing.html';
        });
        el.appendChild(badge);
      }
    }
    return { allowed: false, plan, requiredPlan };
  } catch (err) {
    console.warn('[gateFeature] plan okunamadı', err);
    return { allowed: false, error: err };
  }
}

/**
 * Bir API çağrısı yapmadan önce kota kontrolü. Yetersizse modal/toast
 * ile uyarır, true/false döner.
 */
export async function ensureQuota(meter, { showAlert = true } = {}) {
  try {
    const planData = await getPlan();
    if (canConsume(planData, meter)) return true;

    if (showAlert) {
      const q = getQuota(planData, meter);
      const reason = !q
        ? 'Bu özellik mevcut planınızda yok.'
        : q.limitMonthly === 0
        ? `Bu özellik ${planData.plan.toUpperCase()} planınıza dahil değil.`
        : q.remainingDaily !== null && q.remainingDaily <= 0
        ? 'Bugünkü analiz hakkınız doldu. Yarın sıfırlanacak.'
        : 'Bu ayki analiz hakkınız doldu.';
      showUpgradeToast(reason);
    }
    return false;
  } catch (err) {
    console.warn('[ensureQuota] plan kontrolü başarısız, serbest geçiş', err);
    return true; // plan okunamazsa backend kapıyı tutuyor, UI serbest bıraksın
  }
}

/** Quota aşımı / plan yetersizliği için küçük toast (backend 403/429 yakalandığında) */
export function showUpgradeToast(message, opts = {}) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    background: '#1f2937',
    color: '#fff',
    padding: '14px 18px',
    borderRadius: '10px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    zIndex: '9999',
    maxWidth: '340px',
    fontSize: '14px',
    lineHeight: '1.45',
    cursor: 'pointer'
  });
  const cta = document.createElement('div');
  cta.textContent = 'Plan seçeneklerini gör →';
  Object.assign(cta.style, {
    marginTop: '8px',
    fontWeight: '600',
    color: '#a5b4fc'
  });
  toast.appendChild(cta);
  toast.addEventListener('click', () => {
    window.location.href = '/pricing.html';
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), opts.duration || 6000);
}

/** Bir API hatası plan/kota kaynaklıysa otomatik toast göster */
export function handleApiError(err) {
  if (!err) return false;
  if (err.status === 403 && err.code === 'plan_required') {
    const name = err.body?.requiredPlan?.toUpperCase?.() || 'üst';
    showUpgradeToast(`Bu özellik ${name} planı gerektiriyor.`);
    return true;
  }
  if (err.status === 403 && err.code === 'platform_limit_reached') {
    showUpgradeToast(err.message || 'Plan mağaza limitine ulaşıldı.');
    return true;
  }
  if (err.status === 429 && err.code === 'quota_exceeded') {
    showUpgradeToast(err.body?.message || err.message || 'Kota doldu.');
    return true;
  }
  // Plan/kota disi hata — Sentry'e yolla (DSN varsa)
  if (err.status >= 500 || err.status === 0) {
    sentryCapture(err, {
      apiStatus: err.status,
      apiCode: err.code,
      apiMessage: err.message
    });
  }
  return false;
}

// ─── Cache helpers ─────────────────────────

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}
