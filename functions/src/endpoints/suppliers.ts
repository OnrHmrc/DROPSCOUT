import type { Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import { getUserPlan, consumeQuota, refundQuota } from '../middleware/plan';
import { hasApifyToken, requireSupplierActorId, runActorSync } from '../lib/apify';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SupplierItem {
  platform: 'aliexpress' | '1688' | 'alibaba' | 'other';
  title: string;
  url: string;
  priceUsd: number;
  moq: number; // min order qty
  rating: number; // 0-5
  supplierName: string;
  shippingDays: number;
  imageUrl?: string;
  source: 'apify' | 'placeholder';
}

export interface SupplierSearchInput {
  query: string;
  maxItems?: number;
}

interface ApifySupplierInput {
  keyword: string;
  platform: string;
  maxItems: number;
}

function validateInput(body: unknown): SupplierSearchInput | string {
  if (!body || typeof body !== 'object') return 'Gövde geçersiz, JSON obje bekleniyor';
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query.trim() : '';
  if (!query) return 'query alanı gerekli';
  if (query.length > 200) return 'query en fazla 200 karakter';
  const maxItems = typeof b.maxItems === 'number' && isFinite(b.maxItems)
    ? Math.max(1, Math.min(50, Math.round(b.maxItems)))
    : 20;
  return { query, maxItems };
}

function hashQuery(input: SupplierSearchInput): string {
  return createHash('sha256').update(JSON.stringify({ q: input.query.toLowerCase(), m: input.maxItems })).digest('hex');
}

function placeholderSuppliers(input: SupplierSearchInput): SupplierItem[] {
  const seed = input.query.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rand = (n: number) => Math.abs(Math.sin(seed * (n + 1)));
  return Array.from({ length: Math.min(8, input.maxItems || 8) }).map((_, i) => ({
    platform: (i % 3 === 0 ? '1688' : 'aliexpress') as SupplierItem['platform'],
    title: `${input.query} - tedarikçi örneği #${i + 1}`,
    url: '#',
    priceUsd: Math.round((2 + rand(i) * 25) * 100) / 100,
    moq: Math.round(10 + rand(i + 5) * 200),
    rating: Math.round((3 + rand(i + 11) * 2) * 10) / 10,
    supplierName: `Örnek Üretici ${i + 1}`,
    shippingDays: Math.round(7 + rand(i + 17) * 25),
    source: 'placeholder'
  }));
}

export async function searchSuppliersHandler(req: AuthRequest, res: Response): Promise<void> {
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

  const resolvedPlan = await getUserPlan(uid);
  const queryHash = hashQuery(validated);
  const db = getFirestore();
  const docRef = db.collection('cache').doc('suppliers').collection('items').doc(queryHash);

  // Cache hit → kota tuketme
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data() as { items?: SupplierItem[]; expiresAt?: Timestamp };
    const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
    if (data.items && expiresAtMs > Date.now()) {
      res.json({
        items: data.items,
        cached: true,
        queryHash,
        plan: resolvedPlan.plan
      });
      return;
    }
  }

  // Cache miss → kota tuket
  const quota = await consumeQuota(uid, 'supplier', resolvedPlan.plan);
  if (!quota.ok) {
    res.status(429).json({
      error: 'quota_exceeded',
      reason: quota.reason,
      meter: 'supplier',
      plan: resolvedPlan.plan,
      usedMonthly: quota.usedMonthly,
      limitMonthly: quota.limitMonthly,
      message:
        quota.reason === 'feature_not_in_plan'
          ? 'Tedarikçi Bul özelliği mevcut planınızda yok. Pro veya Business plana geçin.'
          : 'Bu ayki tedarikçi arama hakkınız doldu.'
    });
    return;
  }

  try {
    let items: SupplierItem[];
    let source: 'apify' | 'placeholder' = 'placeholder';

    if (hasApifyToken()) {
      try {
        const actorId = requireSupplierActorId();
        const input: ApifySupplierInput = {
          keyword: validated.query,
          platform: 'aliexpress',
          maxItems: validated.maxItems || 20
        };
        const apifyItems = await runActorSync<ApifySupplierInput, SupplierItem>(actorId, input, {
          timeoutSecs: 180,
          maxItems: validated.maxItems
        });
        items = apifyItems.map((it) => ({ ...it, source: 'apify' as const }));
        source = 'apify';
      } catch (err) {
        console.warn('[suppliers] Apify basarisiz, placeholder', {
          query: validated.query,
          error: err instanceof Error ? err.message : String(err)
        });
        items = placeholderSuppliers(validated);
      }
    } else {
      items = placeholderSuppliers(validated);
    }

    await docRef.set({
      items,
      query: validated.query,
      source,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      uid
    });

    res.json({
      items,
      cached: false,
      queryHash,
      plan: resolvedPlan.plan,
      source
    });
  } catch (err) {
    // Kullanici hata aldi — kota iade
    await refundQuota(uid, 'supplier');
    throw err;
  }
}
