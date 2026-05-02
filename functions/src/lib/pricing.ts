// Claude Haiku 4.5 token fiyatlari (Anthropic resmi, USD per 1M token)
export const CLAUDE_HAIKU_PRICING = {
  input: 1.0,
  output: 5.0,
  cacheRead: 0.1,
  cacheCreation: 1.25
} as const;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  calls: number;
}

export const ZERO_USAGE: TokenUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
  calls: 0
};

/** Toplam Claude Haiku maliyetini USD cinsinden hesapla */
export function calcClaudeCostUsd(usage: Partial<TokenUsage>): number {
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheCreation = usage.cacheCreation ?? 0;
  const cost =
    (input * CLAUDE_HAIKU_PRICING.input) / 1_000_000 +
    (output * CLAUDE_HAIKU_PRICING.output) / 1_000_000 +
    (cacheRead * CLAUDE_HAIKU_PRICING.cacheRead) / 1_000_000 +
    (cacheCreation * CLAUDE_HAIKU_PRICING.cacheCreation) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ─────────────────────────────────────────────────────────
// Apify cagri basina maliyet tahminleri (USD).
// Conservative tahmin — gercek rakamlar Apify Console'dan netlesince
// burada revize edilir. Hard cost cap matematigi bu degerlere bagli.
// ─────────────────────────────────────────────────────────
export const APIFY_COST_USD = {
  supplier: 0.25,
  gapRadar: 0.40
} as const;

export interface MonthlyUsageDoc {
  tokens?: Partial<TokenUsage>;
  supplier?: number;
  gapRadar?: number;
  [key: string]: unknown;
}

/**
 * Aylik toplam maliyet (USD). Claude tokens + Apify supplier + Apify gapRadar.
 * Hard cost cap karsilastirmasi icin kullanilir.
 */
export function calcMonthlyCostUsd(monthData: MonthlyUsageDoc | undefined | null): number {
  if (!monthData) return 0;
  const claudeCost = calcClaudeCostUsd(monthData.tokens ?? {});
  const supplierCost = (monthData.supplier ?? 0) * APIFY_COST_USD.supplier;
  const gapRadarCost = (monthData.gapRadar ?? 0) * APIFY_COST_USD.gapRadar;
  const total = claudeCost + supplierCost + gapRadarCost;
  return Math.round(total * 1_000_000) / 1_000_000;
}
