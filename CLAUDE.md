# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DropScout TR is an AI-powered product discovery and decision support platform for Turkish dropshipping. The UI is entirely in Turkish. It helps users evaluate products by scoring them (DropScore), tracking trends, analyzing competitors, checking legal compliance, and finding suppliers.

## Commands

```bash
npm run dev      # Start Vite dev server (opens dropscout.html)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

Deploy to Firebase Hosting (project: `dropscoutapp`):
```bash
npm run build && firebase deploy
```

## Architecture

**Multi-page app (MPA)** built with Vite. Each page is a standalone HTML file with its own inline `<style>` and `<script>` blocks. Vite bundles all pages listed in `vite.config.js` `rollupOptions.input`.

### Pages (all top-level HTML files)
- `index.html` — Landing page
- `login.html` — Firebase Auth login/register
- `onboarding.html` — First-run setup (platforms, profile, plan)
- `dropscout.html` — Main dashboard (Link Analizi)
- `profil.html` — User profile settings
- `trend-radar.html` — Trend analysis
- `gap-radar.html` — Market gap detection
- `net-kar.html` — Net profit calculator
- `rakip-analizi.html` — Competitor analysis
- `takip-listem.html` — Watchlist
- `yasal-kontrol.html` — Legal compliance checker
- `tedarikci-bul.html` — Supplier finder
- `raporlar.html` — Reports
- `trendyol.html` — Trendyol store API connection & commission/KDV data
- `hepsiburada.html` — Hepsiburada store API connection & commission/KDV data
- `amazon-tr.html` — Amazon TR SP-API connection & referral fee data
- `n11.html` — N11 store API connection & commission/KDV data

### Shared modules (`src/`)
- `src/js/main.js` — Entry point loaded by every authenticated page via `<script type="module">`. Runs `requireAuth()`, then inits theme, sidebar, and user-menu.
- `src/js/auth.js` — Firebase Auth wrappers (login/register/logout/resetPassword/requireAuth/onAuthChange).
- `src/js/firebase-config.js` — Firebase app init (auth + Firestore).
- `src/js/store.js` — Firestore data layer: user profiles, platform connections, products, watchlist.
- `src/js/theme.js` — Dark/light/system theme toggle. Persists to `localStorage` key `dropscout-theme-preference`.
- `src/js/sidebar.js` — Mobile-responsive sidebar open/close logic.
- `src/js/user-menu.js` — Topbar avatar button + dropdown. Renders synchronously from auth data, then enhances from Firestore profile.
- `src/css/` — Shared CSS: `variables.css`, `sidebar.css`, `theme-toggle.css`, `topbar.css`, `components.css`, `user-menu.css`, `responsive.css`, aggregated by `main.css`.

### Platform integration
Each platform page (`trendyol.html`, `hepsiburada.html`, `amazon-tr.html`, `n11.html`) follows the same pattern:
- API credentials form with platform-specific fields (Supplier ID, Merchant ID, SP-API tokens, etc.)
- Connection state persisted to `localStorage` key `dropscout-platform-{platform}` (mock; real state belongs in Firestore via `store.js`)
- Mock store data with category-based commission rates and KDV values
- Sync history log and KPI dashboard

### Product status values
`Serbest` (free to sell), `Belge Gerekli` (document required), `Yasak` (prohibited), `Belirsiz` (uncertain).

## Key Conventions

- No framework — vanilla JS with direct DOM manipulation.
- Page-specific styles and scripts are inline within each HTML file, not in external files.
- Shared functionality (theme, sidebar, CSS variables) lives in `src/` and is imported as ES modules.
- The app uses CSS custom properties (`--bg`, `--ink`, `--panel`, etc.) for theming; dark mode is applied via `[data-theme="dark"]` selectors.
- Font: Inter / Poppins / Geist Mono loaded from Google Fonts CDN.

---

## Backend Mimarisi

Backend planı ve teknik detaylar: **`docs/architecture.md`**.

Özet: Firebase Functions 2nd gen + Firestore cache + Cloud Scheduler cron + Apify (scraping) + SerpAPI (Google Trends) + Claude Haiku 4.5 (AI içgörü) + Marketplace Seller API'leri (resmi).

**Prensip:** Kullanıcı sayfa açtığında scraping/AI tetiklenmez. Cron job'lar arka planda Firestore cache'i tazeler; frontend cache'ten okur.

---

## Çalışma Günlüğü (Progress Log)

> Her oturum sonunda yapılan iş ve sıradaki adım buraya işlenir. Yeni oturum bu bölümü okuyarak nereden devam edeceğini bilir.

### 2026-04-21 — Sayfaları gerçek veriye bağlama (Faz 0)
**Tamamlandı:**
- `dropscout.html` → `saveProduct` ile Firestore'a yazıyor, `scoring.js` (`calculateDropScore`) entegre
- `net-kar.html` → `addToWatchlist` ile Firestore'a yazıyor, `scoring.js` (`calculateNetProfit`) entegre
- `takip-listem.html` → `getWatchlist` / `removeFromWatchlist` ile Firestore'dan okuyor, empty state + URL aç + kaldır butonu
- `raporlar.html` → `getUserProducts` + `getWatchlist`'ten 6 dinamik rapor (Kârlılık, Performans, Rekabet, Yasal, Platform, Trend) + gerçek CSV indirme (UTF-8 BOM)
- `rakip-analizi.html` → `getUserProducts`'tan kullanıcının ürünlerini birbirleriyle karşılaştırır; sahte mağaza adları kaldırıldı, gerçek metriklerle (DropScore, competitorCount, marginPct, salePrice) AI strateji içgörüsü dinamik üretilir
- `yasal-kontrol.html` → cosmetic (Pro Plan kartı kaldırıldı)
- `docs/architecture.md` → Backend mimari planı yazıldı (B seçeneği — plan-first yaklaşım)

**Sıradaki adım:** Hafta 1 başlangıcı — `functions/` dizini kurulumu (Firebase Functions 2nd gen TypeScript), auth middleware, Secret Manager, ilk endpoint `/api/health`, frontend `/src/js/api.js` HTTP wrapper. Detaylı liste: `docs/architecture.md` §5 Hafta 1.

**Geri bekleyen sayfalar (backend hazır olduğunda):** `trend-radar.html`, `gap-radar.html`, `tedarikci-bul.html`. Bu sayfalar Apify + SerpAPI + Claude API verileriyle çalışacak.

### 2026-04-21 (Hafta 1) — Backend iskelesi
**Tamamlandı:**
- `functions/` dizini kuruldu — TypeScript 5.7, Node 22 runtime, Firebase Functions v6 (2nd gen), Express + firebase-admin
  - `functions/package.json`, `tsconfig.json`, `.gitignore`
  - `functions/src/lib/firebase-admin.ts` — Admin SDK init (singleton)
  - `functions/src/middleware/auth.ts` — `verifyAuthToken` (Firebase ID token → req.uid)
  - `functions/src/endpoints/health.ts` — `healthHandler` (auth'lu ping)
  - `functions/src/index.ts` — Express app, `/api` router, `europe-west1` region, 256MiB / 30s
- `firebase.json` güncellendi — functions bloğu (codebase: default, runtime: nodejs22), hosting `/api/**` → `api` function rewrite, emulator config (auth/functions/firestore/hosting/ui portları)
- `firestore.rules` güncellendi — `cache/{document=**}` koleksiyonu eklendi (auth'lu read, write deny — yalnız Admin SDK)
- `vite.config.js` — dev proxy eklendi (`/api` → `127.0.0.1:5001/dropscoutapp/europe-west1/api`)
- `src/js/api.js` — frontend HTTP wrapper (Bearer token otomatik, exponential backoff retry, timeout, ApiError sınıfı, `getHealth()` ilk endpoint)
- `npm install` (functions/) ✓ — 259 paket; `npm run build` (functions/) ✓; root `npm run build` ✓
- `src/js/firebase-config.js` — localhost'ta Auth emulator (9099) ve Firestore emulator (8080) otomatik bağlanır
- **✅ Uçtan uca doğrulama yapıldı (2026-04-22):** Browser login → ID token → Vite proxy (/api) → Functions emulator (5001) → `verifyAuthToken` → `/api/health` → `{ ok:true, uid, email, region:'europe-west1' }` döndü

**Test akışı (kullanıcı için):**
1. `cd functions && npm run build`
2. Root'ta: `firebase emulators:start` (auth+functions+firestore+hosting)
3. Yeni terminal: `npm run dev` (Vite, /api proxy emulator'a)
4. Browser'da login olmuş kullanıcı: `import { getHealth } from '/src/js/api.js'; console.log(await getHealth())` → `{ ok: true, uid, email, serverTime, region }`

**Deploy hazırlığı:**
- `firebase deploy --only firestore:rules,functions,hosting`
- Functions ilk deploy'da Cloud Functions API + Cloud Run + Cloud Build otomatik enable olur
- Production URL'leri: `/api/health` → `https://dropscoutapp.web.app/api/health`

**Sıradaki adım:** Hafta 2 — AI içgörü katmanı. Detay: `docs/architecture.md` §5 Hafta 2.
- Secret Manager'a `CLAUDE_API_KEY` koy (`firebase functions:secrets:set CLAUDE_API_KEY`)
- Anthropic SDK kur (`@anthropic-ai/sdk`)
- `analyzeProduct(productData)` Function — Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), prompt caching, Firestore'a `cache/insights/{productHash}` (30g TTL)
- `dropscout.html` ve `rakip-analizi.html` strateji bölümleri bunu çağırır

**Bilinçli olarak ertelenenler (Hafta 1'de yapılmadı):**
- Sentry SDK kurulumu — DSN gerektiriyor, kullanıcı hesap açıp DSN sağlayınca ekleyeceğiz
- Secret Manager kurulumu — Hafta 2'de Claude API key ile birlikte yapılacak (boş Secret Manager kullanım dışı)

### 2026-04-22 — Hafta 2 ön hazırlık (duraklama noktası)
**Karar verilen:**
- AI içgörü modeli: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`). Gerekçe: yapılandırılmış girdi + şablonlu çıktı + yüksek hacim + UI'da senkron kullanım → hız ve maliyet kritik. Sonnet/Opus bu iş için israf.
- Karma model stratejisi ilerisi için planlandı: `analyzeProduct` → Haiku; ileride eklenecek `generateMonthlyReport` → Sonnet; `deepPortfolioAudit` (premium) → Opus. Başlangıçta hepsi Haiku.

**Kullanıcıdan bekleniyor (yeni oturumda doğrula):**
- Anthropic Console → API Key oluşturulması (key adı önerisi: `dropscout-prod`)
- Secret Manager'a yerleştirme: `firebase functions:secrets:set CLAUDE_API_KEY` (komut key'i interaktif sorar, log'lanmaz)
- Doğrulama: `firebase functions:secrets:access CLAUDE_API_KEY` (sadece var mı kontrolü)

**Sıradaki oturumda ilk adımlar:**
1. Secret Manager'da key'in varlığını sor/kontrol et
2. `cd functions && npm install @anthropic-ai/sdk`
3. `functions/src/lib/claude.ts` — Anthropic client singleton + sistem promptu (Türkçe, DropScout bağlamı)
4. `functions/src/endpoints/analyzeProduct.ts` — POST endpoint:
   - Input: `{ productId, url, platform, category, salePrice, cost, dropScore, marginPct, competitorCount, monthlySales, trend }`
   - Cache lookup: `cache/insights/{productHash}` (productHash = SHA256 of relevant fields, 30g TTL)
   - Cache miss → Claude Haiku 4.5 çağrısı (prompt caching sistem promptu için)
   - Output: `{ scoreReasoning, strengths[], weaknesses[], strategy, actions[] }`
   - Firestore'a yaz, dön
5. `functions/src/index.ts` router'a ekle: `router.post('/analyze-product', analyzeProductHandler)`
6. `src/js/api.js`'e `analyzeProduct(data)` kısayolu ekle
7. `dropscout.html` ve `rakip-analizi.html` — strateji panelleri bu endpoint'i çağırsın (yükleme spinner + hata fallback)
8. Token kullanımı log'a yaz, maliyet izleme için

**Referanslar:**
- Mimari: `docs/architecture.md` §3.4 (Claude Haiku 4.5 bölümü), §5 Hafta 2
- Model ID: `claude-haiku-4-5-20251001` (sabit — versiyonlamadan etkilenmesin diye full ID)

### 2026-04-22 (Hafta 2) — AI içgörü katmanı tamamlandı
**Tamamlandı:**
- `cd functions && npm install @anthropic-ai/sdk` ✓ (v0.90.x)
- `functions/src/lib/claude.ts` — `defineSecret('CLAUDE_API_KEY')` + Anthropic client singleton + Türkçe sistem promptu (DropScore eşikleri, marj/rakip/talep yorumlama kuralları, Türkiye pazarı bağlamı) + `provide_product_insight` tool şeması (strict JSON) + `generateProductInsight(input)` yardımcısı. `cache_control: { type: 'ephemeral' }` sistem promptuna uygulandı (Haiku 4.5 min cache eşiği 2048 token — şu an prompt altında, ileride büyüyünce etkinleşir).
- `functions/src/endpoints/analyzeProduct.ts` — POST `/api/analyze-product`:
  - Tip-güvenli input validasyonu (`platform` + `category` zorunlu, sayısallar `isFinite`)
  - `productHash` = SHA256 of `{ url, platform, category, salePrice, cost, dropScore, marginPct, competitorCount, monthlySales, trend }`
  - Firestore yolu: `cache/insights/items/{productHash}` (subcollection — mevcut `cache/{document=**}` kuralı ile uyumlu, 4 segment = document)
  - Cache hit → `{ insight, cached: true, productHash }` doğrudan döner
  - Cache miss → Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), `tool_choice: { type:'tool', name:'provide_product_insight' }` ile zorlamalı yapılandırılmış çıktı, Firestore'a `{ insight, input, usage, createdAt, expiresAt, uid }` yazar
  - Token kullanımı `console.log('[analyzeProduct] tokens', { uid, hash, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens })` olarak loglanır
  - TTL: 30 gün (`expiresAt` Timestamp; Firestore TTL policy ileride eklenebilir — şimdilik app-level kontrol)
- `functions/src/index.ts` — `router.post('/analyze-product', analyzeProductHandler)` + `onRequest({ secrets: [CLAUDE_API_KEY] }, app)` (secret binding)
- `src/js/api.js` — `analyzeProduct(data)` kısayolu (timeout 30s, auto Bearer token, ApiError normalizasyonu)
- `dropscout.html`:
  - AI Karar Brief'i kartı içine (`#aiInsightBlock`) scoreReasoning + güçlü/zayıf sütunları + strateji + aksiyon listesi
  - Yükleme spinner'ı + hata fallback + CACHE rozeti (cache hit olduğunda)
  - `renderAnalysis(a)` sonunda `loadAIInsight(a)` çağrısı (reqId ile race guard — kullanıcı hızlı art arda analiz yaparsa eski yanıt ezilmez)
- `rakip-analizi.html`:
  - `#strategyPanel` içine aynı AI içgörü bloğu
  - `renderDetail(me)` sonunda `loadAIInsight(me)` — ürün seçimi değişince yeniden tetiklenir, cache sayesinde çoğu seçim ücretsiz
  - "Bir ürün seç" fallback'ında AI blok gizlenir + reqId artırılır (yarış önleme)
- Build: `cd functions && npm run build` ✓; root `npm run build` ✓ (17 sayfa temiz, 1.17s)

**Secret Manager:**
- `CLAUDE_API_KEY` Firebase Secret Manager'da set edildi (kullanıcı `firebase functions:secrets:set CLAUDE_API_KEY` ile)
- Production'da: `firebase deploy --only functions` secret'i otomatik bağlar
- Emulator'da: `.secret.local` dosyası veya `firebase functions:secrets:access CLAUDE_API_KEY` ile env değişkeni geçirilebilir

**Test akışı (kullanıcı için):**
1. Emulator: `firebase emulators:start`
2. Frontend: `npm run dev`
3. Login → `dropscout.html` → link + fiyat + maliyet gir → "Analiz Et"
4. Sağdaki "AI Karar Brief'i" kartında ~3-8s sonra Claude içgörüsü belirir
5. Aynı girdilerle tekrar analiz → cache hit (ms mertebesi, "CACHE" rozeti)
6. `rakip-analizi.html` → kullanıcı ürünlerinden birini seç → strateji panelinin altında AI içgörü belirir
7. Functions logları: `firebase emulators:start` terminalinde `[analyzeProduct] tokens { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }` satırları

**Tasarım kararları:**
- Yapılandırılmış çıktı için `output_config.format` yerine tool-forcing kullanıldı — SDK v0.90'da daha yaygın desteklenen, şemaya zorunlu uyum sağlayan kalıp
- Streaming açık değil — Haiku 4.5 + max_tokens 1024 → tipik 3-8s, 30s function timeout bol; gerekirse `.stream().finalMessage()` geçişi tek satır
- `effort`/`thinking` kullanılmıyor — Haiku 4.5 bu parametreleri desteklemiyor (400 dönerdi)
- Cache path `cache/insights/items/{hash}` subcollection — ileride `cache/trends/items/{hash}`, `cache/suppliers/items/{hash}` gibi genişletilebilir, hepsi aynı güvenlik kuralıyla çalışır

**Bilinçli olarak ertelenenler:**
- Firestore TTL policy (`expiresAt` üzerinde otomatik silme) — şimdilik sadece okuma tarafında filtreleniyor; konsoldan TTL policy eklenecek
- Token maliyet toplam metriği (kullanıcı başına aylık harcama) — Hafta 3'te Firestore'da `usage/{uid}/{YYYY-MM}` agregasyonu planlanıyor
- Prompt caching aktivasyonu — sistem promptu şu anda ~1200 token, Haiku 4.5 min eşiği 2048; prompt büyüdükçe otomatik devreye girecek
- `analyzeProduct` için batch/queue — şu an eşzamanlı istekler ayrı Function instance'larında çalışır; gerekirse ileride rate-limit middleware

**Sıradaki adım:** Hafta 3 Faz A — Satıcı API entegrasyonu (ücretsiz). Detay aşağıda.

### 2026-04-22 (Hafta 3 Faz A) — Satıcı API entegrasyonu
**Yapılan karar:** Hafta 3'ün architecture.md'deki orijinal planına (Satıcı API entegrasyonu) geri dönüldü; scraping/trend (Apify+SerpAPI, aylık $99) en sona ertelendi. Sıralama: Faz A (ücretsiz, satıcı API) → Faz B (cron altyapısı) → Faz C (ödemeli: Apify+SerpAPI).

**Tamamlandı:**
- `functions/src/lib/crypto.ts` — AES-256-GCM JSON encrypt/decrypt (+`ENCRYPTION_KEY` secret)
- `functions/src/lib/platforms/` — adapter pattern:
  - `types.ts` — PlatformAdapter interface + PlatformId + 3 platform için credential/snapshot tipleri
  - `trendyol.ts` — **gerçek çalışan** Trendyol Seller API client (`apigw.trendyol.com/integration`, Basic Auth, `/product/sellers/{supplierId}/products` ürün sayfası; kategori ortalamasından komisyon/KDV türetir, ilk 100 ürünü örnekleyerek `PlatformStoreSnapshot` üretir)
  - `hepsiburada.ts`, `n11.ts` — stub (testConnection "henüz devrede değil" döner, kullanıcı hatayı UI'da görür)
  - `index.ts` — registry + `getAdapter(id)` + `isPlatformId(value)`
- `functions/src/endpoints/platforms.ts` — 4 endpoint:
  - `POST /api/platforms/connect` → validate → testConnection → fetchStore → `encryptJSON(credentials)` → Firestore `users/{uid}/platforms/{platform}` (connected, storeName, credentialsEncrypted, store snapshot, syncHistory[1], timestamps)
  - `POST /api/platforms/sync` → Firestore'dan doc çek → `decryptJSON` → `adapter.fetchStore` → store snapshot + syncHistory güncelle (max 10 girdi)
  - `GET /api/platforms/status?platform=...` → credentials hariç tüm veri; doc yoksa `{connected: false}`
  - `POST /api/platforms/disconnect` → doc.delete()
- `functions/src/index.ts` — 4 yeni route + `onRequest({ secrets: [CLAUDE_API_KEY, ENCRYPTION_KEY] }, app)` bind
- `src/js/api.js` — `connectPlatform`, `syncPlatform`, `getPlatformStatus`, `disconnectPlatform` kısayolları (30s timeout connect/sync için)
- `trendyol.html`, `hepsiburada.html`, `n11.html` — script blokları gerçek API'ya bağlandı:
  - Sayfa yüklenince `getPlatformStatus()`; bağlıysa store snapshot + syncHistory render
  - Connect → `connectPlatform(creds, storeName)`; başarı → state güncelle, hata → `formMsg` error
  - Disconnect → `disconnectPlatform()`; Firestore'dan siler
  - Sync → `syncPlatform()` backend'den yeni snapshot çeker; hata durumunda syncHistory'ye başarısız log girdisi ekler
  - Mock `mockStoreData` bloklarının tümü kaldırıldı; KPI'lar artık backend snapshot'ından üretilir
- Build: `cd functions && npm run build` ✓; root `npm run build` ✓ (17 sayfa, 1.15s)

**Güvenlik notu:**
- Platform credentials artık frontend'e asla dönmüyor. Firestore `users/{uid}/platforms/{id}` dokümanı yalnız `credentialsEncrypted: { ciphertext, iv, authTag }` (base64, AES-256-GCM) tutar. Çözme yalnızca Admin SDK + `ENCRYPTION_KEY` ile yapılır.
- `firestore.rules` değişmedi; frontend dokümanı `isOwner(uid)` kuralıyla okuyabiliyor ama `credentialsEncrypted` içeriği şifresiz anlaşılamaz.

**🚨 Deploy/test öncesi kullanıcı aksiyonu (zorunlu):**
1. Generate 32-byte hex key (PowerShell): `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })` — 64 hex karakter çıktı alınır.
2. Secret Manager'a koy: `firebase functions:secrets:set ENCRYPTION_KEY` (interaktif, yukarıdaki hex yapıştırılır).
3. Emulator için ek: `functions/.secret.local` dosyasına `ENCRYPTION_KEY=<hex>` (commit edilmez, `.gitignore`'da `.secret.local` zaten var).
4. Doğrulama: `firebase functions:secrets:access ENCRYPTION_KEY`.

⚠️ **Önemli:** Bu key bir kez üretilip sabit kalmalı. Rotate edilirse tüm şifreli credentials erişilemez olur — kullanıcılar yeniden bağlantı kurmak zorunda kalır.

**Test akışı (Trendyol gerçek veriyle):**
1. `cd functions && npm run build && firebase emulators:start`
2. Ayrı terminal: `npm run dev`
3. Login → `trendyol.html` → gerçek Supplier ID + API Key + Secret gir → "Bağlantıyı Test Et ve Kaydet"
4. Başarı: Mağaza kartı gerçek verilerle dolar (totalProducts, kategori komisyonları örneklenmiş ilk 100 üründen); syncHistory 1 girdi
5. "↻ Senkronize Et" → fresh snapshot, syncHistory 2 girdi
6. "Bağlantıyı Kes" → Firestore doc silinir, UI boşalır
7. Hepsiburada/N11 → henüz stub, connect denenince "henüz devrede değil" error mesajı görünür (UI bunu `formMsg`da gösterir)

**Bilinçli olarak ertelenenler (Faz B+C'ye):**
- Hepsiburada Merchant API gerçek client (Basic Auth + oauth token gerekiyor olabilir — dokümantasyona göre)
- N11 API gerçek client (SOAP/XML — ayrı SOAP client veya XML builder gerekli)
- Amazon SP-API (LWA + onay süreci 2-4 hafta — başvuruyla paralel ilerleyecek)
- `scheduledSyncActiveStores` cron (Faz B)
- Token kullanım toplam metriği (`usage/{uid}/{YYYY-MM}`) — Faz B
- `cleanup-cache` cron — Faz B

**Sıradaki oturumda (Faz B başlangıcı):**
- Cloud Scheduler cron skeleton: `functions/src/schedulers/` dizini
- `scheduledCleanupCache` — TTL geçmiş `cache/insights/items` belgelerini sil (haftalık)
- `scheduledSyncActiveStores` — her 4 saatte bir bağlı Trendyol mağazaları için `fetchStore` (rate-limit: max 50 store/tick)
- Her cron sonunda `console.log` ile Sentry-benzeri rapor

### 2026-04-23 (Hafta 3 Faz B) — Cloud Scheduler cron altyapısı
**Tamamlandı:**
- `functions/src/schedulers/` dizini kuruldu
  - `cleanupCache.ts` — `scheduledCleanupCache` (Pazartesi 03:00 Europe/Istanbul). `cache/insights/items` koleksiyonundan `expiresAt < now` belgeleri 400'lük `BulkWriter` partilerinde siler. Çalıştırma başına en fazla 25 parti (10.000 doc) güvenlik tavanı; aşılırsa `truncated:true` log'lanır. Region `europe-west1`, 256MiB / 300s, retry 1.
  - `syncActiveStores.ts` — `scheduledSyncActiveStores` (her 4 saat). `db.collectionGroup('platforms').where('connected','==',true).orderBy('lastSyncAt','asc').limit(50)` ile en eski senkronlardan başlar. Her doc için: `decryptJSON(credentials)` → `adapter.fetchStore(creds, storeName)` (`withTimeout` 25s wrapper) → `store + syncHistory + lastSyncAt + lastAutoSyncAt + lastAutoSyncStatus:'ok'` update. Hata durumunda `lastAutoSyncStatus:'error' + lastAutoSyncError` yazılır, döngü devam eder. Region `europe-west1`, 512MiB / 540s, ENCRYPTION_KEY secret bind, retry 0.
  - `index.ts` (schedulers barrel) — iki cron'u re-export eder
- `functions/src/index.ts` — `export { scheduledCleanupCache, scheduledSyncActiveStores } from './schedulers'` (HTTP `api`'nin yanında üst-seviye export, Functions otomatik discover eder)
- `firestore.indexes.json` oluşturuldu — `platforms` COLLECTION_GROUP composite index `connected ASC + lastSyncAt ASC` (sync cron'unun where+orderBy sorgusu için zorunlu)
- `firebase.json` — `firestore.indexes` alanı eklendi (`firestore.indexes.json`)
- Build: `cd functions && npm run build` ✓; root `npm run build` ✓ (17 sayfa, 1.16s)

**Tasarım kararları:**
- Sync cron `lastSyncAt asc` sıralı — round-robin garantisi: 50'den fazla bağlı store olsa bile her store en geç 4*ceil(N/50) saatte bir tazelenir, yeni bağlanan (eski `lastSyncAt`) öncelik alır
- `withTimeout` wrapper — Trendyol API yavaşladığında tek store cron'un 540s budget'ını yiyemesin diye 25s/store cap; 25 store * 25s = 625s teorik max ama gerçek p99 ~3s
- Hepsiburada/N11 stub adapter'ları `testConnection`'da hata döndüğünden kullanıcı zaten `connected:true` olarak Firestore'a yazamıyor; cron sadece Trendyol doc'larını görür. Yine de `isPlatformId` guard'ı bozuk doc'lara karşı koruma sağlıyor.
- BulkWriter (cleanup) batch yerine — atomic değil ama 500 doc/batch sınırı yok, throughput daha yüksek
- Cron'lar `onSchedule` v2 — Cloud Scheduler job'ları ilk deploy'da otomatik provisioning (Pub/Sub topic gizli, Functions runtime tetiklenir)

**Deploy / aktivasyon:**
1. `firebase deploy --only firestore:indexes,functions` — index inşası birkaç dakika sürebilir, sırasında syncActiveStores hata fırlatır (`FAILED_PRECONDITION: needs index`); konsolda "Building" → "Enabled" geçince düzelir
2. Cron'lar deploy sonrası Cloud Scheduler'da görünür: `gcloud scheduler jobs list --location=europe-west1` veya GCP Console → Cloud Scheduler
3. Manuel test: `gcloud scheduler jobs run firebase-schedule-scheduledCleanupCache-europe-west1 --location=europe-west1`
4. Logs: `firebase functions:log --only scheduledCleanupCache,scheduledSyncActiveStores`

**Emulator notları:**
- Functions emulator scheduler trigger'ları otomatik tetiklemez. Manuel tetikleme: Emulator UI → Functions sekmesi → ilgili cron'a tıkla → "Run" düğmesi
- Veya programatik: `curl http://127.0.0.1:5001/dropscoutapp/europe-west1/scheduledCleanupCache`
- Emulator'da `ENCRYPTION_KEY` `.secret.local`'dan okunur (zaten Faz A'da kuruldu)

**Bilinçli olarak ertelenenler:**
- Gerçek Sentry entegrasyonu — şu an `console.log/warn` yeterli; kullanıcı Sentry DSN sağladığında `lib/sentry.ts` + `Sentry.captureException(failures)`
- Hepsiburada / N11 / Amazon-TR gerçek API client'ları — Faz C'de
- Token kullanımı agregasyonu (`usage/{uid}/{YYYY-MM}`) — `analyzeProduct` log satırlarından üretilecek; ileride ayrı cron ya da inline write
- Slack/email alert (cron failure rate > X) — Faz C+

**Sıradaki adım:** Faz C — ödemeli scraping/trend katmanı (Apify aktör + SerpAPI). Detay: `docs/architecture.md` §3.1, §3.2, §5 Hafta 3 (Apify+SerpAPI bölümü). Frontend tarafında bekleyen sayfalar: `trend-radar.html`, `gap-radar.html`, `tedarikci-bul.html`. İlk adım: kullanıcı Apify + SerpAPI hesap açıp API key'leri Secret Manager'a koyacak (`APIFY_TOKEN`, `SERPAPI_KEY`).

### 2026-04-23 (Hafta 4) — Plan/quota katmanı + Apify/SerpAPI dışı tüm kalemler
**Onaylanan ürün kararları:**
- 3 abonelik planı: **Start (299 ₺) / Pro (699 ₺) / Business (1.499 ₺)**, USD endeksli (~$7.5/$17.5/$37.5), yıllıkta %20 indirim
- Kotalar (gun/ay):
  - Link Analizi (manuel URL): Start 1/30, Pro 5/150, Business 20/600
  - Mağaza ürünü AI analizi: Start 3/90 sert, Pro 300/ay (60/gün soft cap), Business 50/sınırsız
  - Yasal Kontrol: Start 10/ay, Pro 75/ay, Business sınırsız
  - Tedarikçi Bul: Start 0, Pro 30/ay, Business sınırsız
- Mağaza limit: Start 1, Pro 3, Business sınırsız
- Trend Radar tier: Start 3 günde 1, Pro günlük, Business **6 saatte 1** (kullanıcının "saatlik" önerisi maliyet analizi sonrası 6h'a çekildi: $275 → $75 SerpAPI farkı)
- Gap Radar yalnız **Business** plana özel
- 7 gün ücretsiz **Pro deneme** (kart bilgisi yok, otomatik bootstrap)
- Sıfırlama: günlük 00:00 Europe/Istanbul, aylık ayın 1'i 00:00 (lazy, tarih-anahtarı tabanlı, cron yok)
- Ödeme provider'ı: **iyzico %4,5 yüksek bulundu** → kullanıcı yerel firmayla pazarlık ediyor; payment integration (Task #13) ertelendi, pricing.html "Erken Erişim — İletişim" mailto CTA ile yayında

**Tamamlandı (kod):**
- `firestore.rules` refactor — `users/{uid}` doc'una plan alanları (`plan`, `planStatus`, `planExpiresAt`, `trialEndsAt`, `trialPlan`, `billingCycle`, `paymentCustomerId`, `paymentSubscriptionId`) backend-write-only; `usageDaily`/`usageMonthly` subcollection client read-only; `platforms`/`products`/`watchlist` enumerated owner read+write. `store.js#createUserProfile` plan alanı kaldırıldı.
- `functions/src/lib/plans.ts` — Tek kaynak plan tanımı (PLANS, PlanId, MeterId, QuotaLimit, TrendTier, PlanDefinition); `planAtLeast`, `isPlanId`, `isMeterId`, `todayKey`, `monthKey` (Europe/Istanbul TZ).
- `functions/src/middleware/plan.ts` — `getUserPlan(uid)` (bootstrap: ilk istekte `start` + 7 gün Pro trial), `requirePlan(minPlan)` Express middleware factory, `consumeQuota(uid, meter, plan)` transaction-safe (atomik daily+monthly increment), `refundQuota` (Claude hatası geri iade), `getQuotaStatus` (UI için tüketmeden okuma).
- `functions/src/middleware/rateLimit.ts` — In-memory token bucket, 60 req/dak/uid, MAX_BUCKETS 5K + idle prune; `Retry-After` header döner.
- `functions/src/endpoints/analyzeProduct.ts` — `source` alanı eklendi (`manual_url`|`store_product`, productId yoksa otomatik infer); cache hit kotayı tüketmez; cache miss önce `consumeQuota`, Claude başarısız → `refundQuota`. Token usage `users/{uid}/usageMonthly/{YYYY-MM}.tokens.{input,output,cacheRead,cacheCreation,calls}` increment.
- `functions/src/endpoints/platforms.ts` — `connectPlatform` öncesi `maxPlatforms` kontrolü (mevcut platform tekrar bağlanırsa sayılmaz), 403 `platform_limit_reached` döner.
- `functions/src/endpoints/me.ts` — `GET /api/me/plan` (plan + features + quota status), `GET /api/me/usage?months=N` (son N ayın token + USD maliyeti).
- `functions/src/endpoints/trends.ts` — `GET /api/trends?category=X` (tier-aware snapshot seçer: business→en taze, pro→24h, start→72h); query'siz tüm kategoriler özet.
- `functions/src/lib/pricing.ts` — Claude Haiku 4.5 fiyat tablosu + `calcClaudeCostUsd(usage)`.
- `functions/src/lib/trends.ts` — TR top 15 kategori sabit listesi, `fetchTrendForCategory(cat)` (placeholder; SerpAPI key gelince fetcher fn değişir, kalanı aynı), `selectForTier(history, tier)` (rolling 30-snapshot history'den tier-uygun seçim).
- `functions/src/schedulers/refreshTrends.ts` — `scheduledRefreshTrends` her 6 saatte 1, 15 kategori için fresh snapshot çek + `cache/trends/items/{categoryId}.history[]` rolling buffer (max 30 entry); region europe-west1, 512MiB/540s.
- `functions/src/schedulers/cleanupOldUsage.ts` — `scheduledCleanupOldUsage` Pazar 04:00 TR; `collectionGroup('usageDaily').where('date','<',cutoff)` ile 90 günden eski daily counter doc'ları siler, BulkWriter 400'lük partiler (max 50 batch). Aylık doc'lara dokunmaz (analytics).
- `functions/src/lib/platforms/hepsiburada.ts` — Stub yerine **gerçek client**: Basic Auth, `https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}`, kategori bazlı komisyon/KDV türetimi, ilk 100 ürün örneği. Trendyol pattern'iyle simetrik.
- `functions/src/lib/platforms/n11.ts` — Stub yerine **gerçek SOAP client**: `xml2js` ile parsing, `https://api.n11.com/ws/ProductService.wsdl`, `GetProductListRequest` SOAP envelope, kategori/fiyat/stok extraction, hata yönetimi (`status: 'failure'` → kullanıcıya hata mesajı). Yeni dep: `xml2js`, `@types/xml2js`.
- `firestore.indexes.json` — `usageDaily.date` field için single-field collectionGroup index (cleanup cron'unun where filter'ı için).
- `vite.config.js` — `pricing` input eklendi.
- `pricing.html` — Yeni sayfa: hero + aylık/yıllık toggle + 3 plan kartı (Start/Pro/Business, Pro "EN POPÜLER", current plan "AKTİF PLAN" badge) + detaylı karşılaştırma tablosu + 6 maddelik FAQ. Mailto CTA (`onrhmrc1913@gmail.com`) — payment provider belirlenince butonlar otomatik checkout'a döner.
- `src/js/api.js` — `getMyPlan()`, `getMyUsage(months)`, `getTrends(category?)` helper'ları.
- `src/js/plan.js` — Frontend plan modülü: `getPlan({force})` 5dk sessionStorage cache, `invalidatePlan()`, `planAtLeast`, `getQuota`, `canConsume`, `gateFeature(selector,minPlan,{mode:'hide'|'disable'})` (disable → opak + "Pro'ya yükselt" badge), `ensureQuota(meter)` (UI ön-kontrol), `showUpgradeToast(message)` (sağ-alt köşede plan CTA'lı toast), `handleApiError(err)` (403 plan_required / 403 platform_limit_reached / 429 quota_exceeded yakalama).
- `dropscout.html` (link analizi) — `analyzeProduct` çağrı öncesi `ensureQuota('linkAnalysis')`, hata yakalamada `handleApiError`, `source: 'manual_url'` payload eklendi.
- `rakip-analizi.html` — Aynı şekilde `ensureQuota('storeProductAnalysis')` + `source: 'store_product'`.
- `trendyol.html`/`hepsiburada.html`/`n11.html` — `errorMessage` helper'ı `handleApiError`'ı önce dener (plan/quota hatası → toast); 403 `platform_limit_reached` UI'da görünür.
- `gap-radar.html` — Sayfa açılır açılmaz `gateFeature('main.main', 'business', {mode:'disable'})` → Business olmayan kullanıcılar opak overlay + pricing CTA görür.

**Yeni endpoint'ler (özet):**
- `GET /api/me/plan` — plan + features + quotas + trial bilgisi
- `GET /api/me/usage?months=N` — token + USD maliyet özeti
- `GET /api/trends[?category=X]` — tier-aware trend snapshot

**Yeni cron'lar (özet):**
- `scheduledRefreshTrends` — her 6 saat (placeholder fetcher, SerpAPI key gelince swap)
- `scheduledCleanupOldUsage` — Pazar 04:00 TR (90g+ daily docs sil)

**Bilinçli olarak ertelenenler / sıradaki:**
- **iyzico/PayTR/Param entegrasyonu (Task #13)** — kullanıcı yerel firma ile %4,5'tan daha iyi oran müzakere ediyor. Provider seçilince 2-3 saatlik iş: `functions/src/endpoints/payment.ts` (checkout init + webhook handler) + Firestore `users/{uid}` plan/expire field'ları admin SDK ile yaz + `pricing.html` mailto CTA → checkout URL.
- Apify + SerpAPI gerçek client (Faz C) — kullanıcı hesap açıp `APIFY_TOKEN`, `SERPAPI_KEY` Secret Manager'a koyduğunda. `lib/trends.ts#fetchTrendForCategory` içindeki placeholder `fetchSerpApiTrend(query, key)` ile değişecek.
- Profil sayfasında "bu ay X analiz, $Y maliyet" widget — `getMyUsage()` helper'ı hazır, `profil.html`'a entegre etmek 30 dk iş.
- Sentry SDK — DSN gelince `lib/sentry.ts` + cron `failures` listesi capture.
- Slack/Discord webhook — cron failure rate > 0 ise alert.
- Firestore TTL policy — GCP konsolundan `cache/insights/items.expiresAt` üzerine aktif et (cleanup cron'a tamamlayıcı).

**Deploy notları:**
- `firebase deploy --only firestore:indexes,firestore:rules,functions,hosting`
- Yeni index inşası birkaç dakika sürer (cleanup cron `FAILED_PRECONDITION` döner, sonra düzelir)
- `functions/.secret.local` veya `firebase functions:secrets:access` ile emulator'da CLAUDE_API_KEY + ENCRYPTION_KEY okunur (yeni secret eklenmedi)

### 2026-04-?? — Faz C + gözlem altyapısı (log'a kaydı yapılmamış oturum)
> Bu girdi 2026-04-25'te kod incelemesinden geriye dönük yazıldı. Aşağıdaki işler önceki oturumda tamamlanmış ama günlüğe işlenmemişti.

**Tamamlanmış (kod):**
- `functions/src/lib/apify.ts` — Apify token + Gap/Supplier actor secret tanımları
- `functions/src/lib/serpapi.ts` — SerpAPI Google Trends client (`hasSerpApiKey`, `fetchGoogleTrendSeries`); key yoksa `lib/trends.ts` placeholder seriye düşer
- `functions/src/lib/sentry.ts` — `SENTRY_DSN` secret + `initSentry`, `captureError`, `sentryErrorHandler` Express middleware
- `functions/src/lib/alerts.ts` — `ALERT_WEBHOOK_URL` secret (Slack/Discord webhook gönderici)
- `functions/src/endpoints/gapRadar.ts` — `GET /api/gap-radar` (Business gate, Apify aktör + cache)
- `functions/src/endpoints/suppliers.ts` — `POST /api/suppliers` (Pro+ gate, Apify supplier actor + 7g cache)
- `functions/src/endpoints/payment.ts` — `createCheckoutHandler`, `paymentWebhookHandler` (router'a henüz BAĞLANMADI — provider seçilince mount edilecek)
- `functions/src/lib/payments/{types,index,mock,iyzico}.ts` — adapter pattern, registry; iyzico stub (TODO yorumları), mock dev için
- `functions/src/index.ts` — Sentry init + tüm secret bind'leri (`CLAUDE_API_KEY`, `ENCRYPTION_KEY`, `SENTRY_DSN`, `ALERT_WEBHOOK_URL`, `SERPAPI_KEY`, `APIFY_TOKEN`, `APIFY_GAP_ACTOR_ID`, `APIFY_SUPPLIER_ACTOR_ID`)
- Frontend: `gap-radar.html` → `getGapRadar()`, `tedarikci-bul.html` → `searchSuppliers()`, `src/js/sentry.js` (frontend wrapper)

**Açık kalan / kayıt notu:**
- `payment.ts` route'ları `index.ts`'te import edilmiş gibi görünmüyor — provider belirsizliği nedeniyle kasıtlı bekletilmiş. Local provider seçilince mount: `app.post('/api/payment/webhook', paymentWebhookHandler)` (auth bypass için router öncesi) + `router.post('/payment/checkout', createCheckoutHandler)`.
- `pricing.html` hâlâ mailto CTA — provider belli olunca `createCheckout()` API helper + checkoutUrl redirect.
- `trend-radar.html` mock data — bu girdi yazıldığı sırada hâlâ ürün-bazlı sahte akış. Bir sonraki oturumda `getTrends()` entegrasyonu yapılacak.

### 2026-04-25 — Trend Radar frontend bağlantısı
**Tamamlandı:**
- `trend-radar.html` baştan yazıldı — eski mock-product akışı (12 sahte ürün, sentetik signal'lar) tamamen kaldırıldı; kategori-bazlı snapshot UI kuruldu
- Sayfa açılışta `getTrends()` çağrılır, `data.items[]` (TRACKED_CATEGORIES, 15 kategori) kategori kartı listesine render edilir
- Sol sütun: Tümü/Yükselen/Sabit/Düşen filtre chip'leri + her kart için mini sparkline SVG (renk trend yönüne göre yeşil/kırmızı/gri), pill'li trend etiketi, 7g ortalama, snapshot yaşı (örn "3 sa önce"), `serpapi`/`placeholder`/yok için `CANLI`/`TEST`/`VERİ YOK` rozeti
- Sağ sütun: seçilen kategori detayı — başlık + trend pill + kaynak rozeti, 30g line chart (yatay grid, gradient area dolgu, son nokta dot, min/max etiketleri), KV metrikleri (7g ort, 30g ort, %değişim, kaynak, snapshot zamanı), plan tier banner'ı (Pro/Start için "daha taze veri için yükselt" CTA)
- Stat-bar: izlenen kategori sayısı, yükselen, düşen, ortalama 7g ilgi, plan tier (`every6h` → `6 SAATTE 1`, `daily` → `GÜNDE 1`, `every3days` → `3 GÜNDE 1`)
- Aksiyon linkleri kategori bağlamını taşır: `./gap-radar.html?category=<id>`, `./tedarikci-bul.html?q=<categoryName>` (alıcı sayfalar query'yi şu an okumuyor; isterlerse readURL ile alabilirler)
- Sidebar plan-card dinamik (`getPlan()` ile) — eski hardcoded "Pro Plan" rozeti kaldırıldı
- İskelet (skeleton-row) yükleme animasyonu, 401/403/429 için `handleApiError`, network/500 için error banner + "tekrar dene" butonu
- Yenile butonu `invalidatePlan()` + tekrar `load()` (5dk sessionStorage cache by-pass)
- Build: `npm run build` ✓ (17 sayfa, trend-radar.html 23.43 kB / trendRadar.js 13.46 kB, 1.81s)

**Test akışı:**
1. Emulator: `firebase emulators:start` (Functions + Firestore)
2. Frontend: `npm run dev`
3. Login → `trend-radar.html`
4. Sayfa açılır, 15 kategori için kart listesi belirir. Cron henüz çalışmadıysa hepsi `VERİ YOK` rozeti — bu durumda manuel cron tetiklemesi: Emulator UI → Functions → `scheduledRefreshTrends` → Run
5. Plan'a göre snapshot tazelik farkı: Business kullanıcı en yeni, Pro 24sa öncesi, Start 3g öncesi (`selectForTier` mantığı)
6. Kategori kartına tıkla → sağ panelde 30g chart + metrikler güncellenir
7. Yükselen/Düşen filtreleri changePct ±%8 eşiğine göre

**Bilinçli olarak yapılmadı:**
- `trend-radar.html` içinden manuel "şimdi tara" tetiklemesi — premium iş, cron zaten 6 saatte 1 dolduruyor
- Rakip hacmi / fiyat skoru gibi alanlar — eski mock UI bu metrikleri gösteriyordu ama backend snapshot'ında yok. Bunlar Gap Radar / Link Analizi sayfalarında zaten karşılığını buluyor
- `?category=` query'sinin gap-radar.html'de okunması — küçük UX iyileştirme, ayrı oturumda yapılır

**Sıradaki adım:** Üçü arasından kullanıcı seçecek:
1. Profil sayfasına usage widget (`getMyUsage()` ile bu ay token + USD maliyet) — 30 dk iş
2. CLAUDE.md log'unda "ertelenen" iyzico/PayTR/Param entegrasyonu — provider seçildikten sonra (Task #13)
3. Firestore TTL policy aktivasyonu — GCP konsolundan `cache/insights/items.expiresAt` üzerine; cleanup cron'a tamamlayıcı

**Açık not:** `payment.ts` (createCheckoutHandler, paymentWebhookHandler) hâlâ `index.ts` router'ına bağlı değil. Provider seçilince webhook route'u **router öncesi** mount edilmeli (auth bypass): `app.post('/api/payment/webhook', express.raw({type:'*/*'}), paymentWebhookHandler)` + `router.post('/payment/checkout', createCheckoutHandler)`. Ayrıca `pricing.html` mailto CTA → `createCheckout(plan, cycle)` + `window.location.href = checkoutUrl`.

