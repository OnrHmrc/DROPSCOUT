export type PlatformId = 'trendyol' | 'hepsiburada' | 'n11';

export const PLATFORM_IDS: PlatformId[] = ['trendyol', 'hepsiburada', 'n11'];

export interface TrendyolCredentials {
  supplierId: string;
  apiKey: string;
  apiSecret: string;
}

export interface HepsiburadaCredentials {
  merchantId: string;
  apiUser: string;
  apiPass: string;
}

export interface N11Credentials {
  apiKey: string;
  apiSecret: string;
  sellerCode?: string;
}

export type PlatformCredentials =
  | TrendyolCredentials
  | HepsiburadaCredentials
  | N11Credentials;

export interface PlatformCategory {
  name: string;
  commission: number;
  kdv: number;
  products: number;
  buybox?: string;
}

export interface PlatformProduct {
  productCode: string;
  name: string;
  category?: string;
  brand?: string;
  image?: string;
  price: number;
  listPrice?: number;
  stock: number;
  active: boolean;
}

export interface PlatformStoreSnapshot {
  name: string;
  storeId: string;
  totalProducts: number;
  activeProducts: number;
  rating?: number;
  joinDate?: string | null;
  categories: PlatformCategory[];
  avgCommission: number;
  products?: PlatformProduct[];
}

export interface TestResult {
  ok: boolean;
  storeId?: string;
  error?: string;
}

export interface PlatformAdapter<C extends PlatformCredentials = PlatformCredentials> {
  id: PlatformId;
  validateCredentials(input: unknown): C | string;
  testConnection(creds: C): Promise<TestResult>;
  fetchStore(creds: C, displayName?: string): Promise<PlatformStoreSnapshot>;
}
