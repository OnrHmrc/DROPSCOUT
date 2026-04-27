import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import '../lib/firebase-admin';
import {
  TRACKED_CATEGORIES,
  fetchTrendForCategory,
  type TrendSnapshot
} from '../lib/trends';
import { SERPAPI_KEY, hasSerpApiKey } from '../lib/serpapi';
import {
  APIFY_TOKEN,
  APIFY_TRENDYOL_ACTOR_ID,
  APIFY_HEPSIBURADA_ACTOR_ID,
  APIFY_N11_ACTOR_ID,
  APIFY_AMAZON_TR_ACTOR_ID
} from '../lib/apify';
import { SENTRY_DSN, runWithSentry, captureError, notifyPartialFailure } from '../lib/sentry';
import { ALERT_WEBHOOK_URL } from '../lib/alerts';

const HISTORY_LIMIT = 30;
const PER_CATEGORY_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout (${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Her 6 saatte bir Trend Radar verisi tazele.
 *   business tier → her tick'in tazesini okur
 *   pro tier      → ~24h yasli snapshot
 *   start tier    → ~72h yasli snapshot
 * Tek cron, tek SerpAPI cagrisi — tier'a gore frontend gosterir.
 *
 * SerpAPI key gelene kadar fetcher placeholder data uretir;
 * yapay degisken-deterministik seri.
 */
export const scheduledRefreshTrends = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'Europe/Istanbul',
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 1,
    secrets: [
      SENTRY_DSN,
      ALERT_WEBHOOK_URL,
      SERPAPI_KEY,
      APIFY_TOKEN,
      APIFY_TRENDYOL_ACTOR_ID,
      APIFY_HEPSIBURADA_ACTOR_ID,
      APIFY_N11_ACTOR_ID,
      APIFY_AMAZON_TR_ACTOR_ID
    ]
  },
  async () => runWithSentry('refreshTrends', async () => {
    const startedAt = Date.now();
    const db = getFirestore();
    const collection = db.collection('cache').doc('trends').collection('items');

    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ category: string; reason: string }> = [];

    for (const cat of TRACKED_CATEGORIES) {
      try {
        const fresh = await withTimeout(
          fetchTrendForCategory(cat),
          PER_CATEGORY_TIMEOUT_MS,
          `fetchTrend(${cat.id})`
        );

        const ref = collection.doc(cat.id);
        const snap = await ref.get();
        const prevHistory = (snap.exists ? (snap.data()?.history as TrendSnapshot[]) : null) || [];
        const history = [fresh, ...prevHistory].slice(0, HISTORY_LIMIT);

        await ref.set(
          {
            categoryId: cat.id,
            categoryName: cat.name,
            query: cat.query,
            current: fresh,
            history,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        succeeded += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Bilinmeyen hata';
        failed += 1;
        failures.push({ category: cat.id, reason });
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log('[scheduledRefreshTrends] report', {
      categories: TRACKED_CATEGORIES.length,
      succeeded,
      failed,
      source: hasSerpApiKey() ? 'serpapi' : 'placeholder',
      durationMs
    });
    if (failures.length) {
      console.warn('[scheduledRefreshTrends] failures', failures);
      for (const f of failures) {
        captureError(new Error(`refreshTrends: ${f.reason}`), {
          scheduler: 'refreshTrends',
          category: f.category
        });
      }
      notifyPartialFailure('refreshTrends', failed, TRACKED_CATEGORIES.length, failures);
    }
  })
);