### 2026-04-25 (devam) — Trend Radar pasif/popüler ürün keşfi
**Karar:** Trend Radar'ın domain'i netleştirildi. Eski "ürün listeli mock UI" yerine kategori-bazlı snapshot artık 4 farklı ürün listesiyle birlikte çalışıyor. Gap Radar ile çakışma kaldırıldı:
- **Trend Radar (her plan):** TR-internal — pazaryeri ürün keşfi (favori/satış/yorum sinyalleri)
- **Gap Radar (Business):** TR-external — dünya viral + TR'de yok

**Yeni Trend Radar kapsamı:** 4 pazaryeri (Trendyol, Hepsiburada, N11, Amazon TR) × 15 kategori × 4 farklı sıralama:
- **Fırsat (default)** — pasif ürünler, `gapScore = (favorite + question*5) / max(1, sold)` desc
- **En Çok Satan** — soldCount desc
- **En Çok Beğenilen** — favoriteCount desc
- **En Çok Yorum** — reviewCount desc

**Tamamlandı:**
- `functions/src/lib/apify.ts` — 4 yeni secret eklendi: `APIFY_TRENDYOL_ACTOR_ID`, `APIFY_HEPSIBURADA_ACTOR_ID`, `APIFY_N11_ACTOR_ID`, `APIFY_AMAZON_TR_ACTOR_ID`
- `functions/src/lib/marketplaceProducts.ts` (yeni 200+ satır) — `MarketplaceId` enum, `MARKETPLACES` registry, `TrendingProduct` tipi (id/platform/name/image/price/url/favoriteCount/questionCount/reviewCount/rating/soldCount/gapScore/source), `calcGapScore` fn, `fetchMarketplaceProducts(platform, category)` adapter (Apify token+actor varsa gerçek scrape, yoksa deterministic placeholder), `normalizeApifyItem` esnek mapping (10+ field name variation), `generatePlaceholder` (15 kategori için kategori-spesifik 6 ürün adı listesi, deterministic seed), `buildCategoryLists` (top-12 her sıralama için)
- `functions/src/lib/trends.ts` — `TrendSnapshot.products?: CategoryProductLists` + `productCount?` eklendi; `fetchTrendForCategory` artık `Promise.allSettled` ile 4 platform paralel çağırıp listeleri `buildCategoryLists` ile derliyor; SerpAPI bölümü ile bağımsız (biri fail olsa diğeri çalışır)
- `functions/src/schedulers/refreshTrends.ts` — 5 yeni secret bind (APIFY_TOKEN + 4 actor ID), `PER_CATEGORY_TIMEOUT_MS` 20s → 60s (Apify run-sync için)
- `functions/src/endpoints/trends.ts` — single-category response'a `products: tierSnapshot?.products ?? null` eklendi
- `functions/src/index.ts` — 4 yeni secret import + `api` function bind
- Build: `cd functions && npm run build` ✓ (1 TS error fix: `raw.images?.[0]` → explicit `imagesArr[0]` cast); root `npm run build` ✓ (17 sayfa, trend-radar.html 28+ kB, trendRadar.js 13.46 → 18.19 kB, 1.85s)

