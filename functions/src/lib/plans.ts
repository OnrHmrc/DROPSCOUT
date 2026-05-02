// ─────────────────────────────────────────────────────────
// DropScout TR — Plan tanimlari (tek kaynak)
// Quotalar, fiyat, ozellik bayraklari, trend-radar tier'i, hard cost cap.
// Frontend'de ayna: kod degisirken senkronlanmali.
//
// 2026-05-02 revize:
// - Sinirsiz limit kaldirildi, tum kotalar numerik tavanli
// - daily x 30 = monthly tutarliligi saglandi (kullanici garanti edilen
//   gunluk hakki ay sonuna kadar surdurulebilir)
// - gapRadar yeni meter olarak eklendi (Profesyonel'da 20/ay)
// - costCapUsd panic switch (bug/anormal kullanim icin tampon)
// - Plan adlari Turkceye cevrildi (PlanId stringler degismedi:
//   geriye uyumluluk icin start/pro/business sabit kalir)
// ─────────────────────────────────────────────────────────

export type PlanId = 'start' | 'pro' | 'business';

export const PLAN_ORDER: PlanId[] = ['start', 'pro', 'business'];

/** meter => sayilabilir kullanim turu */
export type MeterId =
  | 'linkAnalysis'
  | 'storeProductAnalysis'
  | 'legalCheck'
  | 'supplier'
  | 'gapRadar';

/** null = sinirsiz; number = limit. Yeni revizyondan sonra "sinirsiz" yok. */
export interface QuotaLimit {
  daily: number | null;
  monthly: number | null;
  /** UI gostergesinde "soft" oldugunu belirt (enforce edilir ama kullanici sert limiti gormez) */
  dailySoft?: boolean;
}

export type TrendTier = 'every3days' | 'daily' | 'every6h';

export interface PlanDefinition {
  id: PlanId;
  /** Display adi (Turkce). Kod referanslari hala PlanId uzerinden. */
  name: string;
  priceTl: number;
  priceTlYearly: number;
  usdReference: number;
  trialDays: number;
  /**
   * Aylik hard cost cap (USD). Quota gecse bile bu seviyenin uzerine
   * cikilamaz. Bug, cache miss patlamasi, token overshoot vs. icin tampon.
   * Normal kullanimda asla tetiklenmez (1.5-2.5x teorik max buffer).
   */
  costCapUsd: number;
  quotas: Record<MeterId, QuotaLimit>;
  features: {
    gapRadar: boolean;
    trendRadar: TrendTier;
    maxPlatforms: number;
    maxWatchlist: number;
    weeklyAutoReport: boolean;
    supportSlaHours: number;
  };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  start: {
    id: 'start',
    name: 'Başlangıç',
    priceTl: 299,
    priceTlYearly: 2870,
    usdReference: 7.5,
    trialDays: 7,
    costCapUsd: 3,
    quotas: {
      linkAnalysis: { daily: 2, monthly: 60 },
      storeProductAnalysis: { daily: 10, monthly: 300 },
      legalCheck: { daily: null, monthly: 15 },
      supplier: { daily: null, monthly: 0 },
      gapRadar: { daily: null, monthly: 0 }
    },
    features: {
      gapRadar: false,
      trendRadar: 'every3days',
      maxPlatforms: 1,
      maxWatchlist: 25,
      weeklyAutoReport: false,
      supportSlaHours: 48
    }
  },

  pro: {
    id: 'pro',
    name: 'Esnaf',
    priceTl: 699,
    priceTlYearly: 6710,
    usdReference: 17.5,
    trialDays: 7,
    costCapUsd: 15,
    quotas: {
      linkAnalysis: { daily: 8, monthly: 240 },
      storeProductAnalysis: { daily: 25, monthly: 750 },
      legalCheck: { daily: null, monthly: 75 },
      supplier: { daily: null, monthly: 20 },
      gapRadar: { daily: null, monthly: 0 }
    },
    features: {
      gapRadar: false,
      trendRadar: 'daily',
      maxPlatforms: 3,
      maxWatchlist: 150,
      weeklyAutoReport: false,
      supportSlaHours: 24
    }
  },

  business: {
    id: 'business',
    name: 'Profesyonel',
    priceTl: 1499,
    priceTlYearly: 14390,
    usdReference: 37.5,
    trialDays: 0,
    costCapUsd: 40,
    quotas: {
      linkAnalysis: { daily: 25, monthly: 750 },
      storeProductAnalysis: { daily: 80, monthly: 2400 },
      legalCheck: { daily: null, monthly: 300 },
      supplier: { daily: null, monthly: 30 },
      gapRadar: { daily: null, monthly: 20 }
    },
    features: {
      gapRadar: true,
      trendRadar: 'every6h',
      maxPlatforms: 10,
      maxWatchlist: 500,
      weeklyAutoReport: true,
      supportSlaHours: 4
    }
  }
};

/** Tum meter tanimlari (UI listelemesi, getQuotaStatus icin) */
export const ALL_METERS: MeterId[] = [
  'linkAnalysis',
  'storeProductAnalysis',
  'legalCheck',
  'supplier',
  'gapRadar'
];

/** a >= b ise true (business >= pro >= start) */
export function planAtLeast(a: PlanId, b: PlanId): boolean {
  return PLAN_ORDER.indexOf(a) >= PLAN_ORDER.indexOf(b);
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'start' || value === 'pro' || value === 'business';
}

export function isMeterId(value: unknown): value is MeterId {
  return (
    value === 'linkAnalysis' ||
    value === 'storeProductAnalysis' ||
    value === 'legalCheck' ||
    value === 'supplier' ||
    value === 'gapRadar'
  );
}

/** "YYYY-MM-DD" Europe/Istanbul */
export function todayKey(now: Date = new Date()): string {
  const tr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const y = tr.getFullYear();
  const m = String(tr.getMonth() + 1).padStart(2, '0');
  const d = String(tr.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM" Europe/Istanbul */
export function monthKey(now: Date = new Date()): string {
  return todayKey(now).slice(0, 7);
}
