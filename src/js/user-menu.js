/* ══════════════════════════════════════
   DropScout TR — User Menu Module
   ══════════════════════════════════════
   Topbar'a kullanici avatar butonu ve dropdown menu ekler.
   main.js tarafindan initUserMenu(user) ile cagrilir.
*/

import { logout } from './auth.js';
import { getUserProfile } from './store.js';

/**
 * Topbar'a kullanici menu butonunu ekler.
 * @param {object} user - Firebase Auth user objesi
 */
export async function initUserMenu(user) {
  const container = document.querySelector('.topbar-right') || document.querySelector('.top-actions');
  if (!container) return;

  // Kullanici bilgilerini al
  let displayName = user.displayName || '';
  let email = user.email || '';
  let phone = '';

  try {
    const profile = await getUserProfile(user.uid);
    if (profile) {
      displayName = profile.displayName || displayName;
      email = profile.email || email;
      phone = profile.phone || '';
    }
  } catch (e) { /* profil yuklenemezse auth verileriyle devam et */ }

  // Bas harfler
  const initials = getInitials(displayName || email);

  // Wrapper
  const wrap = document.createElement('div');
  wrap.className = 'user-menu-wrap';

  // Avatar butonu
  const btn = document.createElement('button');
  btn.className = 'user-avatar-btn';
  btn.textContent = initials;
  btn.title = displayName || email;
  btn.setAttribute('aria-label', 'Kullanıcı menüsü');

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'user-dropdown';
  dropdown.innerHTML = `
    <div class="ud-header">
      <div class="ud-name">${escapeHtml(displayName || 'Kullanıcı')}</div>
      <div class="ud-email">${escapeHtml(email)}</div>
    </div>
    <a class="ud-item" href="./profil.html">
      <span class="ud-item-icon">👤</span> Profil Ayarları
    </a>
    <div class="ud-divider"></div>
    <button class="ud-item logout" id="udLogout">
      <span class="ud-item-icon">🚪</span> Çıkış Yap
    </button>
  `;

  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
  container.appendChild(wrap);

  // Toggle
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Disari tiklaninca kapat
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Cikis yap
  dropdown.querySelector('#udLogout').addEventListener('click', async () => {
    try {
      await logout();
      window.location.href = './login.html';
    } catch (e) {
      console.error('Çıkış yapılamadı:', e);
    }
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
