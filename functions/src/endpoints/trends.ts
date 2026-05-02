import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import { getUserPlan } from '../middleware/plan';
import { PLANS } from '../lib/plans';
import { selectForTier, TRACKED_CATEGORIES, type TrendSnapshot } from '../lib/trends';

const PENDING_MESSAGE =
  'Bu kategori için araştırma başlatıldı, tamamlandığında bilgilendirileceksiniz.';

/**
 * GET /api/trends?category=elektronik
 * GET /api/trends            (tüm kategoriler özet)
 *
 * Yeni mimari (2026-04-28): Trend Radar verisi resmi Satıcı API'leri +
 * anonim kullanıcı havuzundan beslenir. Havuz hazır olana kadar
 * snapshot yok, response status='pending'. Frontend bu durumda
 * "araştırma başlatıldı" mesajı / mock fallback gösterir.
 */
export async function getTrendsHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const resolvedPlan = await getUserPlan(uid);
  const tier = PLANS[resolvedPlan.plan].features.trendRadar;
  const db = getFirestore();
  const collection = db.collection('cache').doc('trends').collection('items');

  const requestedCategory = typeof req.query.category === 'string' ? req.query.category : null;

  if (requestedCategory) {
    const ref = collection.doc(requestedCategory);
    const snap = await ref.get();
    if (!snap.exists) {
      const known = TRACKED_CATEGORIES.find((c) => c.id === requestedCategory);
      res.json({
        category: requestedCategory,
        categoryName: known?.name ?? requestedCategory,
        tier,
        plan: resolvedPlan.plan,
        status: 'pending',
        message: PENDING_MESSAGE,
        snapshot: null
      });
      return;
    }
    const data = snap.data() as {
      categoryName?: string;
      history?: TrendSnapshot[];
      current?: TrendSnapshot;
    };
    const tierSnapshot = selectForTier(data.history || [], tier);
    res.json({
      category: requestedCategory,
      categoryName: data.categoryName ?? requestedCategory,
      tier,
      plan: resolvedPlan.plan,
      status: tierSnapshot ? 'ready' : 'pending',
      message: tierSnapshot ? null : PENDING_MESSAGE,
      snapshot: tierSnapshot
    });
    return;
  }

  // Tüm kategoriler özet
  const snap = await collection.get();
  const items: Array<{
    category: string;
    categoryName: string;
    status: 'ready' | 'pending';
    snapshot: TrendSnapshot | null;
  }> = [];

  const seen = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() as {
      categoryName?: string;
      history?: TrendSnapshot[];
    };
    const tierSnapshot = selectForTier(data.history || [], tier);
    items.push({
      category: doc.id,
      categoryName: data.categoryName ?? doc.id,
      status: tierSnapshot ? 'ready' : 'pending',
      snapshot: tierSnapshot
    });
    seen.add(doc.id);
  }

  // Henüz hiç yazı yoksa veya bazı kategoriler eksikse, takip listesini doldur
  for (const cat of TRACKED_CATEGORIES) {
    if (!seen.has(cat.id)) {
      items.push({
        category: cat.id,
        categoryName: cat.name,
        status: 'pending',
        snapshot: null
      });
    }
  }

  const allPending = items.every((it) => it.status === 'pending');
  res.json({
    tier,
    plan: resolvedPlan.plan,
    status: allPending ? 'pending' : 'ready',
    message: allPending ? PENDING_MESSAGE : null,
    items
  });
}
