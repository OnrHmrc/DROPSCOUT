# DropScout TR — Backend Mimarisi

> Son güncelleme: 2026-04-21
> Durum: Plan onaylandı, uygulamaya geçilecek (Hafta 1 başlangıcı)

## 1. Amaç

DropScout TR'nin "AI destekli ürün keşif platformu" iddiasını gerçek altyapıyla desteklemek:
- Marketplace verileri (rakip listing, fiyat, trend) gerçek kaynaklardan
- AI içgörüleri (strateji metni, skor yorumlama) Claude API ile
- Satıcı entegrasyonu (Trendyol/Hepsiburada/N11/Amazon SP-API) resmi API'lerden
- Tüm bunlar **agresif cache + cron-tabanlı veri çekme** ile maliyet sabit tutulur

## 2. Mimari

```
┌─────────────────────────────────────────────────────────┐
│  Browser (vanilla HTML/JS)                              │
│  ─ /src/js/api.js  → tüm dış istekler buradan          │
└────────────────────┬────────────────────────────────────┘
                     │ Auth'lu fetch (Firebase ID token)
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Firebase Functions 2nd gen (Cloud Run alt yapısı)      │
│  ─ Auth middleware (verifyIdToken)                      │
│  ─ Rate limiting + quota                                │
│  ─ Secret Manager → tüm API key'ler                     │
└──┬──────────────┬──────────────┬──────────────┬─────────┘
   │              │              │              │
   ↓              ↓              ↓              ↓
┌──────┐    ┌─────────┐    ┌──────────┐   ┌──────────┐
│Apify │    │SerpAPI  │    │ Claude   │   │Marketplace│
│Trend │    │Google   │    │ Haiku 4.5│   │Seller API│
│yol/HB│    │Trends   │    │          │   │(satıcı   │
│scrape│    │         │    │          │   │ key'leri)│
└──┬───┘    └────┬────┘    └────┬─────┘   └────┬─────┘
   │             │              │              │
   └─────────────┴──────────────┴──────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  Firestore (cache + persistence)                        │
│  ─ users/{uid}/products/{id}                            │
│  ─ users/{uid}/watchlist/{id}                           │
│  ─ users/{uid}/platforms/{id}                           │
│  ─ cache/listings/{platform}/{categoryId}  (6h TTL)     │
│  ─ cache/trends/{categoryId}                (24h TTL)   │
│  ─ cache/insights/{productHash}             (30g TTL)   │
└─────────────────────────────────────────────────────────┘
                     ↑
┌─────────────────────────────────────────────────────────┐
│  Cloud Scheduler (cron)                                 │
│  ─ scrape-listings    her 6 saatte bir                  │
│  ─ refresh-trends     günde 1 kez (00:00 TR)            │
│  ─ cleanup-cache      haftada 1 kez                     │
└─────────────────────────────────────────────────────────┘
```

## 3. Bileşenler

### 3.1 Backend: Firebase Cloud Functions 2nd gen
- **Niye:** Zaten Firebase'desin, vendor sıçraması yok. 2nd gen Cloud Run üstünde — uzun timeout (60dk), daha az cold start.
- **Free tier:** 2M çağrı/ay, 400.000 GB-saniye
- **Dizin:** `functions/` — TypeScript, esbuild bundle

### 3.2 Frontend HTTP katmanı: `/src/js/api.js`
- Tüm dış istek bu modülden geçer
- `getIdToken()` → her istekte `Authorization: Bearer <token>`
- Hata yönetimi merkezi
- Retry + exponential backoff

### 3.3 Cache stratejisi (Firestore)
| Koleksiyon | TTL | Boyut tahmini |
|---|---|---|
| `cache/listings/{platform}/{categoryId}` | 6h | ~100 ürün/kategori, 50KB |
| `cache/trends/{categoryId}` | 24h | ~5KB/kategori |
| `cache/insights/{productHash}` | 30 gün | ~2KB/ürün |
| `cache/store-data/{uid}/{platform}` | 1h | ~20KB |

**Prensip:** Kullanıcı sayfa açınca scraping/AI tetiklenmez. Yalnızca cache miss durumunda, cron job henüz dolmadıysa, on-demand fallback çalışır (max 1 fallback/saat/kullanıcı, rate-limited).

### 3.4 Veri kaynakları

