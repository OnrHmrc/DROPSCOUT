# DropScout TR

> **AI destekli ürün keşif ve karar destek platformu** — Türk dropshipping pazarı için.

[![Status](https://img.shields.io/badge/status-pre--launch-orange)](https://dropscoutapp.web.app/)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.x-brightgreen)](functions/package.json)
[![Region](https://img.shields.io/badge/region-europe--west1-blue)](firebase.json)

> Bu yazılım tescillidir; lisans için [`LICENSE`](LICENSE) dosyasına bakınız.

---

## Özellikler

- **Link Analizi** — Pazaryeri ürün URL'inden anlık DropScore + Claude Haiku içgörüsü ([dropscout.html](dropscout.html))
- **Trend Radar** — TR pazaryerleri × kategoriler × sıralama matrisi ([trend-radar.html](trend-radar.html))
- **Asya Gap Radar** *(Business)* — Çin/Kore/Japonya'da viral, TR'de yok olan ürünler ([gap-radar.html](gap-radar.html))
- **Tedarikçi Bul** *(Pro+)* — Alibaba/AliExpress kaynakları ([tedarikci-bul.html](tedarikci-bul.html))
- **Net Kâr Hesabı** — Buy Box ankerli 3 fiyat senaryosu ([net-kar.html](net-kar.html))
- **Yasal Kontrol** — Ürün kategorisine göre belge gereksinimi ([yasal-kontrol.html](yasal-kontrol.html))
- **Rakip Analizi** — Portföy içi karşılaştırma ([rakip-analizi.html](rakip-analizi.html))
- **Pazaryeri Bağlantıları** — Trendyol, Hepsiburada, N11, Amazon TR resmi Satıcı API'leri ([trendyol.html](trendyol.html))

---

## Stack

| Katman | Teknoloji |
|---|---|
| **Frontend** | Vite 6 + Vanilla JS (MPA, 17 sayfa), Firebase Auth, Firestore SDK |
| **Backend** | Firebase Functions 2nd gen (Node 22, TypeScript), Express, Admin SDK |
| **AI** | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| **Scraping** | Apify — Asya kaynakları (Douyin, Xiaohongshu, Taobao, Coupang, Rakuten, Mercari) + Tedarikçi |
| **Trends** | SerpAPI (Google Trends) |
| **Hosting** | Firebase Hosting + Cloud Functions (`europe-west1`) |
| **Şifreleme** | Google Cloud KMS envelope encryption (DEK + KEK, AES-256-GCM) |
| **Gözlem** | Sentry (frontend + backend), Cloud Logging |

---

## Geliştirme

### Ön gereksinim

- Node.js 22.x
- Firebase CLI (`npm i -g firebase-tools`)
- Google Cloud CLI (`gcloud`) — KMS keyring kurulumu için
- Firebase projesi: `dropscoutapp` (login: `firebase login`)

### Kurulum

```bash
# Bağımlılıklar
npm install
cd functions && npm install && cd ..

# Çevre değişkenleri (yerel)
cp .env.example .env.local
# .env.local'ı düzenle (frontend için)

# Backend secret'ları (bir kerelik) — bkz. .env.example
firebase functions:secrets:set CLAUDE_API_KEY
firebase functions:secrets:set SENTRY_DSN
firebase functions:secrets:set APIFY_TOKEN
firebase functions:secrets:set SERPAPI_KEY
# ... (.env.example tam liste)

# KMS keyring (bir kerelik) — bkz. .env.example
gcloud kms keyrings create dropscout-keys --location=europe-west1
gcloud kms keys create dropscout-credentials-kek \
  --keyring=dropscout-keys --location=europe-west1 \
  --purpose=encryption --rotation-period=90d \
  --next-rotation-time=$(date -u -d "+90 days" +%Y-%m-%dT%H:%M:%SZ)
```

### Yerel çalıştırma

```bash
# Terminal 1 — Firebase emulator (auth, firestore, functions)
firebase emulators:start

# Terminal 2 — Vite dev server (proxy /api → emulator)
npm run dev
```

Vite varsayılan olarak `/dropscout.html`'i açar. `/api/**` istekleri otomatik
olarak `http://127.0.0.1:5001/dropscoutapp/europe-west1/api`'ye proxy'lenir
([vite.config.js](vite.config.js)).

### Production build & deploy

```bash
# Build
npm run build                         # frontend → dist/
npm --prefix functions run build      # functions/src → functions/lib/

# Deploy (tüm hedefler)
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting

# Yalnız functions
firebase deploy --only functions:api
```

---

## Yapı

```
dropscout/
├── *.html                      → 17 sayfa MPA (Vite entry'leri)
├── src/
│   ├── js/                     → paylaşımlı modüller
│   │   ├── auth.js             → Firebase auth wrapper
│   │   ├── api.js              → /api/** fetch helper (auth header inject)
│   │   ├── plan.js             → frontend gateFeature, ensureQuota
│   │   ├── store.js            → ortak state
│   │   ├── sentry.js           → frontend hata izleme
│   │   ├── theme.js            → koyu/aydınlık tema
│   │   ├── sidebar.js          → navigasyon
│   │   ├── profile-bar.js      → topbar profil widget
│   │   ├── scoring.js          → DropScore hesabı (frontend cache)
│   │   ├── main.js             → ortak sayfa init
│   │   └── firebase-config.js  → Firebase web config
│   └── css/                    → paylaşımlı CSS (variables, components, ...)
├── functions/
│   └── src/
│       ├── index.ts            → Express app + cron exports
│       ├── endpoints/          → /api/* handler'ları
│       │   ├── analyzeProduct.ts
│       │   ├── trends.ts
│       │   ├── gapRadar.ts
│       │   ├── suppliers.ts
│       │   ├── platforms.ts
│       │   ├── payment.ts      ← (mount edilmeyi bekliyor)
│       │   ├── me.ts           → KVKK m.11 (data-export, delete-account)
│       │   └── health.ts
│       ├── middleware/
│       │   ├── auth.ts         → Firebase ID token doğrulama
│       │   ├── plan.ts         → plan, kota tüketimi, costCap
│       │   └── rateLimit.ts    → 60 req/dak/uid
│       ├── lib/
│       │   ├── claude.ts       → Anthropic SDK + tool-forced JSON
│       │   ├── crypto.ts       → KMS envelope encryption
│       │   ├── plans.ts        → Plan tanımları (tek kaynak)
│       │   ├── pricing.ts      → Token → USD maliyet hesabı
│       │   ├── apify.ts        → Apify aktör runner
│       │   ├── asianSources.ts → Asya kaynak normalleştirme
│       │   ├── gapPipeline.ts  → Asya Gap Radar boru hattı
│       │   ├── platforms/      → Pazaryeri Satıcı API client'ları
│       │   ├── payments/       → iyzico/mock adapter (interface)
│       │   ├── serpapi.ts      → Google Trends
│       │   ├── trends.ts       → Trend cache okuma
│       │   ├── alerts.ts       → Discord/Slack webhook
│       │   ├── sentry.ts       → Backend hata izleme
│       │   └── firebase-admin.ts
│       └── schedulers/         → cron job'ları
│           ├── syncActiveStores.ts
│           ├── cleanupCache.ts
│           └── cleanupOldUsage.ts
├── docs/architecture.md        → Mimari ve roadmap
├── firestore.rules             → Güvenlik kuralları
├── firestore.indexes.json
├── firebase.json               → Hosting + Functions + headers
├── vite.config.js
├── CLAUDE.md                   → Çalışma yönergeleri
└── CLAUDE.history.md           → Çalışma günlüğü (5+ ay)
```

---

## Mimari Özet

Detay: [`docs/architecture.md`](docs/architecture.md)

**Prensip:** Kullanıcı sayfa açtığında scraping/AI tetiklenmez. Cron'lar arka
planda Firestore cache'i tazeler; frontend cache'ten okur. Bu sayede:

- API maliyeti tahmin edilebilir (her cache hit'i $0)
- Kullanıcı UX'i hızlı (cold path < 100ms)
- Plan-tier'a göre cron sıklığı ayarlanır (Business: 6h, Pro: 12h, Start: 3 gün)

**Plan matrisi** ([functions/src/lib/plans.ts](functions/src/lib/plans.ts)):

| Plan | Aylık fiyat | Trial | Hard cost cap |
|---|---|---|---|
| Başlangıç (`start`) | 299 ₺ | 7 gün | $3 |
| Profesyonel (`pro`) | 699 ₺ | 7 gün | (bkz. plans.ts) |
| Business (`business`) | 1499 ₺ | 7 gün | (bkz. plans.ts) |

> Fiyatlar KDV dahil. Yıllık ödemede %20 indirim.

---

## Güvenlik

- **Şifreleme:** Pazaryeri credential'ları Google Cloud KMS envelope encryption ile
  (DEK + KEK, AES-256-GCM, key versioning `v: 2`). KEK rotation 90 günde bir
  KMS tarafında otomatik. ([crypto.ts](functions/src/lib/crypto.ts))
- **Plan / billing alanları** yalnız Admin SDK ile yazılabilir
  ([firestore.rules](firestore.rules)). Client self-upgrade yapamaz.
- **Rate limit:** 60 req/dak/uid (in-memory token bucket — Firestore tabanlı
  versiyona geçiş Faz 2 backlog'unda).
- **Auth:** Firebase ID token (`Authorization: Bearer <token>`).
- **Security headers:** CSP, HSTS, X-Frame-Options DENY, X-Content-Type, Referrer-Policy,
  Permissions-Policy ([firebase.json](firebase.json)).
- **Hard cost cap:** Plan başına aylık USD tavanı; bug/anormal kullanım için
  tampon ([plans.ts](functions/src/lib/plans.ts) → `costCapUsd`).

**Güvenlik açığı bildirimi:** `onurhmrc@hotmail.com`

---

## KVKK / KVK Hakları

Aşağıdaki haklar `/api/me/*` endpoint'leri üzerinden kullanılabilir
([me.ts](functions/src/endpoints/me.ts)):

- **Verimi indir** — `GET /api/me/data-export` (tüm kullanıcı verileri JSON)
- **Hesabımı sil** — `POST /api/me/delete-account` (Firestore recursive delete +
  Firebase Auth user delete)
- **Plan ve kullanım** — `GET /api/me/plan`, `GET /api/me/usage`

> Yasal belgeler (KVKK aydınlatma metni, gizlilik politikası, kullanım
> şartları, mesafeli satış sözleşmesi, ön bilgilendirme formu, çerez
> politikası) lansman öncesi yayımlanacaktır.

---

## Roadmap

Kısa özet — detay analiz raporundadır.

- **Faz 1 (lansman öncesi):** Yasal belgeler, ödeme provider mount, webhook
  idempotency, e-fatura, CORS, repo hijyeni
- **Faz 2 (stabilite/gözlem):** Test/CI, Firestore rules schema validation,
  Firestore-tabanlı rate limiter, PITR backup, structured logging, cost alert,
  staging env
- **Faz 3 (büyüme):** Transactional email, onboarding sequence, audit log,
  Pub/Sub fan-out scheduler, SEO, status page, referral, in-app notifications

---

## Lisans

Tüm hakları saklıdır © 2026 OnrHmrc. Bkz. [`LICENSE`](LICENSE).
