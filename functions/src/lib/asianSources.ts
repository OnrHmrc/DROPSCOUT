// ─────────────────────────────────────────────────────────
// DropScout TR — Gap Radar Asya domestic kaynak adapter'ları
// Mimari: docs/architecture.md §5
//
// Her kaynak Apify aktörü ile beslenir. Aktör ID secret olarak tanımlı
// (lib/apify.ts → APIFY_*_ACTOR_ID); set edilmediği sürece adapter
// deterministic placeholder döner. Bu sayede kullanıcı Apify hesabı
// açana kadar pipeline + frontend uçtan uca test edilebilir.
// Hesap aktif olunca: secret set + deploy → adapter aynı imzayla
// gerçek veri akıtır, başka kod değişmez.
// ─────────────────────────────────────────────────────────

import {
  type AsianSourceId,
  getAsianActorId,
  hasApifyToken,
  runActorSync
} from './apify';
import type { AsianLang } from './claude';

export interface RawCandidate {
  /** Kaynak platform id'si */
  sourceId: AsianSourceId;
  /** Platform üzerindeki ürün/post linki (attribution için) */
  sourceUrl: string;
  /** Platform-side benzersiz id (hash'lenecekse de input) */
  externalId: string;
  /** TR kategori canonical id (TRACKED_CATEGORIES.id) */
  categoryId: string;
  /** Orijinal dilde başlık */
  title: string;
  /** Önceden çevrilmişse (placeholder akışı) */
  titleTr?: string;
  /** Orijinal dilde tek cümle açıklama */
  description?: string;
  /** Önceden çevrilmişse */
  descriptionTr?: string;
  /** Kaynak dil — çeviri katmanı için */
  sourceLang: AsianLang;
  /** Platform CDN görsel URL (DropScout sunucusunda host edilmez) */
  image?: string;
  /** İçerik üreticisi/satıcısı — attribution için */
  creator?: string;
  /** Viral/satış sinyali */
  metric: {
    posts?: number;
    likes?: number;
    sales?: number;
    rank?: number;
    rating?: number;
  };
  /** Kaynaktaki tespit zamanı (ms) */
  detectedAt: number;
  /** Placeholder mı yoksa gerçek aktör çıktısı mı */
  isPlaceholder: boolean;
}

export interface AsianSourceMeta {
  id: AsianSourceId;
  name: string;
  country: string;
  lang: AsianLang;
  /** Kullanıcıya gösterilecek kısa açıklama */
  blurb: string;
}

export const ASIAN_SOURCES: Record<AsianSourceId, AsianSourceMeta> = {
  douyin: {
    id: 'douyin',
    name: 'Douyin',
    country: 'CN',
    lang: 'zh',
    blurb: "Çin'in TikTok'u — küresel TikTok'tan 6-12 ay önde sinyal"
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: 'Xiaohongshu',
    country: 'CN',
    lang: 'zh',
    blurb: 'RedNote — Çin lifestyle/güzellik viralinin başlangıcı'
  },
  taobao: {
    id: 'taobao',
    name: 'Taobao',
    country: 'CN',
    lang: 'zh',
    blurb: "Çin iç pazar günlük marketplace ranking'i"
  },
  coupang: {
    id: 'coupang',
    name: 'Coupang Best',
    country: 'KR',
    lang: 'ko',
    blurb: 'Güney Kore — K-beauty / K-fashion göstergesi'
  },
  rakuten: {
    id: 'rakuten',
    name: 'Rakuten',
    country: 'JP',
    lang: 'ja',
    blurb: 'Japonya günlük/haftalık marketplace sıralaması'
  },
  'mercari-jp': {
    id: 'mercari-jp',
    name: 'Mercari JP',
    country: 'JP',
    lang: 'ja',
    blurb: 'Japon C2C — niş viral göstergesi'
  }
};

// ─── Placeholder havuzu ───────────────────────────────────
// Kategori başına TR adlar (gerçek pipeline çevirisi yapılacakmış gibi).
// Asya kaynaklarda viral olabilecek tipte ürünler seçildi.

