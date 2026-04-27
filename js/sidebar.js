/* ══════════════════════════════════════
   DropScout TR — Sidebar Module
   ══════════════════════════════════════ */

export function initSidebar() {
  const sidebar       = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const mobileMenuBtn  = document.getElementById('mobileMenuBtn');

  if (!sidebar) return;

  function setSidebar(open) {
    if (window.innerWidth > 900) {
      sidebar.classList.remove('open');
      sidebarOverlay?.classList.remove('active');
      document.body.style.overflow = '';
      return;
    }
    sidebar.classList.toggle('open', open);
    sidebarOverlay?.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  // Mobile menu button
  mobileMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    setSidebar(!sidebar.classList.contains('open'));
  });

  // Overlay click closes sidebar
  sidebarOverlay?.addEventListener('click', () => setSidebar(false));

  // Close on resize
  window.addEventListener('resize', () => setSidebar(false));

  // Close when clicking nav items (mobile)
  sidebar.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        setSidebar(false);
      }
    });
  });
}
