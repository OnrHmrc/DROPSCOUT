# DropScout TR — Backend Mimarisi

> Son güncelleme: 2026-04-28
> Durum: Birleşik API Modeli (TR) + Asya domestic kaynak Gap Radar — onaylanmış son tasarım

## 1. Amaç

DropScout TR'nin "AI destekli ürün keşif platformu" iddiasını gerçek altyapıyla desteklemek:
- **TR pazaryeri verileri** (rakip listing, fiyat, trend) **resmi Satıcı API'leri** üzerinden — birleşik API modeli
- **Yurt dışı keşif verileri** (Gap Radar) Asya domestic platformlarından — Apify + SerpAPI + Claude çeviri katmanı
- AI içgörüleri Claude Haiku 4.5 ile
- Maliyet sabit, marj %70+ hedefli

İki farklı veri rejimi var:
- **TR-içi modüller** (Trend Radar, Rakip Analizi, Link Analizi): scraping yok, yalnız resmi API'ler + anonim havuz
- **Gap Radar** (yalnız İşletme planı): Asya domestic kaynaklar, scraping kabul edilebilir + sınırlı SerpAPI

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (vanilla HTML/JS)                                   │
│  ─ /src/js/api.js  → tüm dış istekler buradan               │
└────────────────────┬─────────────────────────────────────────┘
                     │ Auth'lu fetch (Firebase ID token)
                     ↓
┌──────────────────────────────────────────────────────────────┐
│  Firebase Functions 2nd gen (Cloud Run alt yapısı)           │
│  ─ Auth middleware (verifyIdToken)                           │
│  ─ Plan/quota katmanı                                        │
│  ─ Rate limiting (60 req/dak/uid)                            │
│  ─ Secret Manager → tüm API key'ler                          │
└──┬────────────────┬──────────────┬──────────────┬────────────┘
   │                │              │              │
   ↓ TR-içi        ↓              ↓ Gap Radar    ↓
┌────────────┐ ┌──────────┐ ┌────────────────────────────┐
│ Marketplace│ │ Claude   │ │ Apify (Asya domestic)      │
│ Seller API │ │ Haiku 4.5│ │  ─ Douyin trending         │
│ ─ Platform │ │ ─ AI     │ │  ─ Xiaohongshu hot         │
│   sahip key│ │   içgörü │ │  ─ Taobao/Tmall ranking    │
│ ─ Kullanıcı│ │ ─ Çeviri │ │  ─ Coupang Best (KR)       │
│   key      │ │   katmanı│ │  ─ Rakuten ranking (JP)    │
│   (anonim) │ │          │ │  ─ Mercari JP hot items    │
│            │ │          │ │ + SerpAPI Google Trends    │
│            │ │          │ │   (TR talep sınıflandırma) │
└─────┬──────┘ └─────┬────┘ └──────────────┬─────────────┘
      │              │                     │
      └──────────────┴─────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│  Firestore (cache + persistence)                             │
