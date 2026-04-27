/* ══════════════════════════════════════
   DropScout TR — Authentication Module
   ══════════════════════════════════════ */

import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';

/** Mevcut kullanicinin durumunu dinle */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/** E-posta + sifre ile giris */
export async function login(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Yeni hesap olustur */
export async function register(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
}

/** Cikis yap */
export async function logout() {
  await signOut(auth);
}

/** Sifre sifirlama e-postasi gonder */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/** Kullanicinin giris yapip yapmadigini kontrol et, yapmadiysa login'e yonlendir */
export function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (!user) {
        const current = window.location.pathname + window.location.search;
        window.location.href = './login.html?redirect=' + encodeURIComponent(current);
      } else {
        resolve(user);
      }
    });
  });
}

/** Kullanici zaten giris yaptiysa dashboard'a yonlendir (login sayfasi icin) */
export function redirectIfAuthenticated(redirectTo = './dropscout.html') {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        window.location.href = redirectTo;
      } else {
        resolve(null);
      }
    });
  });
}