const PLACEHOLDER_PRODUCTS: Record<string, string[]> = {
  elektronik: [
    'Mini Cep Projektörü', 'RGB LED Şerit Set', 'Akıllı Şarj Standı', 'Bluetooth Yaka Mikrofonu',
    'Taşınabilir Hub USB-C', 'Akıllı Halka Kontroller', 'Mini Hava Pompası', 'LED Halka Lamba'
  ],
  'ev-yasam': [
    'Akıllı Aroma Difüzör', 'LED Gece Bulut Lambası', 'Otomatik Sabunluk', 'Ultrason Cam Temizleyici',
    'Manyetik Pencere Sileceği', 'Taşınabilir Çamaşır Cihazı', 'Akıllı Çöp Kovası', 'Mini Nemlendirici'
  ],
  kozmetik: [
    'Kablosuz Dudak Nemlendirici', 'LED Yüz Maskesi', 'Mini Yüz Buharı', 'Otomatik Saç Şekillendirici',
    'Vakumlu Komedon Aleti', 'Mikro-Akım Yüz Cihazı', 'Saç Bakım Spreyi', 'Tırnak LED Kurutucu'
  ],
  giyim: [
    'Kore Tarzı Termal Tayt', 'Oversize Hoodie', 'Vintage Karikatür Tişört', 'Kaşmir Hırka',
    'Akıllı Isıtmalı Yelek', 'Korse Üst', 'Y2K Mini Etek', 'Streetwear Kargo Pantolon'
  ],
  'spor-outdoor': [
    'Hafif Egzersiz Lastiği Set', 'Yoga Halkası', 'Smart Atlama İpi', 'Karın Rulosu',
    'Su Geçirmez Bel Çantası', 'Kompakt Kamp Sandalyesi', 'Otomatik Doldurma Top Pompası', 'Push-up Aparatı'
  ],
  'anne-bebek': [
    'Müzikli Karakter Bebek', 'Silikon Mama Önlüğü', 'Akıllı Biberon Isıtıcı', 'Diş Çıkarma Yüzüğü',
    'Sensörlü Gece Lambası', 'Bebek Burun Aspiratörü', 'Hareketli Sallanan Beşik', 'Yumuşak Gözlük'
  ],
  kirtasiye: [
    'Pastel Renk Kalem Set', 'Akıllı Etiketleyici', 'Mini Defter Set', 'Manyetik Beyaz Tahta',
    'Kırtasiye Düzenleyici', 'Çıkartma Albümü', 'Vintage Mum Mühür', 'LED Aydınlatmalı Kalem'
  ],
  otomotiv: [
    'Akıllı Manyetik Telefon Tutucu', 'Araç İçi Vakum', 'LED Ambient Aydınlatma', 'Manyetik Anahtarlık',
    'Hava Spreyi Difüzör', 'Cam Buğu Sileceği', 'Yağmur Sensörlü Silecek Pad', 'USB Hızlı Şarj Modülü'
  ],
  supermarket: [
    'Konjac Eriştesi', 'Matcha Toz Set', 'Asya Atıştırmalık Karışım', 'Probiyotik İçecek',
    'Elektrolit Tablet', 'Bambu Diş Fırçası', 'Doğal Yıkama Tabletleri', 'Vitamin Sakız Set'
  ],
  'kitap-hobi': [
    'Pixel Art Boncuk Set', 'Mini Origami Kit', 'Müzik Kutusu DIY', 'Renkli Boyama Kitabı',
    'Kristal Büyüme Kit', 'Mini Akvaryum Bonsai', 'Lego Mimari Set', 'Akıllı Müzik Halkası'
  ],
  mobilya: [
    'Katlanır Bilgisayar Masası', 'LED Aynalı Komodin', 'Modüler Raf Sistemi', 'Şarjlı Masa Lambası',
    'Mini Bambu Sehpa', 'Astronot Lamba', 'Şişme Ergonomik Yastık', 'Magnetik Mum Tutucu'
  ],
  aksesuar: [
    'Vintage Charm Bilezik', 'Kore Tarzı Saç Tokası', 'Pearl Choker Kolye', 'Y2K Çanta',
    'Mini Crossbody Çanta', 'Renkli Saat Bandı', 'Boncuk Yüzük Set', 'Kristal Küpe Set'
  ],
  oyuncak: [
    'Pop-it Klavye', 'Mıknatıslı Yapı Bloğu', 'Karakter Squishy Set', 'Stres Topu Slime',
    'Mini RC Drift Araba', 'Plush Avokado Yastık', 'LED Kristal Küre', 'Manyetik Toplama Oyuncağı'
  ],
  mutfak: [
    'Akıllı Sebze Doğrayıcı', 'Mini Waffle Makinesi', 'Otomatik Çırpıcı', 'Silikon Pasta Kalıbı',
    'Magnet Baharat Şişesi', 'Hızlı Buz Kalıbı', 'USB Şarjlı Kahve Karıştırıcı', 'Mini Espresso Demlik'
  ],
  'evcil-hayvan': [
    'Otomatik Mama Kabı', 'LED Tasma', 'Lazer Oyun Topu', 'Pet Grooming Eldiveni',
    'Sıcaklık Kontrollü Yatak', 'Diş Bakım Çiğneme Oyuncağı', 'Kediye GPS Halka', 'Çekme Eğitim Topu'
  ]
};

