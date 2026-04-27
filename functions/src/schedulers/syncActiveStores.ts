import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import '../lib/firebase-admin';
import { decryptJSON, ENCRYPTION_KEY } from '../lib/crypto';
import {
  getAdapter,
  isPlatformId,
  type PlatformCredentials
} from '../lib/platforms';
import { SENTRY_DSN, runWithSentry, captureError, notifyPartialFailure } from '../lib/sentry';
import { ALERT_WEBHOOK_URL } from '../lib/alerts';

const MAX_STORES_PER_TICK = 50;
const PER_STORE_TIMEOUT_MS = 25_000;

interface SyncEntry {
  time: string;
  text: string;
  date: string;
}

function buildLogEntry(text: string): SyncEntry {
  const d = new Date();
  return {
    time: d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    text,
    date: d.toISOString()
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Zaman aşımı (${ms}ms)`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export const scheduledSyncActiveStores = onSchedule(
  {
    schedule: 'every 4 hours',
    timeZone: 'Europe/Istanbul',
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [ENCRYPTION_KEY, SENTRY_DSN, ALERT_WEBHOOK_URL],
    retryCount: 0
  },
  async () => runWithSentry('syncActiveStores', async () => {
    const startedAt = Date.now();
    const db = getFirestore();

    const snap = await db
      .collectionGroup('platforms')
      .where('connected', '==', true)
      .orderBy('lastSyncAt', 'asc')
      .limit(MAX_STORES_PER_TICK)
      .get();

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    const failures: Array<{ path: string; reason: string }> = [];

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const platform = typeof data.platform === 'string' ? data.platform : doc.id;

      if (!isPlatformId(platform)) {
        skipped += 1;
        continue;
      }
      if (!data.credentialsEncrypted) {
        skipped += 1;
        continue;
      }

      try {
        const creds = decryptJSON<PlatformCredentials>(data.credentialsEncrypted as never);
        const adapter = getAdapter(platform);
        const storeName = typeof data.storeName === 'string' ? data.storeName : undefined;

        const store = await withTimeout(
          adapter.fetchStore(creds, storeName),
          PER_STORE_TIMEOUT_MS
        );

        const entry = buildLogEntry(
          `<strong>Otomatik senkron tamamlandı.</strong> ${store.totalProducts} ürün, ${store.categories.length} kategori güncellendi.`
        );
        const previous = Array.isArray(data.syncHistory) ? (data.syncHistory as SyncEntry[]) : [];
        const history = [entry, ...previous].slice(0, 10);

        await doc.ref.update({
          store,
          syncHistory: history,
          updatedAt: FieldValue.serverTimestamp(),
          lastSyncAt: FieldValue.serverTimestamp(),
          lastAutoSyncAt: FieldValue.serverTimestamp(),
          lastAutoSyncStatus: 'ok',
          lastAutoSyncError: FieldValue.delete()
        });
        succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
        failed += 1;
        failures.push({ path: doc.ref.path, reason: message });

        try {
          await doc.ref.update({
            lastAutoSyncAt: FieldValue.serverTimestamp(),
            lastAutoSyncStatus: 'error',
            lastAutoSyncError: message.slice(0, 500)
          });
        } catch {
          // best-effort error annotation
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log('[scheduledSyncActiveStores] report', {
      candidates: snap.size,
      succeeded,
      failed,
      skipped,
      truncated: snap.size === MAX_STORES_PER_TICK,
      durationMs,
      lastSyncAtCursor: snap.size
        ? (snap.docs[snap.size - 1].get('lastSyncAt') as Timestamp | undefined)?.toMillis?.() ?? null
        : null
    });

    if (failures.length) {
      console.warn('[scheduledSyncActiveStores] failures', failures);
      // Her bir store hatasini ayri Sentry event'i olarak yolla
      for (const f of failures) {
        captureError(new Error(`syncActiveStores: ${f.reason}`), {
          scheduler: 'syncActiveStores',
          storePath: f.path
        });
      }
      // Webhook'a tek toplu alert
      notifyPartialFailure('syncActiveStores', failed, snap.size, failures);
    }
  })
);
