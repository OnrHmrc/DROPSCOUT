import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import '../lib/firebase-admin';
import { SENTRY_DSN, runWithSentry } from '../lib/sentry';
import { ALERT_WEBHOOK_URL } from '../lib/alerts';

const RETENTION_DAYS = 90;
const BATCH_SIZE = 400;
const MAX_BATCHES = 50;

/** "YYYY-MM-DD" string compare — string'ler ISO formatinda olduklari icin
 *  leksikografik kiyaslama tarihsel kiyaslamaya esit. */
function cutoffDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - RETENTION_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Haftalik cron — `users/{uid}/usageDaily/{YYYY-MM-DD}` icinde 90 gunden
 * eski belgeleri siler. Aylik (`usageMonthly`) belgelere dokunmaz —
 * onlar yillik analytics icin kalir.
 *
 * Strateji: collectionGroup('usageDaily') uzerinde 'date' field'ina gore
 * filter (consumeQuota her belgeye date stringi yaziyor). Composite index
 * gerektirmeyen single-field collectionGroup query.
 */
export const scheduledCleanupOldUsage = onSchedule(
  {
    schedule: 'every sunday 04:00',
    timeZone: 'Europe/Istanbul',
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 540,
    retryCount: 1,
    secrets: [SENTRY_DSN, ALERT_WEBHOOK_URL]
  },
  async () => runWithSentry('cleanupOldUsage', async () => {
    const startedAt = Date.now();
    const db = getFirestore();
    const cutoff = cutoffDateString();

    let totalDeleted = 0;
    let batches = 0;
    let lastBatchSize = BATCH_SIZE;

    while (lastBatchSize === BATCH_SIZE && batches < MAX_BATCHES) {
      const snap = await db
        .collectionGroup('usageDaily')
        .where('date', '<', cutoff)
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
    console.log('[scheduledCleanupOldUsage] report', {
      cutoff,
      retentionDays: RETENTION_DAYS,
      totalDeleted,
      batches,
      truncated: batches >= MAX_BATCHES && lastBatchSize === BATCH_SIZE,
      durationMs
    });
  })
);
