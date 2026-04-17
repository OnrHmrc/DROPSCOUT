/* ══════════════════════════════════════
   DropScout TR — Firebase Configuration
   ══════════════════════════════════════ */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBNRBwZ3gzsfHHvk3ypkIq0nfURjwTHeoU",
  authDomain: "dropscoutapp.firebaseapp.com",
  projectId: "dropscoutapp",
  storageBucket: "dropscoutapp.firebasestorage.app",
  messagingSenderId: "436051072580",
  appId: "1:436051072580:web:43d6781d76f2f724ebce11",
  measurementId: "G-DGJWS0WE8J"
};
// TODO: Gercek Firebase Console degerlerini yukaridaki alanlara yapistiriniz
// Firebase Console → Project Settings → General → Your apps → Web app

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Gelistirme ortaminda emulator kullan (opsiyonel)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  // Emulator kullanmak isterseniz asagidaki satirlari aktif edin:
  // connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  // connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export { app, auth, db };
