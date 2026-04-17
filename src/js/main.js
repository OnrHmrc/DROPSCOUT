/* ══════════════════════════════════════
   DropScout TR — Main JS Entry Point
   ══════════════════════════════════════
   Her HTML sayfası bu dosyayı <script type="module"> ile yükler.
   Ortak tema ve sidebar fonksiyonları burada init edilir.
*/

// CSS artık <link> etiketi ile HTML <head> içinden yükleniyor (FOUC önleme)
import { initTheme }   from './theme.js';
import { initSidebar } from './sidebar.js';
import { requireAuth } from './auth.js';
import { initUserMenu } from './user-menu.js';

// Auth guard — giris yapmamis kullaniciyi login'e yonlendir
// login.html, onboarding.html ve index.html kendi auth kontrollerini yapar, main.js yuklemez
requireAuth().then((user) => {
  // DOM ready ile init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(user));
  } else {
    init(user);
  }
});

function init(user) {
  initTheme();
  initSidebar();
  initUserMenu(user);
}
