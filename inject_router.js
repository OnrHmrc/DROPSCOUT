const fs = require('fs');

const shellPath = 'dropscout.html';
let html = fs.readFileSync(shellPath, 'utf8');

const routerScript = `
<!-- ==============================================
     SPA ROUTER (Dinamik Sayfa Yükleyici)
=============================================== -->
<script>
document.addEventListener('DOMContentLoaded', () => {
  const isLocal = window.location.protocol === 'file:';
  const appContainer = document.querySelector('main.main');
  const navItems = document.querySelectorAll('.sidebar .nav-item');
  const dynamicStyles = document.createElement('div');
  dynamicStyles.id = 'dynamic-styles';
  document.head.appendChild(dynamicStyles);

  // Router Engine
  async function loadModule(url) {
    if(!url || url === '#' || url.startsWith('#')) return;
    
    // Yükleme animasyonu
    appContainer.style.opacity = '0.5';
    appContainer.style.pointerEvents = 'none';

    try {
      const response = await fetch(url);
      if(!response.ok) throw new Error('Sayfa yüklenemedi: ' + response.statusText);
      const htmlText = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // Extract Main Content
      const newMain = doc.querySelector('main.main');
      if (newMain) {
        appContainer.innerHTML = newMain.innerHTML;
        window.scrollTo(0, 0);
      } else {
        console.warn('Yüklenen sayfada <main class="main"> bulunamadı.');
      }

      // Extract and Inject specific styles
      const newStyles = doc.querySelectorAll('style');
      dynamicStyles.innerHTML = ''; // Eski stil temizle
      newStyles.forEach(st => {
        const styleEl = document.createElement('style');
        styleEl.innerHTML = st.innerHTML;
        dynamicStyles.appendChild(styleEl);
      });

      // Extract and Execute Scripts
      const newScripts = doc.querySelectorAll('script');
      
      newScripts.forEach(sc => {
        // Core temayı ve routerı etkilememesi için engellenecek kod blokları
        if (sc.innerHTML.includes('getSystemTheme') || sc.innerHTML.includes('themePreference')) return; // Zaten shell de var
        if (sc.src) return; // Harici kaynakları geç 

        const scriptEl = document.createElement('script');
        // Kodu IIFE (Scope isolation) içine alıyoruz ki değişken çakışması olmasın (örn: const products)
        // Note: Replacing generic variable definitions if needed, but IIFE handles most
        scriptEl.innerHTML = '(function(){\\n' + sc.innerHTML + '\\n})();';
        appContainer.appendChild(scriptEl); // Çalıştır
      });

      // Update Sidebar Menü Active State
      navItems.forEach(item => item.classList.remove('blue-active', 'active'));
      let activeLink = Array.from(navItems).find(item => item.getAttribute('href') === url);
      if(!activeLink) activeLink = Array.from(navItems).find(item => item.getAttribute('href').includes(url));
      
      if (activeLink) {
        // Find which parent active class it expects
        if(activeLink.classList.contains('trend-radar-btn')) activeLink.classList.add('blue-active');
        else activeLink.classList.add('blue-active'); // Fallback
      }

      // URL Değiştir
      const moduleName = url.split('/').pop().replace('.html', '');
      window.history.pushState({ module: moduleName }, '', '#' + moduleName);

    } catch (err) {
      console.error(err);
      if (isLocal) {
        alert('UYARI: Local sistemde file:// protokolü üzerinden cihazın güvenlik ayarları (CORS) nedeniyle dış dosyalar yüklenemez. Lütfen bir Local Server kullanın (örn: VSCode Live Server veya npx http-server).');
      }
    } finally {
      appContainer.style.opacity = '1';
      appContainer.style.pointerEvents = 'auto';
      
      // Mobil menü açıksa kapat
      const sidebar = document.querySelector('.sidebar');
      const sidebarOverlay = document.getElementById('sidebarOverlay');
      if(sidebar) sidebar.classList.remove('open');
      if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    }
  }

  // Intercept nav clicks
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const href = item.getAttribute('href');
      // Tab based links shouldn't be processed
      if (href && href.startsWith('#')) return;

      if (href && href.endsWith('.html')) {
        if(href.includes('dropscout.html')) {
          e.preventDefault();
          loadModule(href);
          return;
        }

        e.preventDefault();
        loadModule(href);
      }
    });
  });

  // Handle back button
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.module) {
      loadModule(e.state.module + '.html');
    } else {
      window.location.reload(); // Default duruma geri dön
    }
  });

});
</script>
`;

if(!html.includes('SPA ROUTER')) {
  // Inject exactly before </body>
  html = html.replace('</body>', routerScript + '\n</body>');
  fs.writeFileSync(shellPath, html, 'utf8');
  console.log('Router successfully injected.');
} else {
  console.log('Router already exists.');
}