**Frontend (`trend-radar.html`):**
- Yeni section: kategori kartlarının altında **ürün grid bölümü** (full-width, content section'ın altında)
- 4 view chip'i (eski filter-chip pattern'iyle): **Fırsat** (default), En Çok Satan, En Çok Beğenilen, En Çok Yorum
- Ürün kartı (auto-fill grid 240px min): görsel (img varsa, yoksa baş harf placeholder), platform pill (sol-alt), sıra rozeti (#1, #2…), ad (2 satır clamp), fiyat TRY, 2 metrik chip (primary view-spesifik renkli + secondary), 3 aksiyon butonu:
  - 🔗 **Analiz** → `dropscout.html?url=&platform=&category=`
  - 💰 **Net Kâr** → `net-kar.html?name=&price=&platform=`
  - 🏭 **Tedarikçi** → `tedarikci-bul.html?q=`
- Empty state: "Önce kategori seç" / "Henüz ürün toplanmadı (Apify bekliyor)"
- Kategori seçimi `renderProducts()`'ı tetikler, view değişimi anında günceller
- Mobil responsive: <900px tek kolon, ürün-actions tek kolon

**Plan ayrımı netleşti:**
- Start: Trend Radar (pasif ürün keşfi + kategori trendi) görür, Gap Radar yok
- Pro: + Tedarikçi Bul kotası, daha taze trend snapshot (24h)
- Business: + Gap Radar (uluslararası viral), Trend Radar 6h taze

**Bilinçli olarak yapılmadı:**
- N11 + Amazon TR gerçek Apify scraper'ı — secret tanımı + adapter slot var, ama TR pazarında öncelik Trendyol+HB; aktör seçimi ileride
- Apify maliyet kontrolü — 4 marketplace × 15 kategori × 4 cron tick/gün = 240 run/gün hesabı, $49 paket sınırda; gerek olursa $99 Starter veya cron sıklığı tier'a göre düşürülür

**Açık not — şu an placeholder modunda:**
- 4 actor ID secret'i `pending` olarak deploy edildi → `getActorIdFor` `null` döner → kod `generatePlaceholder` ile deterministic 6 ürün/kategori/platform üretir (toplam 15 × 4 × 6 = 360 mock ürün)
- Frontend test edilebilir; Apify hesabı + actor seçimi yapılınca `firebase functions:secrets:set APIFY_TRENDYOL_ACTOR_ID` (vs.) + `firebase deploy --only functions:scheduledRefreshTrends` ile rotate
- Cron sonraki tick'inde gerçek scrape çalışır, `source: 'apify'` döner

**Deploy/test akışı:**
1. `firebase deploy --only functions,hosting` — 4 yeni secret interaktif sorulur, hepsine `pending` (veya gerçek varsa actor ID) gir
2. Manuel cron tetikleme: `gcloud scheduler jobs run firebase-schedule-scheduledRefreshTrends-europe-west1 --location=europe-west1` (kullanıcı buraya henüz erişemiyor, gcloud CLI kurulumu/auth gerekir → 6h tickin doğal tetiklenmesi de geçerli)
3. ~60-90s sonra `cache/trends/items/{categoryId}.current.products` Firestore'a yazılır
4. `trend-radar.html` aç → kategori seç → altında 12 ürün belirir; view chip'leriyle sıralama değişir

**Sıradaki adım:** Kullanıcı seçecek (önceki listedeki seçenekler hâlâ açık):
1. Profil sayfasına usage widget (`getMyUsage()`) — 30 dk
2. iyzico/PayTR/Param entegrasyonu (Task #13) — provider seçilince
3. Firestore TTL policy aktivasyonu
4. Apify hesabı açıldığında actor ID rotate + cron'la gerçek veri akışını doğrula
5. Trend Radar action linkleri için alıcı sayfaların (`dropscout.html`, `net-kar.html`, `tedarikci-bul.html`) query string okuma — şu an link'ler taşıyor ama alıcı sayfalar `?url=`, `?name=&price=`, `?q=` parametrelerini henüz parse etmiyor; küçük UX iyileştirme

### 2026-04-25 (devam) — Trend Radar action link'leri alıcı sayfalarda parse ediliyor
**Tamamlandı:**
- `dropscout.html` (script sonu, `startTrendRadarRotation()` sonrasında IIFE) — `?url=&platform=&category=` parser:
  - `url` → `linkInput.value`
  - `platform` → `platformSel.value` (seçenek varsa)
  - `category` → `categorySel.value` via `CATEGORY_MAP` (Trend Radar `TRACKED_CATEGORIES` → dropscout select option mapping; örn `giyim`→`moda`, `spor-outdoor`→`spor`, `kitap-hobi`/`mobilya`/`aksesuar`/`oyuncak`/`evcil-hayvan`→`diger`, `mutfak`→`ev-yasam`)
  - Sayfa link section'a smooth scroll + `linkInput.focus()` (preventScroll: true) — kullanıcı satış/maliyet doldurup "Analiz Et"'i kendisi tıklar (otomatik analiz tetiklemiyoruz, kota tüketmesin diye)
- `net-kar.html` (`calculate()` öncesinde IIFE) — `?name=&price=&platform=` parser:
  - `price` → `inpSalePrice.value` (Number.parse + Math.round)
  - `platform` → `inpPlatform.value` via `PLATFORM_MAP` (`amazon-tr`→`amazon`)
  - `name` → form alanı yok; sayfanın üstüne **info banner** enjekte ediyoruz: "📡 Trend Radar'dan: <ürün adı> — fiyat ve platform önceden dolduruldu, maliyetini girip Hesapla'ya tıkla" (sanitize: `<>` strip)
  - `calculate()` zaten initial olarak çağrıldığı için yeni değerlerle otomatik hesaplama tetiklenir
- `tedarikci-bul.html` (`renderAll()` sonrasında IIFE) — `?q=` parser:
  - `q` → `searchInput.value`
  - **Otomatik `runSearch()`** tetiklenir (kullanıcı ürün adıyla geldi, ekstra tıklamaya gerek yok). `Pro+` plan gerektirdiği için Start kullanıcı `handleApiError` toast'u görür
- Build: `npm run build` ✓ (17 sayfa, dropscout.js 23.99→24.89 kB, netKar.js 12.20→13.26 kB; tedarikciBul.js +0.5 kB; 1.95s)

**UX akışı (uçtan uca test):**
1. Trend Radar → kategori seç (örn "Mutfak") → "Fırsat" view
2. Bir ürün kartında **🔗 Analiz** tıkla → `dropscout.html?url=https://...&platform=trendyol&category=mutfak` açılır
3. Link input pre-filled, sayfa scroll'lar, focus link'te → kullanıcı satış/maliyet doldurup "Analiz Et" tıklar → Claude analiz eder
4. Aynı ürün kartında **💰 Net Kâr** tıkla → `net-kar.html?name=Akıllı+Mutfak+Tartısı&price=349&platform=trendyol` açılır
5. Banner "Trend Radar'dan: Akıllı Mutfak Tartısı …" görünür, satış fiyatı `349` ve platform `Trendyol` dolu, sayfa anında hesaplama yapar (default desi/paketleme/maliyet ile)
6. Aynı ürün kartında **🏭 Tedarikçi** tıkla → `tedarikci-bul.html?q=Akıllı+Mutfak+Tartısı` açılır → otomatik arama başlar (Pro+ kotası)

**Bilinçli olarak yapılmadı:**
- `dropscout.html` otomatik analiz tetikleme — kullanıcı maliyet girmeden analiz çalıştırırsak yanlış skor + boşa Claude kotası harcanır
- `net-kar.html` ürün adını gerçek bir input alanına eklemek — info banner yeterli, kalıcı form alanı eklemek diğer kullanım senaryolarını bozar
- `tedarikci-bul.html`'de cache hit/miss bilgisi — mevcut `searchSuppliers()` zaten cache döndürüyor

**Sıradaki adım (önceki seçeneklerden geriye kalan):**
1. Profil sayfasına usage widget (`getMyUsage()`)
2. iyzico/PayTR/Param entegrasyonu (provider seçilince)
3. Firestore TTL policy aktivasyonu
4. Apify hesabı açıldığında actor rotate

### 2026-04-25 (devam) — Profil usage widget tamamlandı + iyileştirildi
**Tespit:** Önceki bir oturumda `profil.html` usage widget tam implement edilmiş ama log'a düşmemişti. Mevcut hali:
- `loadPlanAndUsage()` `onAuthChange` user-logged-in kolunda çağrılıyor; `getMyPlan()` + `getMyUsage(3)` paralel
- 3'lü stat grid: **Bu Ay AI Analiz** (calls + USD), **Son 3 Ay Toplam**, **Cache Verimi** (%)
- `usageQuotaList` — her meter için kullanım barı (linkAnalysis, storeProductAnalysis, legalCheck, supplierSearch); sınırsız/locked/aşıldı durumları renkli (`.warn` >80%, `.danger` >=100%)
- `usageHistoryRows` — son N ayın `month / calls / costUsd` listesi
- CSS sınıfları (`.usage-summary-grid`, `.usage-quota-bar-fill.warn|.danger`, `.usage-history-row`) tanımlı
- Hata fallback: `loadPlanAndUsage` fail olunca quota list'e "yüklenemedi" mesajı

**Bu oturumda eklenen iyileştirmeler:**
- Aylık geçmiş ay etiketi Türkçeleştirildi: `formatMonthTr('2026-04') → 'Nisan 2026'` (TR_MONTHS dizisi)
- Cache verimi sub-text artık somut tasarruf gösteriyor: `cacheSavedUsd = cacheRead × (input - cacheRead) / 1M` → "≈ $X tasarruf" (cache hit'siz olsaydı kaç dolar daha harcanırdı). DOM seçimi `#usageCacheRate + .usage-summary-sub` sibling selector ile (HTML değişikliği gerekmedi)
- Pricing notu güncellendi: cache write $1.25/M satırı eklendi, "input fiyatının %10'una düşer" açıklaması netleşti
- Build: `npm run build` ✓ (profil.js 10.47 kB, değişmedi anlamlı şekilde)

**Test akışı:**
1. Login → `profil.html`
2. "Kullanım Özeti" kartı backend'den (`/api/me/usage?months=3`) gerçek veriyle dolar
3. AI analiz hiç yapılmamışsa: Bu Ay 0 analiz / $0.00, Cache verimi `—`, aylık geçmiş "Veri yok"
4. `dropscout.html`'de bir analiz yap (Claude çağrısı), `profil.html`'i yenile → calls 1, costUsd > 0 görünür
5. Aynı analizi tekrar tetikle → cache hit → calls artmaz (cache hit kotayı tüketmez), Cache verimi % artar, sub-text "$X tasarruf"

**Bilinçli olarak yapılmadı:**
- "Bu ay vs. geçen ay" trend göstergesi (▲%X) — UX açısından zayıf değer, mevcut history zaten yan yana gösteriyor
- Analiz tipi dağılımı (Trend Radar / Link Analizi / Rakip Analizi başına calls) — backend `usageMonthly` doc'unda saklanmıyor, bunu tutmak için endpoint genişletilmeli (gereksiz ek iş)
- Aylık limit projection ("bu hızda devam ederse $Y") — kullanıcı için kafa karıştırıcı, plan kartında zaten kalan hak görünüyor

**Sıradaki adım (önceki seçeneklerden geriye kalan):**
1. iyzico/PayTR/Param entegrasyonu (Task #13) — provider seçilince
2. Firestore TTL policy aktivasyonu — GCP konsolundan tek tıkla, `cache/insights/items.expiresAt` üzerine
3. Apify hesabı açıldığında actor ID rotate + cron'la gerçek veri akışını doğrula

### 2026-04-25 (devam) — Firestore TTL policy aktive edildi
**Tamamlandı:**
- GCP Console → Firestore → TTL → "Create policy" ile aktive edildi
  - Collection group: `items`
  - Timestamp field: `expiresAt`
  - State: `Serving` (eski adı `Active`; GCP terminoloji güncellemiş)
- Etkilenen koleksiyonlar (tek policy hepsini kapsar):
  - `cache/insights/items` — Claude AI içgörü cache (30 gün)
  - `cache/gapRadar/items` — Apify Gap Radar snapshot cache (1 gün)
  - `cache/suppliers/items` — Apify supplier cache (7 gün)
- Etkilenmeyen: `cache/trends/items` (rolling history, `expiresAt` field'ı yok — kasıtlı)

**UX gözlemi:** TTL form'unun "Timestamp field" dropdown'ı yalnız mevcut belgelerden tespit edilen field'ları öneri olarak listeliyor. `expiresAt` dropdown'da görünmedi (cache koleksiyonu henüz yazılmamış olabilir veya GCP indeks gecikmesi). Çözüm: combobox'a doğrudan `expiresAt` yazıp Enter — kabul etti, policy oluştu. **`updatedAt` hatasından kaçınıldı** (hep geçmiş tarihte olduğu için seçilse tüm belgeler hemen silinirdi).

**Davranış:**
- TTL "best effort" — Google "tipik 24 saat içinde siler" diyor, 72 saate kadar gecikebilir
- Bu nedenle `scheduledCleanupCache` cron'u (Pazartesi 03:00 TR) **kaldırılmadı**, deterministik garanti olarak duruyor; ikisi birlikte 2 katman güvenlik
- Cache hit kontrolü (`expiresAtMs > Date.now()`) endpoint'lerde duruyor — TTL gecikirse stale belge dönmesin diye

**Doğrulama:**
- TTL policy sayfasında satır: `items / expiresAt / Serving`
- gcloud ile de doğrulanabilir: `gcloud firestore fields ttls list --project=dropscoutapp`

**Bilinçli olarak yapılmadı:**
- `firestore.rules` veya `firestore.indexes.json` güncellemesi — TTL policy bu dosyalarda yönetilmiyor (ayrı API)
- Endpoint'lerdeki manuel `expiresAt` kontrolünü kaldırma — TTL gecikmesine karşı koruma kalmalı

**Sıradaki adım (önceki seçeneklerden geriye kalan):**
1. iyzico/PayTR/Param entegrasyonu (Task #13) — provider seçilince
2. Apify hesabı açıldığında actor ID rotate + cron'la gerçek veri akışını doğrula
3. Payment endpoint'lerini `index.ts` router'a mount etme (mock provider ile dev test mümkün, prod için provider beklenir)

### 2026-04-25 (devam) — Trend Radar UI yeniden tasarım (kullanıcı yönlendirmesi)
**Karar:** Sayfa yapısı kullanıcı feedback'i ile baştan kuruldu. Önceki "sol kategori list + sağ chart panel + altta ürün grid" düzeni kaldırıldı; sayfa tek odak halinde:
1. Topbar — "↻ YENİLE" butonu yanında **son güncellenme saati** (`son: 14:32` formatı)
2. Stat-bar — 5 kart (mavi/yeşil/kırmızı/sarı + **mor Bloomberg rotator** sonuncu)
3. Ürün listesi — view chip + multi-select kategori dropdown + tek-sütun ürün satırları

**Tamamlandı (`trend-radar.html` baştan yazıldı):**
- **Bloomberg rotator stat-card** (5. mor kart) — `.ticker-card` özel class:
  - `.ticker-name` → kategori adı (fade-out 180ms + swap + fade-in)
  - `.ticker-change` → `▲ +14.2% · 7g 47` formatında, yeşil/kırmızı/gri sınıfla
  - `.ticker-spark` → kart background olarak `position:absolute` 200×36 SVG sparkline (opacity 0.35)
  - `.ticker-dots` → max 8 nokta, aktif olan mavi
  - 4.5 saniyede bir kategori değişir (`setInterval`); hover'da pause (`mouseenter/mouseleave`)
  - Sıralama: `Math.abs(changePct)` desc — en hareketli kategoriler önce
- **Topbar refresh-btn** — `<span>↻ YENİLE</span> | son: HH:MM` (border-left ile ayrılmış); zaman `state.items` snapshot'larının en yenisinden hesaplanır
- **View chip'leri** — 4 buton: **Tümü** (default), **Fırsat**, **En Çok Beğenilen**, **En Çok Yorum** ("En Çok Satan" kullanıcı talebi üzerine kaldırıldı)
- **Multi-select kategori dropdown** — `.cat-trigger` (chip stilinde) tıklanınca `.cat-panel` açılır, checkbox'lı liste, "Tümü" + 15 kategori, `Set` ile state, dış tıklamada otomatik kapanır + apply tetiklenir, "Temizle" / "Uygula" butonları
  - Trigger label: 0 veya hepsi seçili → "Kategori: Tümü"; aksi → "Kategori: N seçili" + count badge
- **`buildProductPool()`** — view + selectedCategories'e göre 4 list'in tümünden veya birinden seçilen kategorilerin ürünlerini birleştirir, `${platform}|${id}` ile dedupe, view'a göre primary sort (`gapScore`/`favoriteCount`/`reviewCount`); 'all' view'da gap+sold+favorite ağırlıklı karma sıralama. TOP 60 ürün render edilir.
- **Ürün satırı** (`.product-row`) — `grid: 108px 1fr 132px`:
  - Sol: 108×108 thumb (img veya baş harf placeholder), platform pill (sol-alt), sıra rozeti (sağ-üst)
  - Orta: ad (2 satır clamp) + meta (kategori · platform) + fiyat + 4 chip (Fırsat skoru, satış, fav, yorum) — view'a bağlı değil, hepsi her zaman görünür (kullanıcı tüm sinyalleri tek bakışta görsün)
  - Sağ: **dikey 3 buton** (`.pr-actions`):
    - 💰 **Net Kâr** → `net-kar.html?name=&price=&platform=` (mevcut alıcı parser zaten bunu okuyor)
    - ⚖️ **Yasal** → `yasal-kontrol.html?name=&category=` (alıcı parser bu oturumda eklendi)
    - 🏭 **Tedarikçi** → `tedarikci-bul.html?q=` (mevcut alıcı parser zaten bunu okuyor)
  - **Analiz butonu kaldırıldı** — Net Kâr ile aynı işi yapıyor (Link Analizi'nin Claude AI içgörüsü Net Kâr motoru üzerinde aynı parametreleri tüketir)
- **Stat-bar 4 kart** — Tazelik kartı kaldırıldı, `every6h/daily/every3days` bilgisi sidebar plan-card'ında kaldı
- **Mobilde** ürün satırı `grid: 88px 1fr` (2 sütun) + butonlar `grid-column: 1/-1` (alt satır, yatay 3 buton)

**Yasal Kontrol query parser (`yasal-kontrol.html`):**
- `renderAll()` sonrasına IIFE eklendi: `?name=&category=` → `searchInput.value`, `searchCategory.value`
- `CATEGORY_MAP` ile Trend Radar TRACKED_CATEGORIES → bu sayfanın option metinleri eşleştirildi (`elektronik`→Elektronik, `ev-yasam`→Ev & Yaşam, `kozmetik`→Kozmetik, `oyuncak`→Oyuncak, `otomotiv`→Oto Aksesuar, `supermarket`→Gıda Takviye)
- Eşleşmeyen kategoriler için "Tümü" varsayılan kalır

**Build:** `npm run build` ✓ (17 sayfa, trendRadar.js 18.19→12.85 kB **küçüldü** — eski sol+sağ panel + chart kodu kalktı, ürün listesi netleşti; 1.80s)

**Deploy:** `firebase deploy --only hosting` (functions değişmedi)

**Test akışı:**
1. Sayfa yüklenince: 4 stat kartı + ticker (4.5sn döngü) + ürün listesi (skeleton → gerçek)
2. View chip'leri arasında geçiş anında list yeniden sıralar
3. Kategori dropdown → checkbox'larla 1 veya birden fazla kategori seç → "Uygula" → list filtre uygulanır
4. Ürün satırında "Net Kâr" → forma yönlendirir, banner "Trend Radar'dan: ..." görünür
5. "Yasal" → ürün adı + kategori pre-fill edilir
6. "Tedarikçi" → otomatik arama tetiklenir
7. Ticker üstüne hover → kategori değişimi durur, mouse çekilince devam eder

**Bilinçli olarak yapılmadı:**
- Eski sol kategori kart listesi + sağ 30g chart paneli geri getirilmedi — Bloomberg rotator + multi-select kategori filtresi onların işini birleşik şekilde yapıyor
- Ticker hızı kullanıcı tarafından ayarlanabilir değil — 4.5sn varsayılan, ileride `localStorage`'a kaydeden mini ayar düşülebilir
- Ürün satırında platform-spesifik aksiyon (örn "Trendyol mağazama ekle") yok — ileride seller API entegrasyonuyla eklenebilir

**Sıradaki:** Canlıda görmek için deploy → kullanıcı geri bildirim verecek

### 2026-04-25 (devam) — Trend Radar mock fallback + eski "Canlı Fırsat Akışı" görsel uyarlaması
**Karar:** Cron tetiklenmediği için Firestore boş ve canlıda hiç ürün görünmüyordu. Kullanıcı eski sürüm screenshot'ı paylaştı ("Canlı Fırsat Akışı" tasarımı, 4 metrik kutusu + AI score + verdict) ve "bu görseli olduğu gibi uyarla, ama yeni ayarlar (Bloomberg ticker / view chip / multi-select kategori / 3 buton) sabit kalsın" dedi.

**Tamamlandı:**

**1. Frontend mock fallback** (`trend-radar.html`):
- `MOCK_CATEGORIES` (15 kat.), `MOCK_PLATFORMS` (4 marketplace), `MOCK_NAMES` (kategori başına 6 deterministic ürün adı)
- `buildMockSeries()` — kategori başına 30 günlük deterministic interest dizisi
- `buildMockProducts()` — kategori×platform×ad ile 24 ürün üretir, gapScore hesaplanmış, 4 farklı sıralama (`buildCategoryLists` mantığıyla)
- `buildMockItems()` — 15 kategori için snapshot+products yapısı (avg7/avg30/changePct/trend dahil)
- `shouldUseMock()` — `getTrends()` boş items dönerse veya hiçbir item'da products yoksa → otomatik mock
- 500/network hatası → mock devreye girer, plan/quota hatası (handled) → mock'a geçmez "Erişim engellendi"
- "↻ YENİLE" yanı: mock kullanılınca `mock · HH:MM`, gerçek veri varsa `son: HH:MM`
- Stream status pill: mock varken **TEST VERİSİ** (turuncu), gerçek varken **CANLI** (mavi)

**2. Ürün satırı görsel uyarlaması** (eski "Canlı Fırsat Akışı" stiline):
- `.product-row` grid: `108px 1fr 144px` — sol thumb / orta info+metrik / sağ AI skor+verdict+butonlar
- **Sol thumb** — kategori-renk gradient (`thumbGradient(p)` ile 15 kategori için ayrı linear-gradient), "ÜRÜN<br>PREVIEW" overlay, sıra rozeti #N
- **Orta panel:**
  - Başlık (`.pr-name`) yanında **3 pill**: kategori adı (mavi) + dinamik tag (gapScore/satış/favoriye göre "Yüksek fırsat"/"Çok satan"/"Çok beğenilen"/"Pasif ürün"/"Stabil talep") + platform (mavi)
  - 1-2 satır açıklama metni
  - **4 metrik kutusu** yatay grid: **Fırsat / Satış / Favori / Yorum** (eski sürümün DOYGUNLUK / REKABET / NET MARJ / AI SKOR'unun trend-radar veri setine adapte edilmiş hali — Net Kâr ile çakışan metrikler kaldırıldı, backend snapshot'ından gelen sinyaller yerleştirildi)
  - Renk kodlama: `gapScore >= 15` yeşil, ≥8 mor; satış ≥60 yeşil, <25 turuncu; favori turuncu; yorum mavi
- **Sağ panel:**
  - **AI Score** kartı — `calcAiScore(p) = 50 + gap*1.4 + clamp(fav/200, 15) + clamp(rev/80, 10) + clamp(sold/12, 8)`, range 20-99
  - **Verdict** rozeti: ≥80 SATILIR (yeşil) / ≥65 İZLENMELİ (sarı) / <65 ATLANMALI (turuncu)
  - **3 buton dikey** — Net Kâr / Yasal / Tedarikçi (önceki tasarımda zaten vardı, bu kartta da korundu)
- **Pagination** — eski sürümün chip stiliyle: `.page-btn` aktif/hover mavi, `12 ürün/sayfa` (`PAGE_SIZE = 12`), max 60 ürün → 5 sayfa, "1 / 5 · sayfa başına 12 ürün" info text. View veya kategori değişiminde `state.page = 1`'e döner. Sayfa değişiminde `productList`'e smooth scroll.

**3. Mobil responsive:**
- `<900px` ürün satırı 2 sütun grid (thumb + body), sağ panel alt satıra düşer (AI score + verdict yatay row, butonlar yatay 3'lü)
- `pr-metrics` 4 sütundan 2 sütuna düşer

**Build:** `npm run build` ✓ (trendRadar.js 17.78→20.85 kB; +AI score logic, +pagination, +thumbnail gradient'leri, +verdict mantığı; 1.96s)

**Korunan ayarlar (kullanıcı talebi):**
- Bloomberg rotator (5. stat-bar kartı, 4.5sn döngü, hover-pause, fade animasyonu)
- 4 view chip: **Tümü / Fırsat / En Çok Beğenilen / En Çok Yorum**
- Multi-select kategori dropdown (15 kategori, "Tümü" + checkbox'lar, Temizle/Uygula)
- 3 dikey buton: **Net Kâr / Yasal / Tedarikçi** (Analiz butonu kaldırıldı — Net Kâr ile aynı işi yapıyor)
- "↻ YENİLE" yanında son güncelleme saati / mock rozeti

**Bilinçli olarak yapılmadı:**
- Eski sürümdeki "DOYGUNLUK / REKABET / NET MARJ" metrikleri — Trend Radar veri setinde yok (Net Kâr Hesabı'nda hesaplanır). Yerine "Fırsat / Satış / Favori / Yorum" konuldu (snapshot'tan doğal olarak gelen sinyaller)
- Eski sürümdeki "Seç ve güncelle" tek butonu — yerine 3 fonksiyonel buton (Net Kâr/Yasal/Tedarikçi)
- AI score'un Claude AI ile hesaplanması — formül determinitsik (gapScore + fav + rev + sold ağırlıklı). Gerçek AI score için `analyzeProduct` endpoint'i Net Kâr akışında zaten devrede

**Test akışı (canlıda):**
1. Sayfa açılır, 4 stat kartı + Bloomberg ticker + ürün listesi (mock veya gerçek)
2. View chip değiştir → liste anında re-sort + page=1
3. Kategori dropdown'dan multi-select yap → "Uygula" → liste filtre + page=1
4. Pagination chip'leri ile sayfalar arası geç
5. Ürün satırında 3 buton → Net Kâr/Yasal/Tedarikçi sayfaları formu pre-filled açılır
6. Cron çalışıp Firestore dolduğunda mock otomatik devre dışı kalır (manuel müdahale yok)

**Deploy:** `firebase deploy --only hosting` (functions değişmedi)

### 2026-04-26 — UI cilası + Net Kâr büyük refactor (Buy Box + Tedarikçi entegrasyonu + profil companyType)
**Tamamlandı (Trend Radar UI cilası):**
- **Pazaryeri Doygunluğu kartı genişletildi** (`trend-radar.html`):
  - `.product-row` saturation kolonu `320px → 420px` (responsive 1280px altında `280px → 360px`)
  - İç padding `10px 18px → 12px 28px`, satır gap `7px → 9px`, dikey+yatay ortalı
  - Pazaryeri adı sütunu `72px → 96px`, yüzde sütunu `38px → 52px`, bar yüksekliği `8px → 11px`, satır font'u `9px → 10.5px`
  - **3 düz renk** (eski 4'lü gradient kalktı): `<%34` yeşil `#10b981`, `34-66%` sarı `#eab308`, `≥%67` kırmızı `#ef4444`
  - Bar arkaplanı tarafsız nötr ton, sadece üst kenarda yeşil→sarı→kırmızı scale çizgisi (referans için)
- **Dashboard Link Analizi yanlış işaretli** düzeltildi: `dropscout.html:1060` sidebar'ından `active` sınıfı kaldırıldı; artık dashboard'da hiçbir araç işaretli değil, ilgili sayfaya gidince yeşil işaretlenir
- **Sol-alt "Pro Plan" kartı tüm sayfalardan kaldırıldı** (sidebar-bottom artık yalnız tema toggle):
  - Tek-satır plan-card silindi: `amazon-tr.html`, `hepsiburada.html`, `n11.html`, `trendyol.html`, `raporlar.html`, `takip-listem.html`, `tedarikci-bul.html`, `profil.html`, `pricing.html`
  - Multi-line plan-card silindi: `dropscout.html`, `net-kar.html`, `rakip-analizi.html`, `gap-radar.html`, `trend-radar.html`
  - `trend-radar.html`'deki `renderSidebarPlan()` fonksiyonu + çağrısı kaldırıldı (DOM null reference vermesin diye)
  - `pricing.html`'deki `loadPlan()` içindeki `sbPlanTier/Name/Meta` yazma satırları kaldırıldı

**Bloomberg ticker — gerçek rotasyon:**
- Eski `paintTicker()` tek seferlikti (tek kategori sabit), `state.tickerIndex/Timer/Paused` deklare edilmiş ama kullanılmıyordu
- Yeniden yazıldı (`trend-radar.html`):
  - `tickerOrder()` — kategorileri `|changePct|` desc + alfabetik tie-break ile sıralar (en hareketli önce)
  - `paintTickerSlot()` — `tickerIndex`'teki kategoriyi yazar (ad, ▲/▼/·, %, 7g ort, sparkline)
  - `advanceTicker()` — `.ticker-content`'a `fading` ekler (CSS opacity 0), 280ms sonra index ++ → tekrar boyar (fade-in)
  - `startTickerRotation()` — `setInterval(advanceTicker, 4500)`; hover'da `state.tickerPaused = true` (kullanıcı bilgileri okuyabilsin)
  - `paintTicker()` (eski isim) artık `tickerIndex=0` + `startTickerRotation()` çağırıyor → init akışı kırılmadı
  - Alt nokta göstergesi (`.ticker-dots`) dinamik oluşturuluyor (max 8 nokta, mor aktif)
- **Alt 2 pill (yükselen/düşen) de rotasyona dahil edildi** — eskiden hep en üst/en alt sabitti:
  - `pickSecondaries(order, mainIdx, cur)` — ana kategoriyi hariç tutarak iki slot seçer
  - Genel durum (her iki tür var): üst yükselen, alt düşen — `mainIdx % pool.length` ile rotasyon
  - Tek aday varsa: modulo otomatik tek elemanı verir → "tek yükselen varsa hep o"
  - Hiç yükselen yok → iki slot da düşenden (1'den fazlaysa farklı)
  - Hiç düşen yok → iki slot da yükselenden
  - `paintSecondarySlot()` — semantik renk: pct > 0 yeşil ▲, pct < 0 kırmızı ▼, 0 gri ·; CSS'e `.flat-cat{color:var(--muted);}` eklendi

**Net Kâr büyük refactor (`net-kar.html`):**
> Tetikleyici: kullanıcı "Trend Radar'dan Net Kâr'a gelince satıcı maliyeti bilmediği için buton tümüyle gereksiz oluyor" dedi. Çözüm: form düzenlemeleri + Buy Box anker'lı 3 fiyat senaryosu + Tedarikçi entegrasyonu + profil companyType.

**Form düzenlemeleri:**
- **Platform** boş başlıyor (`<option value="" selected disabled>Pazaryeri seç…</option>`), zorunlu (*); `calculate()` içinde boşsa `#platformError` gösterip select kenarlığı kırmızı (`var(--red)`) — hesaplama yapılmıyor
- **Şirket Türü** sayfa açılırken `onAuthChange` ile `getUserProfile()` çağrılıp `profile.companyType` → `inpCompany.value` (varsa); etiket `· profilden`
- **Kategori → Desi otomatik tahmin** — `CATEGORY_DESI` map (elektronik=7, moda=3, ev=15, kozmetik=3, spor=7, mutfak=7, pet=7, ofis=3); kullanıcı manuel desi seçince `userTouchedDesi=true` flag set, sonraki kategori değişiminde dokunulmuyor; etiket `· kategoriye göre tahmin` → `· manuel`
- **Paketleme Maliyeti** default `9.10 → 0`, label'a `· opsiyonel`
- `resetForm()` güncellendi (platform `''`, packing 0, desi kategoriden), `buyBoxAnchor/competitorCount/userTouchedDesi` reset

**Buy Box anker'lı 3 fiyat senaryosu:**
- `buyBoxAnchor` global state — Trend Radar'dan `?price=` ile gelirse o değer (Trendyol/HB/Amazon listing fiyatı = fiilen Buy Box winner fiyatı), gelmediyse ilk hesaplamadaki salePrice
- 3 senaryo (eski Agresif/Optimal/Premium yerine):
  - **Agresif (Buy Box'ı kap)** `mult: 0.97` — küçük marj, hızlı satış
  - **Optimal (varsayılan, ⭐)** `mult: 1.00` — pazar fiyatına eşitle, görünür kal
  - **Premium (marj öncelikli)** `mult: 1.08` — yavaş ama yüksek marj
- Her satıra **"Bu senaryoyu uygula" butonu** + açıklama satırı; tıklanınca `inpSalePrice = sp` + `calculate()`; aktif senaryonun butonu "✓ Uygulandı" yeşile döner
- `?competitors=1` (≤1) ile gelirse tek **"Pazar Fiyatı"** kartı gösteriliyor (rekabet yok, agresif/premium gizli)
- Eski "Yüksek Hacim" satırı kaldırıldı (Hacim Projeksiyonu kartında zaten var)

**Tedarikçi entegrasyonu:**
- Trend Radar'dan gelirken banner artık **"🏭 Tedarikçi'den maliyet getir"** butonuyla geliyor (otomatik değil — tek tık ile Apify, Apify maliyetini kontrol altında tutmak için)
- `fetchSupplierCost(name, btn)` — önce `ensureQuota('supplier')` (Start kullanıcısı toast görür), sonra `searchSuppliers({ query, maxItems: 10 })` → en düşük `priceUsd` × `USD_TRY=33` → `inpCost` + `calculate()`
- Hata: `handleApiError` (403/429 toast); başka hata için butonda "✗ Hata", 2.2s sonra geri dön
- Cache hit'te buton "✓ ₺X (cache)" yeşilleşir; gerçek scrape'te "✓ ₺X (alibaba)" gibi platform adı

**Trend Radar link zenginleştirildi:**
- `trend-radar.html:839` Net Kâr href'ine `&category=<id>&competitors=<n>` eklendi (varsa); alıcı parser `TR_CATEGORY_MAP` ile Trend Radar kategorilerini net-kar option'larına çeviriyor

**Profil sayfası — Şirket Türü alanı (`profil.html`):**
- Şirket/Firma input'unun altına `<select id="accountCompanyTypeInput">` (Şahıs Şirketi / Ltd. Şti. / AŞ) eklendi
- `setDisplay`, `snapshotForm`, `restoreForm`, `setEditMode`, `saveAccount` hepsi `companyType` field'ını destekliyor
- Firestore'a `users/{uid}.companyType` olarak yazılıyor (`updateUserProfile` ile)
- Default `'sahis'` (yeni kullanıcı veya field yoksa)

**Build:** `cd functions && npm run build` (değişmedi); root `npm run build` ✓ (17 sayfa, netKar.js 13.26 → 16.70 kB, trendRadar.js 21.51 → 22.83 kB, profil.js 10.98 → 11.22 kB)

**Bilinçli olarak yapılmadı:**
- **USD→TRY dinamik kur** — şu an sabit `USD_TRY=33`; ileride bir FX cron + Firestore cache (`scheduledRefreshFxRate` haftada 1) eklenebilir
- **Şirket türünün vergi hesabına etkisi** — Şahıs (gelir vergisi dilimi, %20+ stopaj) vs Ltd (KV %20 + temettü %15) farkı ayrı bir hesap motoru gerektiriyor; şu an profil bilgisi olarak saklanıyor, motor mevcut tek tip mantıkla çalışıyor
- **Onboarding'e şirket türü sorusu** — ayrı bir oturum işi; profil sayfasından default `'sahis'` atanıyor
- **Buy Box winner ID + el değiştirme sıklığı** (gerçek rekabet derinliği) — ayrı Apify "offers" scraper gerekir; şu an `competitorCount` ≤ 1 kontrolüyle yeterli sinyal alınıyor
- **Otomatik tam akış** (Trend Radar'dan gelince Tedarikçi otomatik çağır + senaryo uygula + hesapla) — Apify maliyeti + plan gate sebebiyle ilk sürümde manuel; user kontrolü öncelikli

**Test akışı (uçtan uca):**
1. Profil → Bilgileri Düzenle → Şirket Türü "Ltd. Şti." → Kaydet → Firestore'da `users/{uid}.companyType: "ltd"` görünür
2. Trend Radar → Mutfak kategorisi → bir ürün satırında **💰 Net Kâr Hesabı**
3. Net Kâr açılır: Platform Trendyol seçili (Trend Radar'dan), satış fiyatı 349 (Buy Box anker), kategori Mutfak, desi otomatik 7 (`CATEGORY_DESI.mutfak`), şirket türü Ltd. (profilden), paketleme 0
4. Banner: "📡 Trend Radar'dan: Akıllı Mutfak Tartısı — Buy Box fiyatı ve pazaryeri yüklendi. Maliyet için tedarikçiden teklif çek: [🏭 Tedarikçi'den maliyet getir]"
5. Buton tıklanır → Pro+ kullanıcı için Apify çağrısı, ~5-15s sonra "✓ ₺X (alibaba)" yeşil → cost otomatik dolar, hesap yenilenir
6. Sağda Fiyat Senaryoları: ⭐ Optimal aktif (₺349), Agresif ₺338, Premium ₺377; her birinde "Bu senaryoyu uygula" butonu
7. Premium tıklanır → satış fiyatı 377 olur, hesap yenilenir, butonu "✓ Uygulandı" olup yeşilleşir
8. Platform select boşaltılırsa → kırmızı uyarı belirir, hesaplama durur

**Sıradaki seçenekler:**
1. Buy Box senaryolarını tek-satıcı ürünlerde ayrı UX (TR live kategori veriler gelmediği için competitorCount şu an çoğu üründe yok — Apify scraper'a `competitorCount` field'ı eklenebilir)
2. USD→TRY dinamik kur cron'u (haftalık FX güncellemesi, Firestore'da `cache/fx/usd-try` snapshot)
3. Şirket türünün vergi motoruna entegrasyonu (Şahıs vs Ltd hesap farkı)
4. iyzico/PayTR/Param entegrasyonu (Task #13) — provider seçilince
5. Apify hesabı açıldığında actor ID rotate

**Deploy:** `firebase deploy --only hosting` (functions değişmedi)

### 2026-04-26 (devam) — Net Kâr supplier panel + Yasal Kontrol baştan tasarım
**Net Kâr UI iterasyonları (`net-kar.html`):**
- Trend Radar'dan gelince sayfanın en üstüne enjekte edilen "Tedarikçi'den maliyet getir" banner kaldırıldı; yerine "Maliyet Parametreleri" kartının içine, btn-row'un içinde sağa atılan **standalone buton + altında 2 satırlık bilgi metni** geldi
- 3 iterasyon sonrası final hâl:
  - `.btn-row{align-items:flex-start}` — Hesapla, Sıfırla ve Tedarikçi butonu üst kenardan hizalı, aynı yatay çizgide
  - `.supplier-wrap{margin-left:auto}` — Hesapla/Sıfırla solda kalır, supplier butonu sağa atılır
  - Bilgi metni `font-size:9.5px; white-space:nowrap` — tek satır, küçük punto, sağa hizalı
  - Mobilde dikey istif + ortalama
- Trend Radar'dan gelmeyen kullanıcılar için panel tamamen gizli (`#supplierSection.style.display='none'`); buton sayısı ve düzen değişmez

**Yasal Kontrol baştan yazıldı (`yasal-kontrol.html`):**
- Tetikleyici: ürün adı/barkod ile arama → yanlış ürün eşleşmesi riski yüksek. Çözüm: tek arama anahtarı ürün linki
- **Form sadeleşti:** [Ürün Linki] + [Kategori (otomatik tespit)] + [Hedef Pazar] + [⚖️ Kontrol Et]
  - Hedef Pazar: Türkiye selectable; **AB · yakında**, **ABD · yakında** disabled (option:disabled muted styling)
  - Hint metni (`🔒 Yasal kontrol yalnız ürün linki ile yapılır...`) row'un dışına taşındı (içeride iken `align-items:end` ile diğer input'ları yamulttu); şimdi `.search-hint` class'ında full-width altta
  - Tüm form öğeleri `height:42px; box-sizing:border-box` ile aynı yükseklik, `.sm-label{height:13px}` ile label hizası sabitlendi
- **Çoklu ürün listesi (`legal-list` / 8 demo ürün) tamamen kaldırıldı.** Sayfa artık tek-ürün analiz akışı; multi-product table yapısı yok
- **Slide-down sonuç alanı** (`#resultArea.show` → `resultSlide` keyframe, opacity + max-height + translateY, 0.55s cubic-bezier):
  - **Ürün Başlığı kartı** — `result-head` (mor→mavi gradient üst kenar): link + platform pill + kategori pill + Türkiye pill
  - **Risk Hero + AI Score Card** (yan yana grid, mobilde dikey): sol risk shield + status, sağ büyük 48px puan + decision + sub
  - **Belge Kartları** (asıl yeni alan, ücretli özellik için detaylı):
    - Her belge: ikon + ad + ZORUNLU/ÖNERİLİR/OPSİYONEL rozeti + "+ Belgem var" / "↺ Beyanı kaldır" toggle
    - 3-sütunlu meta: Kurum / Tahmini Süre / Tahmini Maliyet aralığı (₺X – ₺Y)
    - Belge sahip olunca kart yeşilleşir, badge "✓ HESABINIZDA VAR", maliyet üstü çizili (artık ödememe vurgusu)
  - **AI Yasal Öneri** — eksik zorunlu/önerilen belgeye göre dinamik metin, tahmini toplam maliyet, 3 aksiyon önerisi
- **Boş durum** (`empty-search-hint`) — sidebar'dan link yapıştırılana kadar görünen kesik kenarlı dashed kart
- **Belge sözlüğü** (`LEGAL_DOCUMENTS` — 17 standart belge): CE, TİTCK, BTK, AEEE, GMP, RED, LVD, EMC, UN38.3, Gıda Teması, Tarım Bakanlığı, CPNP, Sorumlu Kişi, Güvenlik Değerlendirmesi, Garanti Belgesi, TSE, Sağlık Beyanı. Her biri için: name, institution, duration, cost (aralık), icon, weight (puan ağırlığı 3-14)
- **Kategori → belge map** (`CATEGORY_REQUIREMENTS` — 10 kategori + default): elektronik (8 belge: ce/btk/red/aeee zorunlu, lvd/emc/un38.3/garanti önerilir), kozmetik (4 zorunlu + cpnp önerilir), supermarket (tarım+sağlık beyanı zorunlu), oyuncak (ce zorunlu)... her birinde required/recommended/optional sınıfı
- **Beyan Onay Modalı** (`#docModal`):
  - Overlay: `position:fixed inset:0`, blur backdrop, z-index 1000
  - Card: 520px max, slide-in animasyon (translateY + scale)
  - Profesyonel onay metni: belge adı vurgulu, hesaba kalıcı kayıt + sonraki analizlerde otomatik geçerli sayılma açıklaması
  - **Sarı uyarı kutusu**: "Beyanınızın doğruluğundan **münhasıran siz sorumlusunuz**. Yanlış beyan; satış kısıtlamaları, ürün kaldırma ve idari yaptırımlara yol açabilir."
  - "Beyanımın doğruluğunu kabul ediyorum" checkbox işaretlenmeden Onayla butonu disabled
  - Kaldırma akışı: aynı modal, kırmızı `danger` butonla; "Kaydı Kaldır" metni
  - Esc tuşu / overlay tıklaması ile kapanış
- **Firestore entegrasyonu:**
  - Onay verince `users/{uid}.legalDocuments: { ce: true, titck: true, ... }` yazılır (`updateUserProfile`)
  - Sayfa açılışında `onAuthChange` → `getUserProfile()` → `state.ownedDocs` Set'i doldurulur
  - Optimistic update + hata durumunda otomatik rollback (network/permission error'da Set eski hâline döner)
  - Modal "kaydet (tekrar dene)" durumuna döner
- **Dinamik puan + risk yeniden hesabı** (`calculateScore`):
  - 100'den başlar, eksik zorunlu belgeler tam ağırlık (-12, -10, -14...), eksik önerilenler ×0.4 ceza
  - Sahip olunan belgeler ceza yapmaz
  - Risk eşikleri: missing required weight 0 → SAFE, ≤14 → WARN, >14 → DANGER
  - "Belgem var" işaretlendiği anda Set güncellenir → `renderResults()` → puan, risk, advice, aksiyon metinleri canlı yenilenir
- **Sonraki ürün analizlerinde otomatik "VAR":**
  - Kullanıcı CE'yi onayladıysa → CE gerektiren her ürün analizinde belge kartı yeşil ✓ HESABINIZDA VAR olarak çıkar
  - Beyanı kaldırma da var: kart üstünden "↺ Beyanı kaldır" → kırmızı modal → onaylanınca Set ve Firestore'dan silinir, sonraki ürünlerde tekrar eksik gözükür
- **Trend Radar entegrasyonu:**
  - Trend Radar'da yasal butonu artık `?url=&platform=&category=` gönderiyor (eski `?name=&category=` riskli)
  - Yasal Kontrol parser otomatik fill yapıyor (link + kategori) ve **120-220ms sonra `runCheck()`'i otomatik tetikliyor**, slide-down açılıyor
  - Sidebar'dan açılan kullanıcı için: form + empty state, manuel link yapıştır + Kontrol Et tıkla → aynı slide-down

**Build:** root `npm run build` ✓ (yasalKontrol.js 14.70 kB, eski 7-8 kB'tan büyüdü çünkü 17 belge + 10 kategori map'i + modal + Firestore mantığı yeni)

**Bilinçli olarak ertelenenler:**
- **Backend `analyze-legal` endpoint** — gerçek scraping (Apify pazaryeri ürün sayfası → kategori + içerik tespiti) + Claude AI yorumu. Şu an demo data ile mock akış; kategori dropdown'undan veya URL host pattern'inden tahmin
- **Belge maliyet bilgilerinin Firestore'da merkezi tutulması** — şu an frontend hardcoded; ileride `cache/legal-docs/registry` collection'ında tutulup admin panelden güncellenebilir
- **Belge ekleme tarihi + son güncelleme tarihi takibi** — şu an basitçe `legalDocuments: { ce: true }`; ileride `{ ce: { since: timestamp, expiresAt: timestamp } }` yapısına çevrilebilir (özellikle CE/TİTCK gibi süreli belgeler için)
- **Belge yenilenme uyarısı** — bir belgenin geçerlilik süresi yaklaşırken kullanıcıyı bilgilendirme; backend cron + email/push bildirim gerektirir
- **AI Yasal Öneri'nin Claude API ile dinamik üretimi** — şu an statik template metin; backend bağlanınca `analyzeProduct` benzeri bir `analyzeLegalCompliance` endpoint eklenebilir

**Test akışı (uçtan uca):**
1. Login → Trend Radar → bir elektronik ürün → **⚖️ Yasal** butonu
2. Yasal Kontrol açılır: form pre-filled (link + Elektronik kategorisi), hint "📡 Trend Radar'dan link yüklendi — Trendyol. Otomatik analiz başlatılıyor…", 220ms sonra slide-down açılır
3. Slide-down içinde: ürün başlığı → BELGE GEREKLİ (sarı) + AI Skoru ~38 → 8 belge kartı (CE/BTK/RED/AEEE zorunlu, LVD/EMC/UN38.3/Garanti önerilir, toplam ~₺73K-₺175K)
4. CE kartında "+ Belgem var" → modal: ikon + ad + onay metni + kabul checkbox
5. Checkbox işaretle → Onayla butonu aktif olur → tıkla → ~500ms-2s Firestore yazma → modal kapanır
6. CE kartı yeşilleşir, ✓ HESABINIZDA VAR rozeti, AI puanı +12 zıplar (38 → 50)
7. Aynı şekilde BTK, RED, AEEE'yi onayla → tüm zorunlular tamamlanınca risk SAFE (yeşil), AI puanı 90+, advice "✓ Tüm belgeler hesabınızda mevcut"
8. Profil sayfasına git → Firestore'da `users/{uid}.legalDocuments: { ce:true, btk:true, red:true, aeee:true }` saklanır
9. Trend Radar'a dön → başka bir elektronik ürün → **⚖️ Yasal** → yeni analizde aynı 4 belge **otomatik yeşil ✓ VAR** olarak gelir, AI puanı baştan yüksek
10. Sidebar Yasal Kontrol → boş form + empty state ("⚖️ Ürün linkini yapıştır, analize başlayalım") → manuel link yapıştır → ⚖️ Kontrol Et → slide-down aynı şekilde açılır

**Sıradaki seçenekler:**
1. Backend `analyze-legal` endpoint — Apify ürün scraping + Claude AI yasal yorum
2. Profilde "Belgelerim" bölümü — kullanıcının onayladığı tüm belgelerin listesi + tek tıkla kaldırma
3. Belge geçerlilik tarihi takibi (CE/TİTCK gibi süreli belgeler için)
4. iyzico/PayTR/Param entegrasyonu (Task #13) — provider seçilince
5. USD→TRY dinamik kur cron'u (Net Kâr için)
6. Apify hesabı açıldığında actor ID rotate

**Deploy:** `firebase deploy --only hosting` (functions değişmedi)
