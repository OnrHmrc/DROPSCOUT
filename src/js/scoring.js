/* ══════════════════════════════════════════════════════════
   DropScout TR — DropScore Algoritmasi (kural tabanli)
   ══════════════════════════════════════════════════════════
   calculateNetProfit(input) → net kar & marj hesabi
   calculateDropScore(input) → 0–100 puan + kirilim + sinyal

   Girdi birimi TL, oranlar 0–100 arasinda yuzde olarak verilir.
*/

// ─── Kategori bazli varsayilan komisyon/KDV (platform vermediyse) ───
// Gercek API baglaninca bu degerler yerine mağaza/kategori verisi kullanilir.
export const DEFAULT_COMMISSION_BY_CATEGORY = {
  elektronik: 11,
  moda: 19,
  kozmetik: 17,
  'ev-yasam': 15,
  'anne-bebek': 14,
  spor: 14,
  kirtasiye: 15,
  supermarket: 10,
  otomotiv: 12,
  diger: 15
};

export const DEFAULT_VAT = 20; // %20 genel KDV

// ─── Net Kar Hesabi ───────────────────────────────────────────

/**
 * Net kar & marj hesabi.
 * @param {Object} p
 * @param {number} p.salePrice            KDV dahil satis fiyati (TL)
 * @param {number} p.cost                 Urun maliyeti (TL, KDV haric)
 * @param {number} [p.shipping=0]         Kargo bedeli, saticiya yansiyan (TL)
 * @param {number} [p.packaging=0]        Paketleme + etiket maliyeti (TL)
 * @param {number} [p.extraFee=0]         Sabit hizmet/islem bedeli (TL)
 * @param {number} [p.commission=15]      Platform komisyon orani (%)
 * @param {number} [p.vat=20]             Urun KDV orani (%)
 * @param {number} [p.commissionVat=20]   Komisyon uzerinden kesilen KDV (%)
 * @param {number} [p.withholding=0]      Stopaj orani, KDV haric fiyat uzerinden (%)
 * @returns {{priceExVat:number, commissionAmt:number, commissionVatAmt:number, vatAmt:number, withholdingAmt:number, netProfit:number, marginPct:number}}
 */
export function calculateNetProfit(p) {
  const salePrice     = toNum(p.salePrice);
  const cost          = toNum(p.cost);
  const shipping      = toNum(p.shipping);
  const packaging     = toNum(p.packaging);
  const extraFee      = toNum(p.extraFee);
  const commission    = toNum(p.commission, 15);
  const vat           = toNum(p.vat, DEFAULT_VAT);
  const commissionVat = toNum(p.commissionVat, 20);
  const withholding   = toNum(p.withholding, 0);

  // KDV haric satis fiyati
  const priceExVat = salePrice / (1 + vat / 100);
  // Komisyon KDV haric fiyat uzerinden alinir (Trendyol/HB standart yaklasimi)
  const commissionAmt = priceExVat * (commission / 100);
  // Komisyon KDV'si (platformun komisyona bindirdigi KDV)
  const commissionVatAmt = commissionAmt * (commissionVat / 100);
  // Stopaj (genellikle e-ticarette %1, KDV haric satis uzerinden)
  const withholdingAmt = priceExVat * (withholding / 100);
  // Saticinin odemesi gereken net KDV (satis - alis farki)
  const vatAmt = Math.max(0, (priceExVat - cost) * (vat / 100));

  const netProfit =
    priceExVat - commissionAmt - commissionVatAmt - cost - shipping - packaging - extraFee - withholdingAmt - vatAmt;
  const marginPct = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return {
    priceExVat: round2(priceExVat),
    commissionAmt: round2(commissionAmt),
    commissionVatAmt: round2(commissionVatAmt),
    vatAmt: round2(vatAmt),
    withholdingAmt: round2(withholdingAmt),
    netProfit: round2(netProfit),
    marginPct: round2(marginPct)
  };
}

// ─── DropScore (0-100) ────────────────────────────────────────

/**
 * DropScore hesabi. 4 kriter toplanir:
 *   Marj (0-40) + Rekabet (0-25) + Trend (0-20) + Talep (0-15)
 *
 * @param {Object} p
 * @param {number} p.salePrice
 * @param {number} p.cost
 * @param {number} [p.shipping]
 * @param {number} [p.commission]
 * @param {number} [p.vat]
 * @param {number} [p.extraFee]
 * @param {number} [p.competitorCount] Rakip satici sayisi (0-∞)
 * @param {'rising'|'stable'|'falling'} [p.trend='stable']
 * @param {number} [p.monthlySales]    Tahmini aylik satis adedi
 * @returns {{score:number, margin:Object, breakdown:Object, signal:'AL'|'DEGERLENDIR'|'UZAK'}}
 */
export function calculateDropScore(p) {
  const margin = calculateNetProfit(p);

  const marginScore     = scoreMargin(margin.marginPct);
  const competitionScore = scoreCompetition(p.competitorCount);
  const trendScore      = scoreTrend(p.trend);
  const demandScore     = scoreDemand(p.monthlySales);

  const total = marginScore + competitionScore + trendScore + demandScore;
  const score = clamp(Math.round(total), 0, 100);

  return {
    score,
    margin,
    breakdown: {
      margin: marginScore,          // 0-40
      competition: competitionScore, // 0-25
      trend: trendScore,            // 0-20
      demand: demandScore           // 0-15
    },
    signal: score >= 70 ? 'AL' : score >= 45 ? 'DEGERLENDIR' : 'UZAK'
  };
}

// ─── Kriter skorlari ──────────────────────────────────────────

// Marj skoru: %5 alti 0, %30 ve ustu 40. Arada lineer.
function scoreMargin(pct) {
  if (pct <= 5) return 0;
  if (pct >= 30) return 40;
  return Math.round(((pct - 5) / 25) * 40);
}

// Rekabet skoru: 0 rakip = 25, 100+ rakip = 0. Logaritmik.
function scoreCompetition(count) {
  const n = toNum(count, 20);
  if (n <= 0) return 25;
  if (n >= 200) return 0;
  // log tabani 200 → 0..1 → 25..0
  const x = Math.log(n + 1) / Math.log(201);
  return Math.round(25 * (1 - x));
}

function scoreTrend(trend) {
  switch (trend) {
    case 'rising':  return 20;
    case 'stable':  return 10;
    case 'falling': return 2;
    default:        return 10;
  }
}

// Talep skoru: 0 satis = 0, 500+ satis = 15. Logaritmik.
function scoreDemand(monthly) {
  const n = toNum(monthly, 0);
  if (n <= 0) return 0;
  if (n >= 500) return 15;
  const x = Math.log(n + 1) / Math.log(501);
  return Math.round(15 * x);
}

// ─── Yardimcilar ──────────────────────────────────────────────

function toNum(v, fallback = 0) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
