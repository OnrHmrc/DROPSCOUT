// ─────────────────────────────────────────────────────────
// DropScout TR — Gap Radar endpoint (Asya domestic kaynaklar)
// Mimari: docs/architecture.md §5
//
// GET /api/gap-radar?category=<categoryId>
// → Business plan gerektirir (router'da gate'lendi)
// → 5 adımlı pipeline çalıştırır (lib/gapPipeline)
// → cache/gapRadar/items/{categoryId} 7g TTL
// → Response: { snapshot, cached }
// ─────────────────────────────────────────────────────────

import type { Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type PlanRequest, consumeQuota, refundQuota } from '../middleware/plan';
import '../lib/firebase-admin';
import { TRACKED_CATEGORIES } from '../lib/trends';
import { runGapPipeline, type PipelineResult } from '../lib/gapPipeline';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

export interface GapRadarSnapshot extends PipelineResult {
  categoryName: string;
}

export async function getGapRadarHandler(req: PlanRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const categoryId = String(req.query.category || '').trim();
  if (!categoryId) {
    res.status(400).json({ error: 'invalid_input', message: 'category parametresi gerekli' });
    return;
  }

  const cat = TRACKED_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) {
    res.status(400).json({
      error: 'unknown_category',
      message: `Bilinmeyen kategori: ${categoryId}`,
      available: TRACKED_CATEGORIES.map((c) => c.id)
    });
    return;
  }

  const db = getFirestore();
  const docRef = db.collection('cache').doc('gapRadar').collection('items').doc(cat.id);

  // Cache hit
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data() as { snapshot?: GapRadarSnapshot; expiresAt?: Timestamp };
    const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
    if (data.snapshot && expiresAtMs > Date.now()) {
      res.json({ snapshot: data.snapshot, cached: true });
      return;
    }
  }

  // Cache miss → kota tüket, sonra pipeline çalıştır.
  // Pipeline fail olursa refund. Plan zaten requirePlan('business') ile garanti.
  const plan = req.plan ?? 'business';
  const consume = await consumeQuota(uid, 'gapRadar', plan);
  if (!consume.ok) {
    res.status(429).json({
      error: consume.reason ?? 'quota_exceeded',
      message:
        consume.reason === 'cost_cap_reached'
          ? 'Aylık maliyet üst sınırına ulaşıldı. Lütfen sonraki ay dönemini bekleyin veya destek ile iletişime geçin.'
          : 'Gap Radar aylık kotanız doldu',
      ...consume
    });
    return;
  }

  let snapshot: GapRadarSnapshot;
  try {
    const result = await runGapPipeline({
      categoryId: cat.id,
      categoryName: cat.name,
      query: cat.query
    });
    snapshot = { ...result, categoryName: cat.name };
  } catch (err) {
    await refundQuota(uid, 'gapRadar');
    console.error('[gapRadar] pipeline hatası', {
      categoryId: cat.id,
      error: err instanceof Error ? err.message : String(err)
    });
    res.status(502).json({
      error: 'pipeline_failed',
      message: 'Gap Radar veri toplama hatası, daha sonra tekrar dene'
    });
    return;
  }

  await docRef.set({
    snapshot,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
    uid
  });

  res.json({ snapshot, cached: false });
}
