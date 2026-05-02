import type { Response } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import {
  encryptJSON,
  decryptJSON,
  type EncryptedPayload
} from '../lib/crypto';
import {
  getAdapter,
  isPlatformId,
  type PlatformCredentials,
  type PlatformStoreSnapshot
} from '../lib/platforms';
import { getUserPlan } from '../middleware/plan';
import { PLANS } from '../lib/plans';

interface SyncEntry {
  time: string;
  text: string;
  date: string;
}

interface StoredPlatform {
  platform: string;
  connected: boolean;
  storeName: string;
  credentialsEncrypted: EncryptedPayload;
  store: PlatformStoreSnapshot;
  syncHistory: SyncEntry[];
}

function buildLogEntry(text: string): SyncEntry {
  const d = new Date();
  return {
    time: d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    text,
    date: d.toISOString()
  };
}

function readPlatformFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const v = (body as Record<string, unknown>).platform;
  return typeof v === 'string' ? v : null;
}

export async function connectPlatformHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown> | null;
  const platform = readPlatformFromBody(body);
  if (!isPlatformId(platform)) {
    res.status(400).json({
      error: 'invalid_platform',
      message: 'platform alanı trendyol | hepsiburada | n11 olmalı'
    });
    return;
  }

  const adapter = getAdapter(platform);
  const validated = adapter.validateCredentials(body?.credentials);
  if (typeof validated === 'string') {
    res.status(400).json({ error: 'invalid_credentials', message: validated });
    return;
  }

  const storeNameRaw = body?.storeName;
  const storeName = typeof storeNameRaw === 'string' ? storeNameRaw.trim() : '';

  // Plan limit kontrolu — maxPlatforms sinirina ulasildiysa yeni bir magaza
  // baglamaya izin verme (ayni platform tekrar bagliyorsa yeniden sayilmaz).
  const resolvedPlan = await getUserPlan(uid);
  const maxPlatforms = PLANS[resolvedPlan.plan].features.maxPlatforms;
  if (maxPlatforms !== null) {
    const db = getFirestore();
    const existingSnap = await db
      .collection('users')
      .doc(uid)
      .collection('platforms')
      .get();
    const existingIds = existingSnap.docs.map((d) => d.id);
    const alreadyHasThis = existingIds.includes(platform);
    const connectedCount = existingIds.length;
    if (!alreadyHasThis && connectedCount >= maxPlatforms) {
      res.status(403).json({
        error: 'platform_limit_reached',
        currentPlan: resolvedPlan.plan,
        maxPlatforms,
        connectedCount,
        message: `Mevcut planınızda en fazla ${maxPlatforms} mağaza bağlayabilirsiniz. Daha fazlası için planınızı yükseltin.`
      });
      return;
    }
  }

  let test: { ok: boolean; error?: string };
  try {
    test = await adapter.testConnection(validated as PlatformCredentials);
  } catch (err) {
    console.error('[connectPlatform testConnection error]', err);
    res.status(400).json({
      error: 'connection_failed',
      message: err instanceof Error ? err.message : 'Bağlantı doğrulanamadı'
    });
    return;
  }
  if (!test.ok) {
    res.status(400).json({
      error: 'connection_failed',
      message: test.error || 'Bağlantı doğrulanamadı'
    });
    return;
  }

  let store: PlatformStoreSnapshot;
  try {
    store = await adapter.fetchStore(validated as PlatformCredentials, storeName || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mağaza verisi çekilemedi';
    res.status(400).json({ error: 'fetch_failed', message });
    return;
  }

  let credentialsEncrypted: EncryptedPayload;
  try {
    credentialsEncrypted = await encryptJSON(validated);
  } catch (err) {
    console.error('[connectPlatform encrypt error]', err);
    res.status(500).json({
      error: 'encrypt_failed',
      message: err instanceof Error ? err.message : 'Şifreleme başarısız'
    });
    return;
  }
  const entry = buildLogEntry(
    `<strong>Bağlantı kuruldu.</strong> ${store.totalProducts} ürün çekildi, ${store.categories.length} kategori tespit edildi.`
  );

  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('platforms').doc(platform);

  try {
    await ref.set({
      platform,
      connected: true,
      storeName: storeName || store.name,
      credentialsEncrypted,
      store,
      syncHistory: [entry],
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSyncAt: FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('[connectPlatform firestore write error]', err);
    res.status(500).json({
      error: 'firestore_write_failed',
      message: err instanceof Error ? err.message : 'Kayıt başarısız'
    });
    return;
  }

  res.json({
    connected: true,
    platform,
    storeName: storeName || store.name,
    store,
    syncEntry: entry
  });
}

export async function syncPlatformHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown> | null;
  const platform = readPlatformFromBody(body);
  if (!isPlatformId(platform)) {
    res.status(400).json({ error: 'invalid_platform' });
    return;
  }

  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('platforms').doc(platform);
  const snap = await ref.get();

  if (!snap.exists) {
    res.status(404).json({
      error: 'not_connected',
      message: 'Önce platform bağlantısı kurmalısınız'
    });
    return;
  }

  const data = snap.data() as Partial<StoredPlatform>;
  if (!data.credentialsEncrypted) {
    res.status(400).json({
      error: 'credentials_missing',
      message: 'Kayıtlı kimlik bilgisi bulunamadı, yeniden bağlanın'
    });
    return;
  }

  let creds: PlatformCredentials;
  try {
    creds = await decryptJSON<PlatformCredentials>(data.credentialsEncrypted);
  } catch {
    res.status(500).json({
      error: 'decrypt_failed',
      message: 'Kimlik bilgileri çözülemedi. Bağlantıyı yenileyin.'
    });
    return;
  }

  const adapter = getAdapter(platform);
  let store: PlatformStoreSnapshot;
  try {
    store = await adapter.fetchStore(creds, data.storeName || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Senkronizasyon başarısız';
    res.status(400).json({ error: 'sync_failed', message });
    return;
  }

  const entry = buildLogEntry(
    `<strong>Senkronizasyon tamamlandı.</strong> ${store.totalProducts} ürün, ${store.categories.length} kategori güncellendi.`
  );
  const history = [entry, ...(data.syncHistory || [])].slice(0, 10);

  await ref.update({
    store,
    syncHistory: history,
    updatedAt: FieldValue.serverTimestamp(),
    lastSyncAt: FieldValue.serverTimestamp()
  });

  res.json({ platform, store, syncEntry: entry });
}

export async function getPlatformStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const platform = typeof req.query.platform === 'string' ? req.query.platform : null;
  if (!isPlatformId(platform)) {
    res.status(400).json({ error: 'invalid_platform' });
    return;
  }

  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('platforms').doc(platform);
  const snap = await ref.get();

  if (!snap.exists) {
    res.json({ connected: false, platform });
    return;
  }

  const data = snap.data() as Partial<StoredPlatform> & {
    connectedAt?: FirebaseFirestore.Timestamp;
    updatedAt?: FirebaseFirestore.Timestamp;
    lastSyncAt?: FirebaseFirestore.Timestamp;
  };

  res.json({
    connected: !!data.connected,
    platform,
    storeName: data.storeName || '',
    store: data.store || null,
    syncHistory: data.syncHistory || [],
    connectedAt: data.connectedAt?.toMillis?.() ?? null,
    lastSyncAt: data.lastSyncAt?.toMillis?.() ?? null
  });
}

export async function disconnectPlatformHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown> | null;
  const platform = readPlatformFromBody(body);
  if (!isPlatformId(platform)) {
    res.status(400).json({ error: 'invalid_platform' });
    return;
  }

  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('platforms').doc(platform);
  await ref.delete();

  res.json({ ok: true, platform });
}