const ALL_CATEGORIES = Object.keys(PLACEHOLDER_PRODUCTS);

function fallbackProducts(categoryId: string): string[] {
  return PLACEHOLDER_PRODUCTS[categoryId] || PLACEHOLDER_PRODUCTS[ALL_CATEGORIES[0]];
}

// Asya dillerinde "yapay ama dil rozetini doğru gösteren" örnek başlıklar
const ORIGINAL_HINT: Record<AsianLang, (tr: string, seed: number) => string> = {
  zh: (tr, seed) => `便携 ${tr}`.slice(0, 40) + ` #${(seed % 99) + 1}`,
  ja: (tr, seed) => `新作 ${tr}`.slice(0, 40) + ` #${(seed % 99) + 1}`,
  ko: (tr, seed) => `인기 ${tr}`.slice(0, 40) + ` #${(seed % 99) + 1}`
};

function seedFor(input: string): number {
  let s = 0;
  for (let i = 0; i < input.length; i++) s = (s * 31 + input.charCodeAt(i)) & 0xffffffff;
  return Math.abs(s);
}

function pseudoRand(seed: number, n: number): number {
  return Math.abs(Math.sin(seed * (n + 1) * 12.9898)) % 1;
}

function makePlaceholder(
  source: AsianSourceMeta,
  categoryId: string,
  index: number
): RawCandidate {
  const products = fallbackProducts(categoryId);
  const tr = products[index % products.length];
  const seed = seedFor(`${source.id}:${categoryId}:${index}`);
  const r = (n: number) => pseudoRand(seed, n);

  // Sosyal kaynaklar (douyin, xiaohongshu) → posts/likes ağırlıklı
  // Marketplace (taobao, coupang, rakuten) → sales/rank ağırlıklı
  // C2C (mercari-jp) → likes/sales karışık
  const isMarketplace = source.id === 'taobao' || source.id === 'coupang' || source.id === 'rakuten';
  const isSocial = source.id === 'douyin' || source.id === 'xiaohongshu';
  const baseSignal = 200 + r(1) * 4800;

  return {
    sourceId: source.id,
    sourceUrl: `https://example.com/placeholder/${source.id}/${categoryId}/${index}`,
    externalId: `ph-${source.id}-${categoryId}-${index}`,
    categoryId,
    title: ORIGINAL_HINT[source.lang](tr, seed),
    titleTr: tr,
    description: undefined,
    descriptionTr: `${source.country} pazarında son dönemde dikkat çeken ürün — ${source.name} kaynaklı sinyal`,
    sourceLang: source.lang,
    image: undefined, // gerçek aktörde platform CDN URL'i gelir
    creator: isSocial ? `@${source.id}_creator_${(seed % 99) + 1}` : `${source.name} satıcı #${(seed % 99) + 1}`,
    metric: {
      posts: isSocial ? Math.round(baseSignal) : undefined,
      likes: isSocial ? Math.round(baseSignal * (3 + r(2) * 7)) : undefined,
      sales: isMarketplace ? Math.round(50 + r(3) * 1500) : (source.id === 'mercari-jp' ? Math.round(20 + r(3) * 400) : undefined),
      rank: isMarketplace ? Math.round(1 + r(4) * 50) : undefined,
      rating: 3.6 + r(5) * 1.4
    },
    detectedAt: Date.now(),
    isPlaceholder: true
  };
}

// ─── Apify aktör çıktısı normalizer ───────────────────────
// Gerçek aktör seçilince input/output şeması netleşir; bu fonksiyon
// olası alan adı varyasyonlarını esnek şekilde normalize eder.
// Şu an "tahmin tabanlı" — aktör sonrası iterasyon gerekebilir.

