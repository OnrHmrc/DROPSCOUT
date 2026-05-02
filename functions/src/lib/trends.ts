// ─────────────────────────────────────────────────────────
// DropScout TR — Trend Radar veri katmanı
// Yeni mimari (2026-04-28): SerpAPI ve Apify scraping kaldırıldı.
// Veri kaynağı: resmi Satıcı API'leri (platform sahibi key + kayıtlı
// kullanıcı anonim havuzu). Havuz hazır olana kadar fetcher boş döner;
// endpoint kullanıcıya "araştırma başlatıldı" mesajıyla cevap verir.
// Detay: docs/architecture.md §3, §4.
// ─────────────────────────────────────────────────────────

export interface TrendDataPoint {
  /** ISO-8601 (UTC) */
  date: string;
  /** İlgi göstergesi 0-100 */
  interest: number;
}

export interface TrendSnapshot {
  /** Snapshot oluşturulma zamanı (ms) */
  fetchedAt: number;
  /** Son 7 gün ortalaması */
  avgInterest7d: number;
  /** Son 30 gün ortalaması */
  avgInterest30d: number;
  /** "yukseliyor" | "sabit" | "dususuyor" */
  trend: 'yukseliyor' | 'sabit' | 'dusuyor';
  /** Yüzdelik değişim (son 7g / son 30g) */
  changePct: number;
  /** Daily data points (max 30) */
  series: TrendDataPoint[];
  /** Veri kaynağı */
  source: 'pool';
  /** Snapshot'taki toplam taranan ürün sayısı */
  productCount?: number;
}

/**
 * TR e-ticaret pazarında izlenen ana kategoriler.
 * ID = Firestore doc id; query = anonim havuz aramalarında kullanılan eşleşme anahtarı.
 */
export const TRACKED_CATEGORIES: Array<{ id: string; name: string; query: string }> = [
  { id: 'elektronik',       name: 'Elektronik',          query: 'elektronik' },
  { id: 'ev-yasam',         name: 'Ev & Yaşam',          query: 'ev yaşam' },
  { id: 'kozmetik',         name: 'Kozmetik',            query: 'kozmetik' },
  { id: 'giyim',            name: 'Giyim',               query: 'giyim' },
  { id: 'spor-outdoor',     name: 'Spor & Outdoor',      query: 'spor' },
  { id: 'anne-bebek',       name: 'Anne & Bebek',        query: 'bebek ürünleri' },
  { id: 'kirtasiye',        name: 'Kırtasiye',           query: 'kırtasiye' },
  { id: 'otomotiv',         name: 'Otomotiv',            query: 'otomotiv' },
  { id: 'supermarket',      name: 'Süpermarket',         query: 'market' },
  { id: 'kitap-hobi',       name: 'Kitap & Hobi',        query: 'kitap' },
  { id: 'mobilya',          name: 'Mobilya',             query: 'mobilya' },
  { id: 'aksesuar',         name: 'Aksesuar & Takı',     query: 'takı' },
  { id: 'oyuncak',          name: 'Oyuncak',             query: 'oyuncak' },
  { id: 'mutfak',           name: 'Mutfak Gereçleri',    query: 'mutfak' },
  { id: 'evcil-hayvan',     name: 'Evcil Hayvan',        query: 'evcil hayvan' }
];

/**
 * Anonim havuzdan kategori snapshot'ı üret.
 *
 * TODO: Birleşik API modeli devreye alınınca burası şu sırayı uygular:
 *   1) Platform sahibinin (DropScout TR) Trendyol/HB/Amazon TR/N11
 *      satıcı API'sinden kategori listing/fiyat/stok verisi
 *   2) Opt-in vermiş kayıtlı kullanıcıların aynı kategori için anonim
 *      API verisi (rakip yoğunluk havuzu)
 *   3) İki kaynak da yetersizse → null (endpoint manuel kuyruk
 *      mesajını döner)
 *
 * Şu an havuz boş olduğundan her kategori için null döner.
 */
export async function fetchTrendForCategory(
  _category: typeof TRACKED_CATEGORIES[number]
): Promise<TrendSnapshot | null> {
  return null;
}

/**
 * History array'inden tier'a uygun snapshot seç:
 *   business → en yenisi
 *   pro      → ~24h yaşlı
 *   start    → ~72h yaşlı
 */
export function selectForTier(
  history: TrendSnapshot[],
  tier: 'every6h' | 'daily' | 'every3days'
): TrendSnapshot | null {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => b.fetchedAt - a.fetchedAt);
  if (tier === 'every6h') return sorted[0];
  const targetAgeMs = tier === 'daily' ? 24 * 60 * 60 * 1000 : 72 * 60 * 60 * 1000;
  for (const snap of sorted) {
    if (Date.now() - snap.fetchedAt >= targetAgeMs * 0.85) return snap;
  }
  return sorted[sorted.length - 1];
}
