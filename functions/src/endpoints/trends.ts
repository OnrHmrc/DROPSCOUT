import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import { getUserPlan } from '../middleware/plan';
import { PLANS } from '../lib/plans';
import { selectForTier, TRACKED_CATEGORIES, type TrendSnapshot } from '../lib/trends';

/**
 * GET /api/trends?category=elektronik
 * GET /api/trends            (tum kategoriler ozet)
 *
 * Plan tier'ina gore farkli tazelikteki snapshot'i doner:
 *   business → en taze (her 6h)
 *   pro      → ~24h gecikme
 *   start    → ~72h gecikme
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
      res.status(404).json({
        error: 'category_not_found',
        category: requestedCategory,
        message: 'Bu kategori henüz takip edilmiyor'
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
      snapshot: tierSnapshot,
      products: tierSnapshot?.products ?? null
    });
    return;
  }

  // Tum kategoriler ozet
  const snap = await collection.get();
  const items: Array<{
    category: string;
    categoryName: string;
    snapshot: TrendSnapshot | null;
  }> = [];
  for (const doc of snap.docs) {
    const data = doc.data() as {
      categoryName?: string;
      history?: TrendSnapshot[];
    };
    items.push({
      category: doc.id,
      categoryName: data.categoryName ?? doc.id,
      snapshot: selectForTier(data.history || [], tier)
    });
  }

  // Henuz cron calismadiysa veya hicbir snapshot yoksa, kategori listesini
  // bos snapshot'larla don (frontend "yakinda" gosterebilir)
  if (!items.length) {
    for (const cat of TRACKED_CATEGORIES) {
      items.push({ category: cat.id, categoryName: cat.name, snapshot: null });
    }
  }

  res.json({
    tier,
    plan: resolvedPlan.plan,
    items
  });
}