interface ApifyRawItem {
  // çoklu olası alan adları
  id?: string | number;
  url?: string;
  link?: string;
  title?: string;
  name?: string;
  productName?: string;
  description?: string;
  desc?: string;
  image?: string;
  imageUrl?: string;
  thumbnail?: string;
  images?: Array<{ url?: string } | string>;
  creator?: string;
  author?: string;
  shop?: string;
  posts?: number;
  postCount?: number;
  likes?: number;
  likeCount?: number;
  sales?: number;
  salesCount?: number;
  soldCount?: number;
  rank?: number;
  ranking?: number;
  rating?: number;
  score?: number;
  // her şey
  [k: string]: unknown;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNum(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function normalizeApifyItem(
  raw: ApifyRawItem,
  source: AsianSourceMeta,
  categoryId: string,
  index: number
): RawCandidate | null {
  const title = pickStr(raw.title, raw.name, raw.productName);
  const sourceUrl = pickStr(raw.url, raw.link);
  if (!title || !sourceUrl) return null;

  let image: string | undefined = pickStr(raw.image, raw.imageUrl, raw.thumbnail);
  if (!image && Array.isArray(raw.images) && raw.images.length) {
    const first = raw.images[0];
    if (typeof first === 'string') image = first;
    else if (first && typeof first === 'object' && 'url' in first) image = (first as { url?: string }).url;
  }

  return {
    sourceId: source.id,
    sourceUrl,
    externalId: String(raw.id ?? `${source.id}-${index}`),
    categoryId,
    title,
    description: pickStr(raw.description, raw.desc),
    sourceLang: source.lang,
    image,
    creator: pickStr(raw.creator, raw.author, raw.shop),
    metric: {
      posts: pickNum(raw.posts, raw.postCount),
      likes: pickNum(raw.likes, raw.likeCount),
      sales: pickNum(raw.sales, raw.salesCount, raw.soldCount),
      rank: pickNum(raw.rank, raw.ranking),
      rating: pickNum(raw.rating, raw.score)
    },
    detectedAt: Date.now(),
    isPlaceholder: false
  };
}

// ─── Tek kaynak fetch ─────────────────────────────────────

const PER_SOURCE_TIMEOUT_SECS = 90;
const PER_SOURCE_MAX_ITEMS = 12;

interface ApifyAsianInput {
  category: string;
  query: string;
  language: AsianLang;
  maxItems: number;
}

async function fetchOneSource(
  source: AsianSourceMeta,
  categoryId: string,
  query: string
): Promise<RawCandidate[]> {
  const actorId = getAsianActorId(source.id);

  if (!hasApifyToken() || !actorId) {
    // Placeholder
    return Array.from({ length: 3 }).map((_, i) =>
      makePlaceholder(source, categoryId, i)
    );
  }

  try {
    const input: ApifyAsianInput = {
      category: categoryId,
      query,
      language: source.lang,
      maxItems: PER_SOURCE_MAX_ITEMS
    };
    const items = await runActorSync<ApifyAsianInput, ApifyRawItem>(actorId, input, {
      timeoutSecs: PER_SOURCE_TIMEOUT_SECS,
      maxItems: PER_SOURCE_MAX_ITEMS
    });
    const normalized = items
      .map((it, i) => normalizeApifyItem(it, source, categoryId, i))
      .filter((x): x is RawCandidate => x !== null);

    if (normalized.length === 0) {
      console.warn('[asianSources] aktör boş döndü, placeholder devreye giriyor', {
        source: source.id,
        categoryId
      });
      return Array.from({ length: 3 }).map((_, i) =>
        makePlaceholder(source, categoryId, i)
      );
    }
    return normalized;
  } catch (err) {
    console.warn('[asianSources] aktör hatası, placeholder devreye giriyor', {
      source: source.id,
      categoryId,
      error: err instanceof Error ? err.message : String(err)
    });
    return Array.from({ length: 3 }).map((_, i) =>
      makePlaceholder(source, categoryId, i)
    );
  }
}

// ─── Toplu fetch — pipeline'ın 1. adımı ───────────────────

/**
 * Belirli bir TR kategorisi için 6 Asya kaynağı paralel sorgular.
 * Her kaynak hata verse bile diğerleri akar (Promise.allSettled).
 */
export async function discoverAsianCandidates(
  categoryId: string,
  query: string
): Promise<RawCandidate[]> {
  const sources = Object.values(ASIAN_SOURCES);
  const results = await Promise.allSettled(
    sources.map((s) => fetchOneSource(s, categoryId, query))
  );

  const out: RawCandidate[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  return out;
}