│  ─ users/{uid}/products/{id}                                 │
│  ─ users/{uid}/watchlist/{id}                                │
│  ─ users/{uid}/platforms/{id}    (encrypted credentials)     │
│  ─ cache/insights/items/{hash}    (30g TTL)                  │
│  ─ cache/trends/items/{catId}     (rolling 30 snapshot)      │
│  ─ cache/gapRadar/items/{hash}    (7g TTL, image URL'leri)   │
│  ─ cache/suppliers/items/{hash}   (7g TTL)                   │
│  ─ NOT: TR pazaryeri ürünü kalıcı saklanmaz                  │
│  ─ NOT: Gap Radar görselleri barındırılmaz, CDN URL referans │
└──────────────────────────────────────────────────────────────┘
```

## 3. Veri Mimarisi: Birleşik API Modeli (TR pazaryerleri)

### 3.1 Genel prensip

Sistem **4 TR pazaryerinde** çalışır: **Trendyol, Hepsiburada, Amazon TR, N11**.

Scraping ve otomatik tarama yerine **tüm veri erişimi resmi Satıcı API'leri** üzerinden sağlanır.

İki kaynak vardır:

1. **Platform sahibinin kendi API bilgileri** — sistemin birincil veri kaynağıdır. DropScout TR sahibinin kendi Trendyol/Hepsiburada/Amazon TR/N11 satıcı hesabı üzerinden alınan veri, tüm kullanıcılara baz veri olarak hizmet eder.
2. **Kayıtlı kullanıcıların API bilgileri** — kullanıcının kendi mağaza verisini görmek için kullanılır; ek olarak **anonim veri kaynağı** olarak rakip yoğunluk hesaplarında havuza dahil edilir.

### 3.2 Saklama politikası

- **Hiçbir TR pazaryerinin ürün verisi kalıcı saklanmaz.**
- Tüm veriler ilgili kullanıcının veya platform sahibinin API'sinden **anlık** alınır.
- Yalnızca AI içgörü cache'i (`cache/insights/items`, 30 gün TTL) ve trend snapshot rolling history'si (`cache/trends/items`, son 30 snapshot) Firestore'da tutulur.
- Bu model **Trendyol, Hepsiburada, Amazon TR ve N11** için geçerlidir.

### 3.3 Anonim veri rızası ve KVKK

- Kayıtlı kullanıcının API'sinden gelen verinin platform genelinde **anonim olarak** kullanılması için **her gün açık rıza** alınır.
- Kullanıcıya **devre dışı kalma (opt-out) seçeneği** sunulur; opt-out durumunda kullanıcının verisi yalnız kendisine gösterilir, anonim havuza katılmaz.
- **Lansmandan önce KVKK avukatına danışılacak** — rıza metni, anonimleştirme yöntemi, veri minimizasyonu, saklama süreleri ve Gap Radar görsel CDN proxy uygulaması hukuki incelemeden geçecek.

## 4. Trend Radar Modülü Veri Akışı (TR-içi)

Kullanıcı bir ürünü Trend Radar'da aradığında sistem aşağıdaki sırayla davranır:

1. **Önce platform sahibinin API verisi** sorgulanır (en hızlı, en güvenilir kaynak).
2. **Ardından aynı ürün için kayıtlı kullanıcılarının anonim API verisi** rakip yoğunluk hesaplarına girer (opt-in vermiş kullanıcılar).
3. Bu iki veri **yoksa veya yetersizse** → kullanıcıya şu uyarı verilir:
   > "Bu ürün için araştırma başlatıldı, tamamlandığında boyut bilgisi belirtilir."
4. Ürün **manuel yükleme kuyruğuna** düşer.
5. Yükleme işleminin API verisi çekilmeye başladığında kullanıcıya **"Analiz başladı"** maili gönderilir.
6. DropScore + rakip yoğunluk skoru hesaplandığında kullanıcıya **"Analiziniz tamamlandı"** maili gönderilir.

Bu akış **Trendyol, Hepsiburada, Amazon TR ve N11** için geçerlidir.

**Önemli:** Trend Radar **SerpAPI ve Apify kullanmaz**. TR pazaryeri verisi resmi API'lerden anonim havuza akar; bu havuz büyüdükçe rakip yoğunluk doğal olarak güçlenir.

## 5. Gap Radar Modülü Veri Akışı (Asya domestic kaynaklar)

Gap Radar'ın iş tanımı **TR'de henüz olmayan ürünleri keşfetmek**. TR'de bulunmayan ürün için TR pazaryeri verisi yetersizdir; bu modül **yurt dışı domestic platformlardan** beslenir.

### 5.1 Kaynak hiyerarşisi

**Tier 1 — Sosyal/viral öncelikli (ürünler buralarda doğar):**
- **Douyin (抖音)** — Çin'in TikTok'u, küresel TikTok'tan 6-12 ay önde
- **Xiaohongshu (小红书 / RedNote)** — Pinterest + Instagram + ürün incelemesi, lifestyle/güzellik viralinin başlangıcı

**Tier 2 — Marketplace velocity:**
- **Taobao/Tmall daily ranking** — Çin iç pazar
- **Coupang Best** — Güney Kore, K-beauty/K-fashion göstergesi
- **Rakuten ranking** — Japonya günlük/haftalık sıralama
- **Mercari JP hot items** — Japon C2C, niş viral göstergesi

**Tier 3 — Cross-check/doğrulama:**
- **TikTok creative center** (global) — Asya sinyalini doğrulamak için

**Niye AliExpress yok:** AliExpress batıya satış yapan ihracat platformu. Ürün buraya gelene kadar Çin'de zaten viralleşmiş, dalganın yarısı bitmiş olur. Domestic kaynaklar **4-7 ay erken sinyal** verir.

### 5.2 5 adımlı pipeline

```
Adım 1 — KEŞIF (Apify, Asya domestic platformlar)
  Tier 1+2 kaynakları × 15 kategori × günde 1
  Aktör başına 2 yedekli (biri çökünce diğeri devreye)
  Çıktı: 150-300 aday ürün/gün

Adım 2 — DİL ÇEVİRİSİ (Claude Haiku 4.5, anlık)
  Çince/Japonca/Korece ürün adı + 1 satır açıklama → Türkçe
  Hem orijinal hem çeviri Firestore'a yazılır (kullanıcı orijinali görebilir)
  ~100 token/ürün, ~$0.50-1/ay

Adım 3 — TR ARZ KONTROLÜ (Pazaryeri Satıcı API)
  Platform sahibi key'iyle Trendyol/HB/N11/Amazon TR keyword search
  Filtre değil — TR'de kaç sonuç var bilgisi sınıflandırma için kullanılır

Adım 4 — TR TALEP SINIFLANDIRMA (SerpAPI Google Trends)
  Adayın TR'de arama eğrisi (son 30g, yön)
  Çıktı: 4 kategori (aşağıda)

Adım 5 — SUNUM
  cache/gapRadar/items/{productHash} (7g TTL)
  Frontend: kategori sekmesi + kaynak attribution + thumbnail
```

### 5.3 2x2 sınıflandırma matrisi

|  | **TR pazaryerinde var** | **TR pazaryerinde yok** |
|---|---|---|
| **TR'de aranıyor** | ⚡ **ORTA GAP** — talep var ama rekabet de var | 🔥 **SAFE GAP** — talep var, arz yok, hemen satış |
| **TR'de aranmıyor** | 🪦 **Eleme** — ölü stok, kimse istemiyor | 💎 **EARLY GAP** — keşif fırsatı, ilk giren kazanır |

**Eleme kriteri tek kare:** Sol-alt (TR'de var + aranmıyor). Diğer üç kare üç farklı satıcı profiline öneri olarak gösterilir:

- 🔥 **SAFE GAP** → düşük risk, hızlı dönüş. Yeni başlayan satıcı için ideal.
- ⚡ **ORTA GAP** → talep doğrulanmış ama rekabet var; farklılaşma stratejisi gerekir.
- 💎 **EARLY GAP** → küresel viral skoru yüksek + TR'de henüz aranmıyor. **DropScout'un en değerli karesi** — TikTok'a yansımadan önce gir, dalganın başında ol. Tecrübeli satıcı için.

Frontend Gap Radar UI: 3 sekme (Safe / Orta / Early) ile kullanıcı risk iştahını seçer.

### 5.4 Çeviri katmanı (Claude Haiku)

Asya domestic kaynaklar dil bariyeri yaratır. Çözüm: Claude Haiku ürün adı + kısa açıklamayı Türkçe'ye çevirir, hem orijinal hem çeviri Firestore'a yazılır.

```javascript
{
  productName: { 
    original: "便携式无线护唇仪", 
    originalLang: "zh",
    tr: "Taşınabilir kablosuz dudak nemlendirici"
  },
  source: {
    platform: "xiaohongshu",
    metric: { posts: 8400, avgRating: 4.6 },
    detectedAt: "2026-04-22"
  }
}
```

Frontend Türkçe gösterir; "orijinali görüntüle" linki kaynağa gider.

**Maliyet:** 45 ürün/gün × 100 token × 30 gün ≈ 135K token/ay = **~$0.50-1/ay**. Prompt caching ile daha da düşer.

## 6. Görsel Politikası (Ayrıştırılmış)

Görsel kullanım politikası ekran tipine göre **iki farklı rejim** uygular. Mantıksal gerekçe: TR-içi ekranlardaki görsel kısıtı, TR satıcılarını birbirinden korumaya yöneliktir; Gap Radar yabancı kaynaklardan TR'de bulunmayan ürünleri gösterdiği için bu mantık geçerli değildir.

### 6.1 TR-içi ekranlar (Trend Radar, Rakip Analizi, Link Analizi)

- ✅ **Yalnız kullanıcının kendi API'sinden gelen ürün görselleri** kullanılır.
- ❌ **Rakip TR mağaza görselleri hiçbir platformda hiçbir ekranda gösterilmez.**
- ❌ **Rakip mağaza adları** A\*\*\*L formatında **sansürlü** olarak gösterilir.
- ❌ **Rakip mağaza reklamları** tüm platformlarda A\*\*\*L formatında sansürlü olarak gösterilir.

**Gerekçe:** TR satıcı ekosisteminde haksız rekabet ekosistemi yaratmamak + KVKK + telif/marka riski + etik dropshipping çizgisi.

### 6.2 Gap Radar yabancı kaynaklar (Douyin/Xiaohongshu/Coupang/Rakuten/Taobao/Mercari JP)

- ✅ Yabancı platform görselleri **gösterilebilir**.
- ✅ **Kaynak attribution zorunlu**: "Görsel: Douyin · @creatorname · 2026-04" formatında.
- ✅ Görseller **DropScout sunucusunda barındırılmaz** — direkt platform CDN URL'si referans olarak kullanılır (`<img src="...">`).
- ✅ **Maks 600×600 thumbnail**; yüksek çözünürlük linki kaynak platforma yönlendirilir.
- ✅ **Takedown akışı:** ToS'ta net süreç tanımlanır, hak sahibi şikayet ederse 24 saat içinde kaldırma taahhüdü.
- ❌ Görsel kendi içeriğimiz gibi (whitelabel) sunulmaz.
- ❌ Yaratıcının kimliği silinmez.

**Hukuki gerekçe:**
- FSEK madde 35-36: "Haber/eleştiri/inceleme amaçlı kullanım" istisnası — pazar araştırma aracı bu kapsamda
- SMK karşılaştırmalı kullanım istisnası — marka logosu görünse bile araştırma bağlamı korunur
- TR yargı yetkisi yabancı (Çin/JP/KR) yaratıcılar üzerinde pratik olarak sıfır
- Görsel hostlamadığımız için "kopyalama eylemi" yok, sadece referans (Google Image arama benzeri)
- Endüstri standardı: Helium 10, Jungle Scout, Pinterest, Spocket aynı yaklaşımı kullanıyor

**KVKK avukatı incelemesi:** Lansmandan önce CDN proxy modelinin TR yargısında "hostlama" mı "referans" mı sayılacağı, eşdeğer içtihat varsa hangi yönde, takedown ToS metninin hukuki gücü gibi konular avukata sorulacak.

## 7. Kaldırılan Özellikler (TR scraping)

**TR pazaryeri scraping özellikleri MVP kapsamından çıkarıldı:**
- Apify temelli TR marketplace listing scraping (Trendyol/Hepsiburada/N11/Amazon TR ürün listeleri)
- TR yönelik otomatik tarama tabanlı tüm cron'lar (`scheduledScrapeListings` vb.)
- TR pazaryeri Apify aktör çağrıları

**Bu özelliklerin işlevi:**
- Platform sahibinin kendi API bilgileri ile karşılanır (birincil)
- Kayıtlı kullanıcıların anonim API verileri ile zenginleştirilir (rakip yoğunluk)

**Kalan Apify kullanımı:** Yalnız Gap Radar (yurt dışı Asya domestic kaynaklar). Kapsam dar, hukuki çerçeve net (yabancı yargı yetkisi + araştırma istisnası), maliyet sabit.

**Gelecek senaryosu:** Pazaryerlerinin resmi **Partner API erişimleri** genişlerse (örn. Trendyol Partner API'si halka açılırsa), rakip yoğunluk skoru bu resmi kanala taşınabilir. O zamana kadar mevcut birleşik API modeli yeterlidir.

## 8. Bileşenler

### 8.1 Backend: Firebase Cloud Functions 2nd gen
- **Niye:** Vendor sıçraması yok, 2nd gen Cloud Run üstünde — uzun timeout, az cold start
- **Free tier:** 2M çağrı/ay, 400.000 GB-saniye
- **Dizin:** `functions/` — TypeScript, esbuild bundle

### 8.2 Frontend HTTP katmanı: `/src/js/api.js`
- Tüm dış istek bu modülden geçer
- `getIdToken()` → her istekte `Authorization: Bearer <token>`
- Hata yönetimi merkezi, retry + exponential backoff

### 8.3 Cache stratejisi (Firestore)

| Koleksiyon | TTL | Amaç |
|---|---|---|
| `cache/insights/items/{productHash}` | 30 gün | Claude AI içgörü cache (aynı ürün ikinci analizde ücretsiz) |
| `cache/trends/items/{categoryId}` | rolling 30 snapshot | Trend Radar kategori tazelik tier'ları |
| `cache/gapRadar/items/{productHash}` | 7 gün | Gap Radar Apify sonucu + SerpAPI sınıflandırma + çeviri |
| `cache/suppliers/items/{hash}` | 7 gün | Tedarikçi Bul (Apify) cache |

**Prensip:** TR pazaryeri ürün verisi **hiç saklanmaz**. AI yorum çıktısı, trend snapshot kümesi, Gap Radar adayları ve görsel CDN URL'leri (görselin kendisi değil) cache'lenir.

### 8.4 Veri kaynakları

#### Marketplace Seller API'leri (resmi, TR — birincil)
- **Trendyol Seller API** — supplier ID + API key, ücretsiz
- **Hepsiburada Marketplace API** — merchant ID + API key, ücretsiz
- **N11 API** — appKey + appSecret, ücretsiz (SOAP/XML)
- **Amazon SP-API** — geliştirici hesabı + LWA, 2-4 hafta onay
- **Veri akışı:** Kullanıcı bağladıktan sonra hem kendi mağaza verisini görür, hem (rıza varsa) anonim havuza katkı sağlar

#### Apify (Asya domestic — yalnız Gap Radar)
- **Plan:** Personal $49/ay (5.000 run kotası)
- **Kullanım:** 4 ana Asya kaynak × 15 kategori × günde 1 = 1.800 run/ay (%36 kullanım)
- **Yedekli aktör chain:** Her kaynak için 2 alternatif aktör tanımlı, biri çökünce diğeri otomatik devreye girer
- **Geo-IP:** Çin platformları için residential proxy (Apify dahili)
- **Sayfa:** `gap-radar.html` (yalnız İşletme planı erişimi)

#### SerpAPI (TR talep sınıflandırma — yalnız Gap Radar)
- **Plan:** Developer $50/ay (5.000 search kotası)
- **Kullanım:** Apify çıkışından gelen ~45 aday/gün × 30 = 1.350 çağrı/ay; 7g caching ile ~700 unique = %14 kullanım
- **Görev:** TR Google Trends arama eğrisi → 2x2 matriste sınıflandırma (Safe/Orta/Early/Eleme)
- **Trend Radar'da kullanılmaz** (TR pazaryeri için birleşik API modeli yeterli)

#### Claude Haiku 4.5 (AI içgörü + Gap Radar çevirisi)
- **Niye:** Türkçe kalitesi iyi, prompt caching ile maliyet düşük
- **Kullanımlar:**
  - `analyzeProduct` (DropScore reasoning, strateji, güçlü/zayıf yön) → 30g cache
  - `analyzeLegalCompliance` (yasal yorum) → planlanmış, henüz canlı değil
  - **Gap Radar çeviri katmanı** (Çince/JP/KR → TR ürün adı + açıklama)
- **Maliyet:** $10-30/ay AI içgörü + ~$1/ay çeviri = $11-31/ay
- **Model ID:** `claude-haiku-4-5-20251001`

### 8.5 Auth & güvenlik
- Tüm Function endpoint'leri Firebase ID token doğrular
- Secret Manager → API key'ler kod dışında (`CLAUDE_API_KEY`, `ENCRYPTION_KEY`, `APIFY_TOKEN`, `SERPAPI_KEY`, Asya aktör ID'leri)
- Rate limit: 60 req/dak/uid (in-memory token bucket)
- Marketplace API key'leri: AES-256-GCM encrypt'li (`ENCRYPTION_KEY` secret)
- KVKK uyumu: rıza günlük yenilenir, opt-out kalıcı, anonimleştirme veri çekme katmanında

### 8.6 Observability
- **Sentry** → frontend + backend hata izleme
- **Cloud Logging** → Functions logları (otomatik)
- **Slack/Discord webhook** → critical error alert (cron fail, Apify aktör çökmesi)

## 9. Cron job tablosu

| Job | Frekans | Amaç |
|---|---|---|
| `scheduledRefreshTrends` | Her 6 saat | TR Trend kategori snapshot rolling buffer (sahip API + anonim havuz) |
| `scheduledSyncActiveStores` | Her 4 saat | Bağlı satıcıların kendi mağaza verisini API'den taze çek |
| `scheduledRefreshGapRadar` | Günde 1 (03:00 TR) | Asya domestic Apify keşif → Marketplace filtre → SerpAPI sınıflandırma → çeviri |
| `scheduledCleanupCache` | Haftada 1 (Pzt 03:00) | TTL geçmiş cache (insights/gapRadar/suppliers) sil |
| `scheduledCleanupOldUsage` | Haftada 1 (Paz 04:00) | 90 günden eski `usageDaily` doc'larını sil |

**Not:** TR pazaryeri scraping cron'ları (`scheduledScrapeListings` vb.) **kaldırıldı**.

## 10. Maliyet özeti

### 10.1 Sabit gider (ay başı)

#### Sıfır Gap Radar abonesi ile (yalnız TR-içi modüller aktif)

| Bileşen | Aylık |
|---|---|
| Firebase Functions/Firestore/Hosting | $0-15 |
| Claude Haiku 4.5 (AI içgörü, cache'li) | $10-30 |
| Sentry | $0 |
| **Toplam** | **$10-45** |

Apify ve SerpAPI Gap Radar abonesi gelene kadar **kapatılabilir**.

#### Gap Radar aktif ile (en az 1 İşletme abonesi)

| Bileşen | Aylık |
|---|---|
| Yukarıdaki sabit | $10-45 |
| Apify Personal (Asya domestic) | $49 |
| SerpAPI Developer (TR talep sınıflandırma) | $50 |
| Claude çeviri katmanı | ~$1 |
| **Toplam** | **$110-145** |

### 10.2 Yeni fiyatlama (Başlangıç 149 ₺ / Profesyonel 349 ₺ / İşletme 499 ₺ +KDV)

**Plan başına marj analizi (worst-case, tüm kotalar dolu):**

| Plan | Aylık çağrı | Claude max | Fiyat | KDV'li | Net marj | Marj % |
|---|---|---|---|---|---|---|
| Başlangıç | 130 | ~15 ₺ | 149 ₺ | 178,80 ₺ | ~120 ₺ | ~80% |
| Profesyonel | 555 | ~64 ₺ | 349 ₺ | 418,80 ₺ | ~270 ₺ | ~77% |
| İşletme | 3.000-5.000+ | 350-575 ₺ | 499 ₺ | 598,80 ₺ | -75 ile +120 ₺ | -15% ile +24% |

**İşletme planı uyarısı:** "Sınırsız Yasal/Tedarikçi" kotalarıyla matematiksel risk taşıyor. Üç çözüm seçeneği:
1. Fiyatı 799 ₺'ye çek (1.499'dan %47 indirim hâlâ agresif)
2. 499 ₺'de tut, "sınırsız"ı kaldır → Yasal 300/ay + Tedarikçi 200/ay sert cap
3. 499 ₺ + aşım ücreti (300 yasal sonrası 1,5 ₺/ek kontrol)

### 10.3 Gap Radar break-even

```
Apify $49 + SerpAPI $50 + Claude çeviri $1 = $100/ay ≈ 3.300 ₺/ay
```

| İşletme abonesi | Gelir | Gap Radar maliyet | Kullanıcı başı | Marj % |
|---|---|---|---|---|
| 10 | 4.990 ₺ | 3.300 ₺ | 330 ₺ | ~%34 (riskli) |
| 15 | 7.485 ₺ | 3.300 ₺ | 220 ₺ | **break-even noktası** |
| 30 | 14.970 ₺ | 3.300 ₺ | 110 ₺ | %78 |
| 50+ | 24.950 ₺ | 3.300 ₺ | 66 ₺ | %87 |

**Strateji:** Lansmanda **erken kullanıcılara fiyat indirimi yerine sınırsız Gap Radar** bırak. Gerçek satın alma gerekçesi orada — 15 abone eşiğine erken ulaşmak için pazarlama mesajını "Asya domestic kaynak — 4-7 ay önde" pozisyonlamasına yasla.

### 10.4 ARPU + işletme break-even

Tipik dağılım (70% Start / 25% Pro / 5% İşletme):
```
Ortalama gelir/kullanıcı:   217 ₺
Ortalama değişken maliyet:  27 ₺
Ödeme işlemcisi (~%3,5):    8 ₺
Net marj/kullanıcı:         182 ₺

Sıfır Gap Radar fazda: 1.485 ₺ / 182 ₺ = ~9 ödeyen kullanıcı break-even
Gap Radar aktif fazda: 4.785 ₺ / 182 ₺ = ~26 ödeyen kullanıcı break-even (5'i İşletme olmalı)
```

100 ödeyen kullanıcıda aylık net ~14.000 ₺ (~$420/ay).

## 11. Bilinçli olarak YAPMADIKLARIMIZ

| Şey | Niye yok |
|---|---|
| TR pazaryeri scraping (Apify) | Birleşik API modeline geçildi — birincil veri platform sahibi + anonim kullanıcı API'lerinden |
| AliExpress / Amazon US Apify (Gap Radar) | Asya domestic kaynaklar 4-7 ay önde; AliExpress geç sinyal |
| TR pazaryerleri için otomatik web scraping | Hukuki risk + KVKK; resmi API'ler tercih |
| Vector DB (Pinecone, Weaviate) | RAG ihtiyacı yok |
| Ayrı backend host | Functions yeterli |
| Kubernetes / Docker compose | Aşırı mühendislik |
| Helium 10 / Keepa entegrasyonu | $200-500/ay, TR pazarı için karşılığı zayıf |
| OpenAI Enterprise | Claude Haiku TR'de daha iyi, daha ucuz |
| Datadog / New Relic | Sentry + Cloud Logging yeterli |
| Redis / CDN cache katmanı | Firestore cache yeterli |
| Microservice'lere bölme | 1 Function projesi yeterli |
| Gap Radar görsellerini sunucuya indirme | Direct CDN proxy hukuki olarak daha temiz |

## 12. Risk & azaltma

| Risk | Azaltma |
|---|---|
| Anonim havuz başta küçük, TR rakip yoğunluk verisi zayıf | Platform sahibinin kendi API'si baz katman; havuz büyüdükçe sinyal güçlenir |
| KVKK / rıza yönetimi hatası | Lansmandan önce avukat incelemesi; günlük rıza yenileme; opt-out kalıcı |
| Gap Radar görsel telif şikayeti | CDN proxy (kendi sunucumuzda host yok) + attribution + 24 saat takedown ToS |
| Çin/JP/KR Apify aktörü çökmesi | Her kaynak için 2 yedekli aktör chain; biri kırılırsa diğeri devreye |
| Çeviri yanlışlığı (CH/JP/KR → TR) | Hem orijinal hem çeviri tutulur; "orijinali görüntüle" linki kaynağa |
| Gap Radar break-even (15 İşletme abonesi) | Lansmanda agresif pazarlama "Asya domestic kaynak — 4-7 ay önde" |
| Marketplace API rate limit | Kullanıcı başına quota + retry/backoff; AI cache 30g |
| Claude API rate limit | Prompt caching + queue (Firestore-tabanlı job kuyruğu) |
| Marketplace API key sızması | Secret Manager + Firestore AES-256-GCM encrypt |
| Firestore okuma faturası şişer | Cache'ler doğru TTL ile, gereksiz `getDocs` kullanma |
| Cron job sessiz fail | Sentry + Slack webhook her cron sonu rapor |
| Manuel araştırma kuyruğu birikmesi | "Analiz başladı / tamamlandı" email akışı + 48 saat SLA hedefi |
| İşletme planı "sınırsız" abuse | 3 seçenekten biri seçilmeli (10.2 başlığı altında); öneri: hard cap + aşım ücreti |
