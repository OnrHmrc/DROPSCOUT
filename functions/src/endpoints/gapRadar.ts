import type { Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { PlanRequest } from '../middleware/plan';
import '../lib/firebase-admin';
import { TRACKED_CATEGORIES } from '../lib/trends';
import { hasApifyToken, requireGapActorId, runActorSync } from '../lib/apify';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface GapRadarItem {
  productName: string;
  category: string;
  avgPrice: number;
  estimatedMonthlySales: number;
  competitorCount: number;
  opportunityScore: number; // 0-100
  keywords: string[];
  sampleUrls: string[];
  source: 'apify' | 'placeholder';
}

export interface GapRadarSnapshot {
  categoryId: string;
  categoryName: string;
  fetchedAt: number;
  items: GapRadarItem[];
  source: 'apify' | 'placeholder';
}

interface ApifyGapInput {
  category: string;
  query: string;
  marketplace: 'trendyol' | 'hepsiburada' | 'n11';
  maxItems: number;
}

function placeholderSnapshot(cat: typeof TRACKED_CATEGORIES[number]): GapRadarSnapshot {
  const seed = cat.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rand = (n: number) => Math.abs(Math.sin(seed * (n + 1))) ;

  const items: GapRadarItem[] = Array.from({ length: 8 }).map((_, i) => ({
    productName: `${cat.name} trend ürünü #${i + 1}`,
    category: cat.name,
    avgPrice: Math.round(80 + rand(i) * 400),
    estimatedMonthlySales: Math.round(200 + rand(i + 7) * 1800),
    competitorCount: Math.round(3 + rand(i + 13) * 40),
    opportunityScore: Math.round(55 + rand(i + 21) * 40),
    keywords: [cat.query, `ucuz ${cat.query}`, `toptan ${cat.query}`].slice(0, 3),
    sampleUrls: [],
    source: 'placeholder'
  }));

  return {
    categoryId: cat.id,
    categoryName: cat.name,
    fetchedAt: Date.now(),
    items,
    source: 'placeholder'
  };
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

  // Cache miss → Apify veya placeholder
  let snapshot: GapRadarSnapshot;
  if (hasApifyToken()) {
    try {
      const actorId = requireGapActorId();
      const input: ApifyGapInput = {
        category: cat.name,
        query: cat.query,
        marketplace: 'trendyol',
        maxItems: 20
      };
      const items = await runActorSync<ApifyGapInput, GapRadarItem>(actorId, input, {
        timeoutSecs: 180,
        maxItems: 20
      });
      snapshot = {
        categoryId: cat.id,
        categoryName: cat.name,
        fetchedAt: Date.now(),
        items: items.map((it) => ({ ...it, source: 'apify' as const })),
        source: 'apify'
      };
    } catch (err) {
      console.warn('[gapRadar] Apify basarisiz, placeholder', {
        category: cat.id,
        error: err instanceof Error ? err.message : String(err)
      });
      snapshot = placeholderSnapshot(cat);
    }
  } else {
    snapshot = placeholderSnapshot(cat);
  }

  await docRef.set({
    snapshot,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
    uid
  });

  res.json({ snapshot, cached: false });
}
