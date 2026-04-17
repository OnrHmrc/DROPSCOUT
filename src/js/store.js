/* ══════════════════════════════════════
   DropScout TR — Firestore Data Layer
   ══════════════════════════════════════
   Tum veritabani islemleri bu modul uzerinden yapilir.
   Koleksiyonlar:
     users/{uid}                    → Kullanici profili
     users/{uid}/platforms/{id}     → Bagli platform bilgileri
     users/{uid}/products/{id}      → Kullanicinin urunleri
     users/{uid}/watchlist/{id}     → Takip listesi
*/

import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

// ─── Kullanici Profili ───────────────────────

/** Kullanici profili olustur (ilk kayitta) */
export async function createUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), {
    displayName: data.displayName || '',
    email: data.email || '',
    phone: data.phone || '',
    plan: 'free',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/** Kullanici profilini getir */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Kullanici profilini guncelle */
export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

// ─── Platform Baglantilari ───────────────────

/** Platform baglantisi kaydet (API kimlik bilgileri) */
export async function savePlatformConnection(uid, platformId, data) {
  await setDoc(doc(db, 'users', uid, 'platforms', platformId), {
    platform: platformId,
    connected: true,
    storeName: data.storeName || '',
    credentials: data.credentials || {},
    syncHistory: data.syncHistory || [],
    connectedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/** Tek bir platform baglantisini getir */
export async function getPlatformConnection(uid, platformId) {
  const snap = await getDoc(doc(db, 'users', uid, 'platforms', platformId));
  return snap.exists() ? snap.data() : null;
}

/** Tum platform baglantilari getir */
export async function getAllPlatformConnections(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'platforms'));
  const platforms = {};
  snap.forEach(d => { platforms[d.id] = d.data(); });
  return platforms;
}

/** Platform baglantisini sil */
export async function deletePlatformConnection(uid, platformId) {
  await deleteDoc(doc(db, 'users', uid, 'platforms', platformId));
}

/** Senkronizasyon gecmisine kayit ekle */
export async function addSyncEntry(uid, platformId, logText) {
  const ref = doc(db, 'users', uid, 'platforms', platformId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const now = new Date();
  const entry = {
    time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    text: logText,
    date: now.toISOString()
  };

  const history = [entry, ...(data.syncHistory || [])].slice(0, 10);
  await updateDoc(ref, {
    syncHistory: history,
    updatedAt: serverTimestamp()
  });
}

// ─── Urunler ─────────────────────────────────

/** Kullanicinin urunlerini getir */
export async function getUserProducts(uid, opts = {}) {
  let q = collection(db, 'users', uid, 'products');
  const constraints = [];

  if (opts.platform) {
    constraints.push(where('platform', '==', opts.platform));
  }
  if (opts.orderField) {
    constraints.push(orderBy(opts.orderField, opts.orderDir || 'desc'));
  }
  if (opts.limit) {
    constraints.push(limit(opts.limit));
  }

  const snap = await getDocs(constraints.length ? query(q, ...constraints) : q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Urun kaydet/guncelle */
export async function saveProduct(uid, productId, data) {
  await setDoc(doc(db, 'users', uid, 'products', productId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ─── Takip Listesi ───────────────────────────

/** Takip listesine urun ekle */
export async function addToWatchlist(uid, productId, productData) {
  await setDoc(doc(db, 'users', uid, 'watchlist', productId), {
    ...productData,
    addedAt: serverTimestamp()
  });
}

/** Takip listesinden urun cikar */
export async function removeFromWatchlist(uid, productId) {
  await deleteDoc(doc(db, 'users', uid, 'watchlist', productId));
}

/** Takip listesini getir */
export async function getWatchlist(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'watchlist'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
