import type { Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import {
  generateProductInsight,
  type ProductInput,
  type ProductInsight
} from '../lib/claude';
import { getUserPlan, consumeQuota, refundQuota } from '../middleware/plan';
import { type MeterId, monthKey } from '../lib/plans';

type AnalyzeSource = 'manual_url' | 'store_product';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashInput(input: ProductInput): string {
  const canonical = JSON.stringify({
    url: input.url ?? '',
    platform: input.platform ?? '',
    category: input.category ?? '',
    salePrice: input.salePrice ?? null,
    cost: input.cost ?? null,
    dropScore: input.dropScore ?? null,
    marginPct: input.marginPct ?? null,
    competitorCount: input.competitorCount ?? null,
    monthlySales: input.monthlySales ?? null,
    trend: input.trend ?? ''
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateInput(body: unknown): ProductInput | string {
  if (!body || typeof body !== 'object') return 'Gövde geçersiz, JSON obje bekleniyor';
  const b = body as Record<string, unknown>;

  const input: ProductInput = {};

  if (b.productId !== undefined) {
    if (typeof b.productId !== 'string') return 'productId metin olmalı';
    input.productId = b.productId;
  }
  if (b.url !== undefined) {
    if (typeof b.url !== 'string') return 'url metin olmalı';
    input.url = b.url;
  }
  if (b.platform !== undefined) {
    if (typeof b.platform !== 'string') return 'platform metin olmalı';
    input.platform = b.platform;
  }
  if (b.category !== undefined) {
    if (typeof b.category !== 'string') return 'category metin olmalı';
    input.category = b.category;
  }
  if (b.trend !== undefined) {
    if (typeof b.trend !== 'string') return 'trend metin olmalı';
    input.trend = b.trend;
  }

  const numericFields: Array<keyof ProductInput> = [
    'salePrice', 'cost', 'dropScore', 'marginPct', 'competitorCount', 'monthlySales'
  ];
  for (const field of numericFields) {
    const v = b[field];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !isFinite(v)) return `${field} geçerli bir sayı olmalı`;
    (input as Record<string, unknown>)[field] = v;
  }

  if (!input.platform) return 'platform alanı gerekli';
  if (!input.category) return 'category alanı gerekli';

  return input;
}

function resolveSource(body: unknown, input: ProductInput): AnalyzeSource {
  const b = (body as Record<string, unknown>) || {};
  if (b.source === 'manual_url' || b.source === 'store_product') return b.source;
  return input.productId ? 'store_product' : 'manual_url';
}

function meterForSource(source: AnalyzeSource): MeterId {
  return source === 'store_product' ? 'storeProductAnalysis' : 'linkAnalysis';
}

export async function analyzeProductHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const validated = validateInput(req.body);
  if (typeof validated === 'string') {
    res.status(400).json({ error: 'invalid_input', message: validated });
    return;
  }

  const source = resolveSource(req.body, validated);
  const meter = meterForSource(source);

  const resolvedPlan = await getUserPlan(uid);
  const productHash = hashInput(validated);
  const db = getFirestore();
  const docRef = db.collection('cache').doc('insights').collection('items').doc(productHash);

  // Cache hit → kota tuketme, serbest gecis
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data() as { insight?: ProductInsight; expiresAt?: Timestamp };
    const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
    if (data.insight && expiresAtMs > Date.now()) {
      res.json({
        insight: data.insight,
        cached: true,
        productHash,
        source,
        plan: resolvedPlan.plan
      });
      return;
    }
  }

  // Cache miss → kota tuket (Claude cagrisi yapilacak)
  const quota = await consumeQuota(uid, meter, resolvedPlan.plan);
  if (!quota.ok) {
    res.status(429).json({
      error: 'quota_exceeded',
      reason: quota.reason,
      meter,
      source,
      plan: resolvedPlan.plan,
      usedDaily: quota.usedDaily,
      usedMonthly: quota.usedMonthly,
      limitDaily: quota.limitDaily,
      limitMonthly: quota.limitMonthly,
      message:
        quota.reason === 'daily_quota_exceeded'
          ? 'Bugünkü analiz hakkınız doldu. Yarın tekrar deneyebilir ya da planınızı yükseltebilirsiniz.'
          : quota.reason === 'monthly_quota_exceeded'
          ? 'Bu ayki analiz hakkınız doldu. Ay sonuna kadar eklenecek ürünler için planınızı yükseltebilirsiniz.'
          : 'Bu özellik mevcut planınıza dahil değil. Planınızı yükseltmeniz gerekiyor.'
    });
    return;
  }

  try {
    const { insight, usage } = await generateProductInsight(validated);

    console.log('[analyzeProduct] tokens', {
      uid,
      hash: productHash.slice(0, 12),
      source,
      meter,
      plan: resolvedPlan.plan,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens
    });

    await docRef.set({
      insight,
      input: validated,
      usage,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      uid
    });

    // Aylik token kullanim agregasyonu (maliyet izleme)
    try {
      const monthlyRef = db
        .collection('users')
        .doc(uid)
        .collection('usageMonthly')
        .doc(monthKey());
      await monthlyRef.set(
        {
          tokens: {
            input: FieldValue.increment(usage.input_tokens || 0),
            output: FieldValue.increment(usage.output_tokens || 0),
            cacheRead: FieldValue.increment(usage.cache_read_input_tokens || 0),
            cacheCreation: FieldValue.increment(usage.cache_creation_input_tokens || 0),
            calls: FieldValue.increment(1)
          },
          lastTokenUpdate: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[analyzeProduct] token agregasyonu yazilamadi', err);
    }

    res.json({
      insight,
      cached: false,
      productHash,
      source,
      plan: resolvedPlan.plan,
      quota: {
        usedDaily: quota.usedDaily,
        usedMonthly: quota.usedMonthly,
        remainingDaily: quota.remainingDaily,
        remainingMonthly: quota.remainingMonthly
      }
    });
  } catch (err) {
    // Claude hatasi → kotayi geri ver
    await refundQuota(uid, meter);
    console.error('[analyzeProduct] hata', err);
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    res.status(500).json({ error: 'analyze_failed', message });
  }
}
