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
