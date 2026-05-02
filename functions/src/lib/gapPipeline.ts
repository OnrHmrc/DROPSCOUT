// ─────────────────────────────────────────────────────────
// DropScout TR — Gap Radar 5 adımlı pipeline orchestrator
// Mimari: docs/architecture.md §5.2
//
// Adım 1 — KEŞIF      : discoverAsianCandidates (lib/asianSources)
// Adım 2 — ÇEVİRİ     : translateProductName (lib/claude); placeholder akışında skip
// Adım 3 — TR ARZ     : platform sahibi anonim havuzu (henüz boş — null döner)
// Adım 4 — TR TALEP   : fetchGoogleTrendSeries (lib/serpapi); key yoksa deterministic skor
// Adım 5 — SINIFLAMA  : 2x2 matris → safe / orta / early / eleme
// ─────────────────────────────────────────────────────────

import {
  type RawCandidate,
  ASIAN_SOURCES,
  discoverAsianCandidates
} from './asianSources';
import { translateProductName } from './claude';
import { hasSerpApiKey, fetchGoogleTrendSeries } from './serpapi';

export type Classification = 'safe' | 'orta' | 'early' | 'eleme';

export interface ClassifiedCandidate {
  // RawCandidate fields
  sourceId: RawCandidate['sourceId'];
  sourceName: string;
  sourceCountry: string;
  sourceUrl: string;
  externalId: string;
  categoryId: string;
  title: string;
  titleTr: string;
  description?: string;
  descriptionTr?: string;
  sourceLang: RawCandidate['sourceLang'];
  image?: string;
  creator?: string;
  metric: RawCandidate['metric'];
  detectedAt: number;
  isPlaceholder: boolean;

  // Pipeline çıktıları
  /** TR Google Trends son 30g, 0-100 ortalama */
  trendScore: number;
  /** son 7g vs son 30g eğilim */
  trendDirection: 'up' | 'flat' | 'down';
  /** TR pazaryerlerinde tespit edilen rakip ürün sayısı; null = anonim havuz boş */
  supplyCount: number | null;
  /** 2x2 sınıflandırma sonucu */
  classification: Classification;
  /** UI sıralama için 0-100 fırsat skoru */
  opportunityScore: number;
  /** TR talep verisinin kaynağı — UI'da rozet için */
  demandSource: 'serpapi' | 'placeholder';
}

export interface PipelineResult {
  categoryId: string;
  categoryName: string;
  fetchedAt: number;
  /** Gruplanmış sonuçlar (3 sekme + dahili eleme) */
  groups: {
    safe: ClassifiedCandidate[];
    orta: ClassifiedCandidate[];
    early: ClassifiedCandidate[];
    eleme: ClassifiedCandidate[];
  };
  meta: {
    totalCandidates: number;
    sourcesUsed: number;
    placeholderRatio: number; // 0-1
    translationCalls: number;
    translationTokens: number;
    /** TR talep verisi kaynağı — bütün adaylar için tek kaynak kullanılır */
    demandSource: 'serpapi' | 'placeholder';
    /** Pipeline'ın hangi modunda çalıştığı (test için) */
    mode: 'live' | 'placeholder' | 'mixed';
  };
}

const TRANSLATE_BUDGET_PER_CATEGORY = 25; // gerçek aktör çıktıları için max çeviri / kategori
const TRANSLATE_TIMEOUT_MS = 8_000; // tek çeviri timeout
const TRENDS_DEFAULT_SCORE = 50;

// ─── Adım 2 — ÇEVİRİ ──────────────────────────────────────

