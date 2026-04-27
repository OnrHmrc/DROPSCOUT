/* ══════════════════════════════════════
   DropScout TR — Global Profile Button
   ══════════════════════════════════════
   Her sayfanın topbar-right alanına inline profil butonu ekler.
   Avatar baş harfleri ve rengi kullanıcının isim+soyismine göre üretilir.
   main.js içinden initProfileBar(user) ile çağrılır.
*/

import { getUserProfile } from './store.js';

export function initProfileBar(user) {
  // profil.html kendi topbar butonunu render eder
  if (window.location.pathname.endsWith('profil.html')) return;

  // Zaten eklenmişse tekrar ekleme
  if (document.getElementById('globalProfileBtn')) return;

  const topbarRight = document.querySelector('.topbar .topbar-right');
  if (!topbarRight) return;

  const authName = user.displayName || '';
  const email = user.email || '';
  const seed0 = authName || email || 'kullanici';

  const btn = document.createElement('a');
  btn.id = 'globalProfileBtn';
  btn.className = 'global-profile-btn';
  btn.href = './profil.html';
  btn.setAttribute('aria-label', 'Profil ve hesap ayarları');
  btn.title = 'Profil & Hesap';
  btn.innerHTML = `
    <span class="gpb-avatar" id="gpbAvatar">${esc(getInitials(authName || email))}</span>
    <span class="gpb-copy">
      <span class="gpb-name" id="gpbName">${esc(authName || 'Kullanıcı')}</span>
      <span class="gpb-sub">HESAP &amp; AYARLAR</span>
    </span>
    <span class="gpb-caret" aria-hidden="true">▾</span>
  `;
  topbarRight.appendChild(btn);

  paintAvatar(document.getElementById('gpbAvatar'), seed0);

  // Async: Firestore'dan isim çekip avatarı ve ismi gerçek veriyle güncelle
  getUserProfile(user.uid).then((profile) => {
    const name = (profile && profile.displayName) || authName || email || 'Kullanıcı';
    const seed = (profile && profile.displayName) || authName || email || seed0;
    const avatarEl = document.getElementById('gpbAvatar');
    const nameEl = document.getElementById('gpbName');
    if (avatarEl) {
      avatarEl.textContent = getInitials(name);
      paintAvatar(avatarEl, seed);
    }
    if (nameEl) nameEl.textContent = name;
  }).catch(() => { /* auth verileriyle devam et */ });
}

/** İsim + soyisimden baş harfler. Tek kelime ise ilk iki harf. */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/** Deterministik hash → 0-359 arası hue. Aynı isim her zaman aynı rengi verir. */
export function hueFromSeed(seed) {
  const s = String(seed || '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Avatar elemanına isme özel gradyan uygular. */
export function paintAvatar(el, seed) {
  if (!el) return;
  const hue = hueFromSeed(seed);
  const hue2 = (hue + 36) % 360;
  el.style.background = `linear-gradient(135deg, hsl(${hue}, 70%, 52%), hsl(${hue2}, 72%, 44%))`;
  el.style.boxShadow = `0 2px 10px hsla(${hue}, 70%, 45%, 0.32)`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
