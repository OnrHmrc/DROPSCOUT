import type {
  PlatformAdapter,
  PlatformProduct,
  PlatformStoreSnapshot,
  TestResult,
  TrendyolCredentials
} from './types';

const API_BASE = 'https://apigw.trendyol.com/integration';

const DEFAULT_COMMISSION_BY_CATEGORY_NAME: Record<string, number> = {
  'Elektronik': 12.0,
  'Ev & Yaşam': 15.5,
  'Kozmetik': 18.0,
  'Giyim': 22.0,
  'Moda': 22.0,
  'Spor & Outdoor': 14.0,
  'Anne & Bebek': 12.0,
  'Kırtasiye': 16.0,
  'Otomotiv': 13.0,
  'Süpermarket': 11.0
};

function authHeader(creds: TrendyolCredentials): string {
  const pair = `${creds.apiKey}:${creds.apiSecret}`;
  return 'Basic ' + Buffer.from(pair, 'utf8').toString('base64');
}

function commonHeaders(creds: TrendyolCredentials): Record<string, string> {
  return {
    'Authorization': authHeader(creds),
    'User-Agent': `${creds.supplierId} - SelfIntegration`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

async function fetchProductsPage(
  creds: TrendyolCredentials,
  page: number,
  size: number
): Promise<{ totalElements: number; totalPages: number; content: any[] }> {
  const url = `${API_BASE}/product/sellers/${encodeURIComponent(creds.supplierId)}/products?page=${page}&size=${size}`;
  const res = await fetch(url, { method: 'GET', headers: commonHeaders(creds) });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Trendyol API kimlik bilgileri geçersiz (401/403)');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Trendyol API hatası ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { totalElements: number; totalPages: number; content: any[] };
}

function commissionFor(categoryName: string): number {
  if (!categoryName) return 15;
  for (const key of Object.keys(DEFAULT_COMMISSION_BY_CATEGORY_NAME)) {
    if (categoryName.toLowerCase().includes(key.toLowerCase())) {
      return DEFAULT_COMMISSION_BY_CATEGORY_NAME[key];
    }
  }
  return 15;
}

function kdvFor(categoryName: string): number {
  const lower = (categoryName || '').toLowerCase();
  if (lower.includes('giyim') || lower.includes('moda') || lower.includes('bebek')) return 10;
  return 20;
}

export const trendyolAdapter: PlatformAdapter<TrendyolCredentials> = {
  id: 'trendyol',

  validateCredentials(input: unknown): TrendyolCredentials | string {
    if (!input || typeof input !== 'object') return 'credentials objesi gerekli';
    const c = input as Record<string, unknown>;
    if (typeof c.supplierId !== 'string' || !c.supplierId.trim()) return 'supplierId gerekli';
    if (typeof c.apiKey !== 'string' || !c.apiKey.trim()) return 'apiKey gerekli';
    if (typeof c.apiSecret !== 'string' || !c.apiSecret.trim()) return 'apiSecret gerekli';
    return {
      supplierId: c.supplierId.trim(),
      apiKey: c.apiKey.trim(),
      apiSecret: c.apiSecret.trim()
    };
  },

  async testConnection(creds: TrendyolCredentials): Promise<TestResult> {
    try {
      await fetchProductsPage(creds, 0, 1);
      return { ok: true, storeId: creds.supplierId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      return { ok: false, error: message };
    }
  },

  async fetchStore(creds: TrendyolCredentials, displayName?: string): Promise<PlatformStoreSnapshot> {
    const firstPage = await fetchProductsPage(creds, 0, 100);
    const totalProducts = firstPage.totalElements ?? (firstPage.content?.length ?? 0);
    const sample = firstPage.content ?? [];

    const categoryMap = new Map<string, { count: number; prices: number[] }>();
    let activeCount = 0;
    for (const p of sample) {
      if (p.archived === false && p.onSale !== false) activeCount++;
      const cname = p.categoryName || p.pimCategoryName || 'Diğer';
      const entry = categoryMap.get(cname) || { count: 0, prices: [] };
      entry.count++;
      const price = Number(p.salePrice ?? p.listPrice ?? 0);
      if (price > 0) entry.prices.push(price);
      categoryMap.set(cname, entry);
    }

    const activeRatio = sample.length > 0 ? activeCount / sample.length : 1;
    const estimatedActive = Math.round(totalProducts * activeRatio);

    const products: PlatformProduct[] = sample.slice(0, 50).map((p: any) => {
      const imgRaw = Array.isArray(p.images) ? p.images[0] : p.images;
      const image = typeof imgRaw === 'string' ? imgRaw : imgRaw?.url;
      const stock = Number(p.quantity ?? 0);
      const isActive = p.archived === false && p.onSale !== false && stock > 0;
      return {
        productCode: String(p.barcode || p.productMainId || p.stockCode || p.id || ''),
        name: String(p.title || p.productName || 'İsimsiz Ürün'),
        category: p.categoryName || p.pimCategoryName || undefined,
        brand: p.brand || undefined,
        image: image || undefined,
        price: Number(p.salePrice ?? p.listPrice ?? 0),
        listPrice: p.listPrice ? Number(p.listPrice) : undefined,
        stock,
        active: isActive
      };
    });

    const categories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, stats]) => {
        const minPrice = stats.prices.length ? Math.min(...stats.prices) : 0;
        const maxPrice = stats.prices.length ? Math.max(...stats.prices) : 0;
        const extrapolated = Math.round((stats.count / Math.max(1, sample.length)) * totalProducts);
        const commission = commissionFor(name);
        return {
          name,
          commission,
          kdv: kdvFor(name),
          products: extrapolated,
          buybox: stats.prices.length
            ? `₺${Math.round(minPrice).toLocaleString('tr-TR')} - ₺${Math.round(maxPrice).toLocaleString('tr-TR')}`
            : undefined
        };
      });

    const avgCommission = categories.length
      ? Math.round((categories.reduce((sum, c) => sum + c.commission * c.products, 0) /
          Math.max(1, categories.reduce((sum, c) => sum + c.products, 0))) * 10) / 10
      : 15;

    return {
      name: displayName?.trim() || `Trendyol Mağaza (#${creds.supplierId})`,
      storeId: creds.supplierId,
      totalProducts,
      activeProducts: estimatedActive,
      rating: undefined,
      joinDate: null,
      categories,
      avgCommission,
      products
    };
  }
};