#### Apify (marketplace listing scraping)
- **Niye:** TR marketplace'lerinin resmi listing API'si yok. Apify hazır actor'lar + IP rotation + proxy sağlıyor. Self-host Playwright 1+ insan-saat/hafta bakım = $49/ay'dan pahalı.
- **Kullanım:** Cloud Scheduler her 6h → top 50 kategori için Trendyol/Hepsiburada listing → Firestore cache
- **Maliyet:** $49/ay başlangıç (Personal plan), 49USD = ~3000 sayfa scrape
- **Sayfalar:** `gap-radar.html`, `rakip-analizi.html`, `trend-radar.html`

#### SerpAPI (Google Trends)
- **Niye:** pytrends rate-limited + güvensiz. SerpAPI resmi proxy, JSON döner.
- **Kullanım:** Günde 1x → her ana kategori için son 7g + 30g + 12ay trend → Firestore cache
- **Maliyet:** $50/ay başlangıç, 5000 search → ~150 kategori * 30 gün = yetiyor
- **Alternatif düşünüldü:** SearchAPI.io (~$30/ay daha ucuz). Başlangıç için SerpAPI dökümantasyon kalitesi nedeniyle tercih.
- **Sayfalar:** `trend-radar.html`, `gap-radar.html`

#### Claude Haiku 4.5 (AI içgörü)
- **Niye:** Türkçe kalitesi iyi, prompt caching ile maliyet düşük, Anthropic SDK doğrudan
- **Kullanım:**
  - Yeni ürün analiz edildiğinde → strateji metni + güçlü/zayıf yön → Firestore cache (30 gün)
  - Rakip analizi karşılaştırma yorumu → cache
  - DropScore reasoning ("niye 78?")
- **Prompt caching:** Sistem promptu + ortak kategori bilgisi cache'lenir → ~%70 maliyet düşüşü
- **Maliyet:** $10-30/ay (500-1500 ürün analizi varsayımıyla)
- **Model ID:** `claude-haiku-4-5-20251001`

#### Marketplace Seller API'leri (resmi, satıcının kendi key'i)
- **Trendyol Seller API** — supplier ID + API key, ücretsiz, ürün/sipariş/komisyon
- **Hepsiburada Marketplace API** — merchant ID + API key, ücretsiz
- **N11 API** — appKey + appSecret, ücretsiz
- **Amazon SP-API** — geliştirici hesabı + LWA → 2-4 hafta onay süresi, paralel başlat
- **Sayfalar:** `trendyol.html`, `hepsiburada.html`, `n11.html`, `amazon-tr.html`

### 3.5 Auth & güvenlik
- Tüm Function endpoint'leri Firebase ID token doğrular (`firebase-admin` SDK)
- Secret Manager → API key'ler kod dışında
- Rate limit: kullanıcı başına 60 req/dakika (Functions katmanında)
- Marketplace API key'leri: kullanıcının kendi key'i, Firestore'da AES-256 encrypt'li (KMS)

### 3.6 Observability
- **Sentry** (free tier) → frontend + backend hata izleme
- **Cloud Logging** → Functions log'ları (Firebase otomatik)
- **Slack/Discord webhook** → critical error alert (cron job fail vb.)

## 4. Cron job tablosu

| Job | Frekans | Function | Amaç |
|---|---|---|---|
| `scrape-listings` | Her 6 saatte | `scheduledScrapeListings` | Top 50 kategori için listing data |
| `refresh-trends` | Günde 1x (00:00 TR) | `scheduledRefreshTrends` | Google Trends snapshot |
| `cleanup-cache` | Haftada 1x | `scheduledCleanupCache` | TTL geçmiş cache sil |
| `sync-active-stores` | Her 4 saatte | `scheduledSyncActiveStores` | Bağlı satıcıların kendi mağaza verisi |

## 5. Yol haritası (4 hafta)

