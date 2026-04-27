import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import '../lib/firebase-admin';
import { SENTRY_DSN, runWithSentry } from '../lib/sentry';
import { ALERT_WEBHOOK_URL } from '../lib/alerts';

const BATCH_SIZE = 400;
const MAX_BATCHES = 25;

export const scheduledCleanupCache = onSchedule(
  {
    schedule: 'every monday 03:00',
    timeZone: 'Europe/Istanbul',
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 300,
    retryCount: 1,
    secrets: [SENTRY_DSN, ALERT_WEBHOOK_URL]
  },
  async () => runWithSentry('cleanupCache', async () => {
    const startedAt = Date.now();
    const db = getFirestore();
    const now = Timestamp.now();
    const collection = db.collection('cache').doc('insights').collection('items');

    let totalDeleted = 0;
    let batches = 0;
    let lastBatchSize = BATCH_SIZE;

    while (lastBatchSize === BATCH_SIZE && batches < MAX_BATCHES) {
      const snap = await collection
        .where('expiresAt', '<', now)
        .limit(BATCH_SIZE)
        .get();

      lastBatchSize = snap.size;
      if (lastBatchSize === 0) break;

      const writer = db.bulkWriter();
      snap.docs.forEach((doc) => writer.delete(doc.ref));
      await writer.close();

      totalDeleted += lastBatchSize;
      batches += 1;
    }

    const durationMs = Date.now() - startedAt;
    console.log('[scheduledCleanupCache] report', {
      collection: 'cache/insights/items',
      totalDeleted,
      batches,
      truncated: batches >= MAX_BATCHES && lastBatchSize === BATCH_SIZE,
      durationMs
    });
  })
);