async function translateBatch(
  candidates: RawCandidate[]
): Promise<{ translated: RawCandidate[]; calls: number; tokens: number }> {
  const out: RawCandidate[] = [];
  let calls = 0;
  let tokens = 0;
  let budget = TRANSLATE_BUDGET_PER_CATEGORY;

  for (const c of candidates) {
    // Placeholder zaten çevirili; veya kullanıcı kaynaktan TR alanı geldiyse skip
    if (c.titleTr && c.titleTr.trim()) {
      out.push(c);
      continue;
    }
    if (budget <= 0) {
      // Bütçe doldu, kalanlara orijinali yaz; UI orijinali gösterir
      out.push({ ...c, titleTr: c.title });
      continue;
    }

    try {
      const result = await Promise.race([
        translateProductName({
          title: c.title,
          description: c.description,
          sourceLang: c.sourceLang
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('translate timeout')), TRANSLATE_TIMEOUT_MS)
        )
      ]);
      calls++;
      budget--;
      tokens += result.usage.input_tokens + result.usage.output_tokens;
      out.push({
        ...c,
        titleTr: result.titleTr || c.title,
        descriptionTr: result.descriptionTr || c.descriptionTr
      });
    } catch (err) {
      console.warn('[gapPipeline] çeviri hatası, orijinal başlık korunuyor', {
        sourceId: c.sourceId,
        title: c.title.slice(0, 40),
        error: err instanceof Error ? err.message : String(err)
      });
      out.push({ ...c, titleTr: c.title });
    }
  }

  return { translated: out, calls, tokens };
}

// ─── Adım 3 — TR ARZ KONTROLÜ ─────────────────────────────
// Anonim havuz boş olduğu sürece null döner. İleride:
//   `users/{platform-owner-uid}/platforms/{trendyol}` snapshot'ı +
//   opt-in kullanıcı agregasyonu ile keyword search yapılır.

async function checkTrSupply(_titleTr: string): Promise<number | null> {
  // TODO: Anonim havuz aktif olunca burada Trendyol/HB/Amazon TR/N11
  // listing arama → match count döner. Şu an null.
  return null;
}

// ─── Adım 4 — TR TALEP ────────────────────────────────────

interface DemandResult {
  score: number;
  direction: 'up' | 'flat' | 'down';
  source: 'serpapi' | 'placeholder';
}

