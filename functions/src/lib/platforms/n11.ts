import { parseStringPromise } from 'xml2js';
import type {
  N11Credentials,
  PlatformAdapter,
  PlatformStoreSnapshot,
  TestResult
} from './types';

const SOAP_ENDPOINT = 'https://api.n11.com/ws/ProductService.wsdl';

const DEFAULT_COMMISSION_BY_CATEGORY: Record<string, number> = {
  'Elektronik': 11.0,
  'Bilgisayar': 9.5,
  'Telefon': 9.0,
  'Ev': 14.0,
  'Yaşam': 14.0,
  'Kozmetik': 17.0,
  'Giyim': 21.0,
  'Moda': 21.0,
  'Spor': 13.5,
  'Bebek': 11.5,
  'Kırtasiye': 15.5,
  'Otomotiv': 12.0,
  'Süpermarket': 10.0,
  'Mobilya': 12.5,
  'Oyuncak': 16.0,
  'Kitap': 11.5,
  'Hobi': 13.0
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildEnvelope(method: string, body: string, creds: N11Credentials): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
  <soapenv:Header/>
  <soapenv:Body>
    <sch:${method}>
      <auth>
        <appKey>${escapeXml(creds.apiKey)}</appKey>
        <appSecret>${escapeXml(creds.apiSecret)}</appSecret>
      </auth>
      ${body}
    </sch:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

interface ParsedProduct {
  category?: string;
  price?: number;
  stock?: number;
  active?: boolean;
}

interface ParsedListResponse {
  status: 'success' | 'failure';
  errorMessage?: string;
  totalCount: number;
  products: ParsedProduct[];
}

async function callGetProductList(
  creds: N11Credentials,
  pageSize: number,
  currentPage: number
): Promise<ParsedListResponse> {
  const body = `<pagingData>
    <currentPage>${currentPage}</currentPage>
    <pageSize>${pageSize}</pageSize>
  </pagingData>`;
  const envelope = buildEnvelope('GetProductListRequest', body, creds);

  const res = await fetch(SOAP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
      SOAPAction: '"GetProductListRequest"',
      'User-Agent': 'DropScoutTR/1.0'
    },
    body: envelope
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`N11 API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const parsed = (await parseStringPromise(text, {
    explicitArray: false,
    ignoreAttrs: true,
    tagNameProcessors: [(n: string) => n.replace(/^.*:/, '')]
  })) as Record<string, any>;

  const envelopeBody = parsed?.Envelope?.Body || parsed?.Body;
  const response = envelopeBody?.GetProductListResponse;
  if (!response) {
    throw new Error('N11 API yanıtı beklenen formatta değil');
  }

  const status: 'success' | 'failure' = response.result?.status === 'success' ? 'success' : 'failure';
  const errorMessage = response.result?.errorMessage || response.result?.errorCode;
  const totalCount = Number(response.pagingData?.totalCount ?? 0);

  const productsRaw = response.products?.product;
  const productsArr: any[] = !productsRaw ? [] : Array.isArray(productsRaw) ? productsRaw : [productsRaw];

  const products: ParsedProduct[] = productsArr.map((p: any) => {
    const stockItem = p.stockItems?.stockItem;
    const stock = Array.isArray(stockItem)
      ? stockItem.reduce((sum: number, s: any) => sum + Number(s.quantity ?? 0), 0)
      : Number(stockItem?.quantity ?? 0);
    return {
      category: p.category?.name || p.category?.fullName,
      price: Number(p.displayPrice ?? p.price ?? 0),
      stock,
      active: p.saleStatus !== 'Suspended' && stock > 0
    };
  });

  return {
    status,
    errorMessage: typeof errorMessage === 'string' ? errorMessage : undefined,
    totalCount,
    products
  };
}

function commissionFor(categoryName: string): number {
  if (!categoryName) return 14;
  for (const key of Object.keys(DEFAULT_COMMISSION_BY_CATEGORY)) {
    if (categoryName.toLowerCase().includes(key.toLowerCase())) {
      return DEFAULT_COMMISSION_BY_CATEGORY[key];
    }
  }
  return 14;
}

function kdvFor(categoryName: string): number {
  const lower = (categoryName || '').toLowerCase();
  if (lower.includes('giyim') || lower.includes('moda') || lower.includes('bebek') || lower.includes('kitap')) {
    return 10;
  }
  return 20;
}

export const n11Adapter: PlatformAdapter<N11Credentials> = {
  id: 'n11',

  validateCredentials(input: unknown): N11Credentials | string {
    if (!input || typeof input !== 'object') return 'credentials objesi gerekli';
    const c = input as Record<string, unknown>;
    if (typeof c.apiKey !== 'string' || !c.apiKey.trim()) return 'apiKey gerekli';
    if (typeof c.apiSecret !== 'string' || !c.apiSecret.trim()) return 'apiSecret gerekli';
    const sellerCode = typeof c.sellerCode === 'string' && c.sellerCode.trim() ? c.sellerCode.trim() : undefined;
    return {
      apiKey: c.apiKey.trim(),
      apiSecret: c.apiSecret.trim(),
      sellerCode
    };
  },

  async testConnection(creds: N11Credentials): Promise<TestResult> {
    try {
      const r = await callGetProductList(creds, 1, 0);
      if (r.status === 'failure') {
        return { ok: false, error: r.errorMessage || 'N11 API kimlik doğrulaması başarısız' };
      }
      return { ok: true, storeId: creds.sellerCode || 'n11' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      return { ok: false, error: message };
    }
  },

  async fetchStore(creds: N11Credentials, displayName?: string): Promise<PlatformStoreSnapshot> {
    const r = await callGetProductList(creds, 100, 0);
    if (r.status === 'failure') {
      throw new Error(r.errorMessage || 'N11 ürün listesi alınamadı');
    }
    const totalProducts = r.totalCount;
    const sample = r.products;

    const categoryMap = new Map<string, { count: number; prices: number[] }>();
    let activeCount = 0;
    for (const p of sample) {
      if (p.active) activeCount++;
      const cname = p.category || 'Diğer';
      const entry = categoryMap.get(cname) || { count: 0, prices: [] };
      entry.count++;
      if (p.price && p.price > 0) entry.prices.push(p.price);
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
      : 14;

    return {
      name: displayName?.trim() || `N11 Mağaza${creds.sellerCode ? ` (${creds.sellerCode})` : ''}`,
      storeId: creds.sellerCode || 'n11',
      totalProducts,
      activeProducts: estimatedActive,
      rating: undefined,
      joinDate: null,
      categories,
      avgCommission
    };
  }
};
