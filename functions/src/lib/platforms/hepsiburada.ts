import type {
  HepsiburadaCredentials,
  PlatformAdapter,
  PlatformStoreSnapshot,
  TestResult
} from './types';

const LISTING_BASE = 'https://listing-external.hepsiburada.com';

const DEFAULT_COMMISSION_BY_CATEGORY: Record<string, number> = {
  'Elektronik': 11.5,
  'Bilgisayar': 10.0,
  'Cep Telefonu': 9.0,
  'Ev & Yaşam': 16.0,
  'Kozmetik': 18.0,
  'Giyim': 22.0,
  'Moda': 22.0,
  'Spor': 14.0,
  'Anne & Bebek': 12.0,
  'Kırtasiye': 16.0,
  'Otomotiv': 12.5,
  'Süpermarket': 10.5,
  'Mobilya': 13.0,
  'Oyuncak': 17.0,
  'Kitap': 12.0
};

function authHeader(creds: HepsiburadaCredentials): string {
  const pair = `${creds.apiUser}:${creds.apiPass}`;
  return 'Basic ' + Buffer.from(pair, 'utf8').toString('base64');
}

function commonHeaders(creds: HepsiburadaCredentials): Record<string, string> {
  return {
    Authorization: authHeader(creds),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': `${creds.merchantId} - DropScoutTR`
  };
}

interface HbListingsResponse {
  totalCount?: number;
  listings?: Array<{
    hepsiburadaSku?: string;
    merchantSku?: string;
    productName?: string;
    categoryName?: string;
    price?: number | string;
    availableStock?: number;
    isSalable?: boolean;
  }>;
}

async function fetchListings(
  creds: HepsiburadaCredentials,
  offset: number,
  limit: number
): Promise<HbListingsResponse> {
  const url = `${LISTING_BASE}/listings/merchantid/${encodeURIComponent(creds.merchantId)}?offset=${offset}&limit=${limit}`;
  const res = await fetch(url, { method: 'GET', headers: commonHeaders(creds) });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Hepsiburada API kimlik bilgileri geçersiz (401/403)');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hepsiburada API hatası ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as HbListingsResponse;
}

function commissionFor(categoryName: string): number {
  if (!categoryName) return 15;
  for (const key of Object.keys(DEFAULT_COMMISSION_BY_CATEGORY)) {
    if (categoryName.toLowerCase().includes(key.toLowerCase())) {
      return DEFAULT_COMMISSION_BY_CATEGORY[key];
    }
  }
  return 15;
}

function kdvFor(categoryName: string): number {
  const lower = (categoryName || '').toLowerCase();
  if (lower.includes('giyim') || lower.includes('moda') || lower.includes('bebek') || lower.includes('kitap')) {
    return 10;
  }
  return 20;
}

export const hepsiburadaAdapter: PlatformAdapter<HepsiburadaCredentials> = {
  id: 'hepsiburada',

  validateCredentials(input: unknown): HepsiburadaCredentials | string {
    if (!input || typeof input !== 'object') return 'credentials objesi gerekli';
    const c = input as Record<string, unknown>;
    if (typeof c.merchantId !== 'string' || !c.merchantId.trim()) return 'merchantId gerekli';
    if (typeof c.apiUser !== 'string' || !c.apiUser.trim()) return 'apiUser gerekli';
    if (typeof c.apiPass !== 'string' || !c.apiPass.trim()) return 'apiPass gerekli';
    return {
      merchantId: c.merchantId.trim(),
      apiUser: c.apiUser.trim(),
      apiPass: c.apiPass.trim()
    };
  },

  async testConnection(creds: HepsiburadaCredentials): Promise<TestResult> {
    try {
      await fetchListings(creds, 0, 1);
      return { ok: true, storeId: creds.merchantId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      return { ok: false, error: message };
    }
  },

  async fetchStore(creds: HepsiburadaCredentials, displayName?: string): Promise<PlatformStoreSnapshot> {
    const first = await fetchListings(creds, 0, 100);
    const totalProducts = first.totalCount ?? (first.listings?.length ?? 0);
    const sample = first.listings ?? [];

    const categoryMap = new Map<string, { count: number; prices: number[] }>();
    let activeCount = 0;
    for (const item of sample) {
      if (item.isSalable !== false && (item.availableStock ?? 1) > 0) activeCount++;
      const cname = item.categoryName || 'Diğer';
      const entry = categoryMap.get(cname) || { count: 0, prices: [] };
      entry.count++;
      const price = Number(item.price ?? 0);
      if (price > 0) entry.prices.push(price);
      categoryMap.set(cname, entry);
    }

    const activeRatio = sample.length > 0 ? activeCount / sample.length : 1;
    const estimatedActive = Math.round(totalProducts * activeRatio);

    const categories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, stats]) => {
        const minPrice = stats.prices.length ? Math.min(...stats.prices) : 0;
        const maxPrice = stats.prices.length ? Math.max(...stats.prices) : 0;
        const extrapolated = Math.round((stats.count / Math.max(1, sample.length)) * totalProducts);
        return {
          name,
          commission: commissionFor(name),
          kdv: kdvFor(name),
          products: extrapolated,
          buybox: stats.prices.length
            ? `₺${Math.round(minPrice).toLocaleString('tr-TR')} - ₺${Math.round(maxPrice).toLocaleString('tr-TR')}`
            : undefined
        };
      });

    const avgCommission = categories.length
      ? Math.round(
          (categories.reduce((sum, c) => sum + c.commission * c.products, 0) /
            Math.max(1, categories.reduce((sum, c) => sum + c.products, 0))) * 10
        ) / 10
      : 15;

    return {
      name: displayName?.trim() || `Hepsiburada Mağaza (#${creds.merchantId})`,
      storeId: creds.merchantId,
      totalProducts,
      activeProducts: estimatedActive,
      rating: undefined,
      joinDate: null,
      categories,
      avgCommission
    };
  }
};