async function fetchTrDemand(query: string): Promise<DemandResult> {
  if (!hasSerpApiKey()) {
    // Placeholder: query string'den deterministic skor üret
    const seed = Array.from(query).reduce((s, c) => (s * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
    const score = 30 + Math.abs(Math.sin(seed)) * 60; // 30-90
    const dir7 = Math.abs(Math.sin(seed * 1.7)) * 100;
    const direction: DemandResult['direction'] =
      dir7 > 60 ? 'up' : dir7 < 35 ? 'down' : 'flat';
    return { score: Math.round(score), direction, source: 'placeholder' };
  }

  try {
    const series = await fetchGoogleTrendSeries(query);
    if (!series.length) {
      return { score: TRENDS_DEFAULT_SCORE, direction: 'flat', source: 'serpapi' };
    }
    const last7 = series.slice(-7);
    const all30 = series;
    const avg7 = last7.reduce((s, p) => s + p.interest, 0) / last7.length;
    const avg30 = all30.reduce((s, p) => s + p.interest, 0) / all30.length;
    const direction: DemandResult['direction'] =
      avg7 > avg30 * 1.08 ? 'up' : avg7 < avg30 * 0.92 ? 'down' : 'flat';
    return { score: Math.round(avg30), direction, source: 'serpapi' };
  } catch (err) {
    console.warn('[gapPipeline] SerpAPI hatası, placeholder talep skoru', {
      query: query.slice(0, 40),
      error: err instanceof Error ? err.message : String(err)
    });
    return { score: TRENDS_DEFAULT_SCORE, direction: 'flat', source: 'placeholder' };
  }
}

// ─── Adım 5 — SINIFLANDIRMA ───────────────────────────────

const DEMAND_THRESHOLD = 40; // 0-100, üzeri "TR'de aranıyor"

function classify(supplyCount: number | null, trendScore: number): Classification {
  const aranıyor = trendScore >= DEMAND_THRESHOLD;
  // Havuz boşken (null) varsayım: TR'de yok (doğrulanmadı, ama Asya kaynaklı yeni ürün için makul)
  const trVar = supplyCount !== null && supplyCount > 0;

  if (trVar && aranıyor) return 'orta';
  if (trVar && !aranıyor) return 'eleme';
  if (!trVar && aranıyor) return 'safe';
  return 'early';
}

function calcOpportunityScore(c: RawCandidate, trendScore: number, cls: Classification): number {
  const m = c.metric;
  const social = ((m.likes ?? 0) / 1000) + ((m.posts ?? 0) / 200);
  const market = ((m.sales ?? 0) / 200) + (m.rank ? Math.max(0, 50 - m.rank) * 0.4 : 0);
  const viral = Math.min(50, social + market);

  let base: number;
  switch (cls) {
    case 'safe':  base = 78; break; // talep doğrulanmış + arz yok = en güvenli
    case 'early': base = 68; break; // viral + henüz aranmıyor = ilk girene değer
    case 'orta':  base = 55; break; // talep var ama rekabet de var
    case 'eleme': base = 25; break;
  }

  // trendScore katkısı 0-15
  const demandBoost = (trendScore - 50) * 0.3;
  const score = base + viral * 0.25 + demandBoost;
  return Math.max(0, Math.min(99, Math.round(score)));
}

// ─── Pipeline orchestrator ────────────────────────────────

export async function runGapPipeline(input: {
  categoryId: string;
  categoryName: string;
  query: string;
}): Promise<PipelineResult> {
  const { categoryId, categoryName, query } = input;
  const startedAt = Date.now();

  // Adım 1 — KEŞIF
  const candidates = await discoverAsianCandidates(categoryId, query);

  // Adım 2 — ÇEVİRİ
  const { translated, calls, tokens } = await translateBatch(candidates);

  // Adım 4 — TR TALEP (kategori başına tek sorgu — query bazlı)
  // Not: tek query üzerinden çekilir; ileride ürün bazlı ince taneli talep
  // istenirse her aday için ayrı çağrı yapılır (maliyet 6x). Şu an MVP.
  const demand = await fetchTrDemand(query);

  // Adım 3 — TR ARZ + Adım 5 — SINIFLAMA (paralel mantıksal birleşim)
  const classified: ClassifiedCandidate[] = [];
  for (const c of translated) {
    const supplyCount = await checkTrSupply(c.titleTr || c.title);
    const cls = classify(supplyCount, demand.score);
    const opportunityScore = calcOpportunityScore(c, demand.score, cls);
    const meta = ASIAN_SOURCES[c.sourceId];

    classified.push({
      sourceId: c.sourceId,
      sourceName: meta.name,
      sourceCountry: meta.country,
      sourceUrl: c.sourceUrl,
      externalId: c.externalId,
      categoryId: c.categoryId,
      title: c.title,
      titleTr: c.titleTr || c.title,
      description: c.description,
      descriptionTr: c.descriptionTr,
      sourceLang: c.sourceLang,
      image: c.image,
      creator: c.creator,
      metric: c.metric,
      detectedAt: c.detectedAt,
      isPlaceholder: c.isPlaceholder,

      trendScore: demand.score,
      trendDirection: demand.direction,
      supplyCount,
      classification: cls,
      opportunityScore,
      demandSource: demand.source
    });
  }

  // Sıralama: opportunityScore desc
  classified.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const groups = {
    safe: classified.filter((c) => c.classification === 'safe'),
    orta: classified.filter((c) => c.classification === 'orta'),
    early: classified.filter((c) => c.classification === 'early'),
    eleme: classified.filter((c) => c.classification === 'eleme')
  };

  const phCount = candidates.filter((c) => c.isPlaceholder).length;
  const sourcesUsed = new Set(candidates.map((c) => c.sourceId)).size;
  const phRatio = candidates.length ? phCount / candidates.length : 1;
  const mode: PipelineResult['meta']['mode'] =
    phCount === 0 ? 'live' : phCount === candidates.length ? 'placeholder' : 'mixed';

  console.log('[gapPipeline] tamamlandı', {
    categoryId,
    durationMs: Date.now() - startedAt,
    totalCandidates: candidates.length,
    sourcesUsed,
    placeholderRatio: phRatio.toFixed(2),
    translationCalls: calls,
    translationTokens: tokens,
    demandSource: demand.source,
    groups: {
      safe: groups.safe.length,
      orta: groups.orta.length,
      early: groups.early.length,
      eleme: groups.eleme.length
    }
  });

  return {
    categoryId,
    categoryName,
    fetchedAt: Date.now(),
    groups,
    meta: {
      totalCandidates: candidates.length,
      sourcesUsed,
      placeholderRatio: Number(phRatio.toFixed(2)),
      translationCalls: calls,
      translationTokens: tokens,
      demandSource: demand.source,
      mode
    }
  };
}
