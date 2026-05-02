// ─────────────────────────────────────────────────────────
// DropScout TR — Plan tanimlari (tek kaynak)
// Quotalar, fiyat, ozellik bayraklari, trend-radar tier'i.
// Frontend'de ayna: kod degisirken senkronlanmali.
// ─────────────────────────────────────────────────────────

export type PlanId = 'start' | 'pro' | 'business';

export const PLAN_ORDER: PlanId[] = ['start', 'pro', 'business'];

/** meter => sayilabilir kullanim turu */
export type MeterId =
  | 'linkAnalysis'
  | 'storeProductAnalysis'
  | 'legalCheck'
  | 'supplier';

/** null = sinirsiz; number = limit */
export interface QuotaLimit {
  daily: number | null;
  monthly: number | null;
  /** UI gostergesinde "soft" oldugunu belirt (enforce edilir ama kullanici sert limiti gormez) */
  dailySoft?: boolean;
}

export type TrendTier = 'every3days' | 'daily' | 'every6h';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceTl: number;
  priceTlYearly: number;
  usdReference: number;
  trialDays: number;
  quotas: Record<MeterId, QuotaLimit>;
  features: {
    gapRadar: boolean;
    trendRadar: TrendTier;
    maxPlatforms: number | null;
    maxWatchlist: number | null;
    weeklyAutoReport: boolean;
    supportSlaHours: number;
  };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  start: {
    id: 'start',
    name: 'Start',
    priceTl: 299,
    priceTlYearly: 2870,
    usdReference: 7.5,
    trialDays: 7,
    quotas: {
      linkAnalysis: { daily: 1, monthly: 30 },
      storeProductAnalysis: { daily: 3, monthly: 90 },
      legalCheck: { daily: null, monthly: 10 },
      supplier: { daily: null, monthly: 0 }
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
    name: 'Pro',
    priceTl: 699,
    priceTlYearly: 6710,
    usdReference: 17.5,
    trialDays: 7,
    quotas: {
      linkAnalysis: { daily: 5, monthly: 150 },
      storeProductAnalysis: { daily: 60, monthly: 300, dailySoft: true },
      legalCheck: { daily: null, monthly: 75 },
      supplier: { daily: null, monthly: 30 }
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
    name: 'Business',
    priceTl: 1499,
    priceTlYearly: 14390,
    usdReference: 37.5,
    trialDays: 0,
    quotas: {
      linkAnalysis: { daily: 20, monthly: 600 },
      storeProductAnalysis: { daily: 50, monthly: null },
      legalCheck: { daily: null, monthly: null },
      supplier: { daily: null, monthly: null }
    },
    features: {
      gapRadar: true,
      trendRadar: 'every6h',
      maxPlatforms: null,
      maxWatchlist: null,
      weeklyAutoReport: true,
      supportSlaHours: 4
    }
  }
};

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
    value === 'supplier'
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