### Hafta 1 — Backend iskeleti
- [ ] `functions/` dizini, Firebase Functions 2nd gen init (TypeScript)
- [ ] `firebase.json` ve `.firebaserc` güncelle (functions deploy hedefi)
- [ ] Auth middleware (`verifyAuthToken`)
- [ ] Secret Manager → ilk secret (`CLAUDE_API_KEY`) yerleştir
- [ ] Firestore cache koleksiyon şeması + security rules güncellemesi
- [ ] `/src/js/api.js` → frontend HTTP wrapper
- [ ] İlk endpoint: `GET /api/health` (auth'lu, simple ping)
- [ ] Sentry SDK frontend + backend kurulum

### Hafta 2 — AI içgörü katmanı
- [ ] `analyzeProduct(productData)` Function
  - Claude Haiku 4.5 prompt (sistem promptu cache'li)
  - Çıktı: `{ scoreReasoning, strengths[], weaknesses[], strategy, actions[] }`
  - Firestore'a cache (`cache/insights/{hash}`, 30g TTL)
- [ ] `dropscout.html` ve `rakip-analizi.html` `analyzeProduct` çağırır
- [ ] Loading state + error fallback
- [ ] Token kullanımı log'a yaz, maliyet izleme dashboard'u

### Hafta 3 — Satıcı API entegrasyonu
- [ ] Trendyol Seller API client (Function içinde)
  - `connectTrendyol(supplierId, apiKey)` → test + Firestore'a encrypted save
  - `syncTrendyol(uid)` → ürün/sipariş/komisyon çek, Firestore'a yaz
- [ ] Hepsiburada Marketplace API client
- [ ] N11 API client
- [ ] Amazon SP-API başvurusu (paralel — onay 2-4 hafta)
- [ ] `trendyol.html` / `hepsiburada.html` / `n11.html` formları gerçek bağlantı yapar
- [ ] `scheduledSyncActiveStores` cron'u

### Hafta 4 — Pazar verisi
- [ ] Apify hesap + Trendyol actor + Hepsiburada actor seçimi
- [ ] `scheduledScrapeListings` Function (Apify SDK)
- [ ] SerpAPI hesap + `scheduledRefreshTrends` Function
- [ ] `gap-radar.html` cache'ten okur (kategori bazlı boşluk analizi)
- [ ] `trend-radar.html` cache'ten okur
- [ ] Cleanup cron + monitoring

## 6. Maliyet özeti

### Hafta 1-2 (sadece backend + AI)
| Bileşen | Aylık |
|---|---|
| Firebase Functions/Firestore/Hosting | $0-15 |
| Claude Haiku 4.5 (cache'li) | $10-30 |
| Sentry | $0 |
| **Toplam** | **$10-45** |

### Hafta 3-4 (full stack devrede)
| Bileşen | Aylık |
|---|---|
| Yukarıdaki | $10-45 |
| Apify | $49 |
| SerpAPI | $50 |
| **Toplam** | **$109-144** |

### 500+ kullanıcıya ölçeklenince
- Firebase faturalandırma artar (~$50-100)
- Apify daha yüksek tier (~$99)
- Claude maliyet kullanım oranlı
- **Tahmini toplam:** $250-400/ay (sürdürülebilir)

## 7. Bilinçli olarak YAPMADIKLARIMIZ

| Şey | Niye yok |
|---|---|
| Vector DB (Pinecone, Weaviate) | RAG ihtiyacı yok, ürün veri Firestore'a sığar |
| Ayrı backend host (Heroku, AWS EC2) | Functions yeterli, vendor sayısı az tutulur |
| Kubernetes / Docker compose | Aşırı mühendislik |
| Helium 10 / Keepa entegrasyonu | $200-500/ay, TR pazarı için karşılığı zayıf |
| OpenAI Enterprise | Claude Haiku TR'de daha iyi, daha ucuz |
| Datadog / New Relic | Sentry + Cloud Logging yeterli |
| Redis / CDN cache katmanı | Firestore cache yeterli; ölçek artarsa eklenir |
| Microservice'lere bölme | 1 Function projesi yeterli |

## 8. Risk & azaltma

| Risk | Azaltma |
|---|---|
| Apify scrape'i Trendyol bot koruması yakalar | Apify residential proxy zaten var; backup: 2. actor sağlayıcısı (Bright Data) |
| Claude API rate limit | Prompt caching + queue (Firestore-tabanlı job kuyruğu) |
| Marketplace API key sızması | Secret Manager + Firestore AES-256 encrypt + audit log |
| Firestore okuma faturası şişer | Cache'ler doğru TTL ile, gereksiz `getDocs` kullanma — `getDoc` tek koleksiyon |
| Cron job sessiz fail | Sentry + Slack webhook her cron sonu rapor |
