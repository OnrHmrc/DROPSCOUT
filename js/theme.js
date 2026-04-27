/* ══════════════════════════════════════
   DropScout TR — Theme Module
   ══════════════════════════════════════ */

const sunIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.25"/><path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46"/></svg>`;
const moonIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.2 14.3A8.6 8.6 0 0 1 9.7 3.8a.6.6 0 0 0-.78-.74 9.6 9.6 0 1 0 12.02 12.02.6.6 0 0 0-.74-.78Z"/></svg>`;

const STORAGE_KEY = 'dropscout-theme-preference';

export function initTheme() {
  const themeToggle   = document.getElementById('themeToggle');
  const themeModeBadge = document.getElementById('themeModeBadge');
  const themeThumbIcon = document.getElementById('themeThumbIcon');
  const root           = document.documentElement;
  const systemQuery    = window.matchMedia('(prefers-color-scheme: dark)');

  let preference = localStorage.getItem(STORAGE_KEY) || 'system';

  function getSystemTheme() {
    return systemQuery.matches ? 'dark' : 'light';
  }

  function syncUI(theme) {
    if (themeToggle) themeToggle.checked = (theme === 'dark');
    if (themeThumbIcon) themeThumbIcon.innerHTML = (theme === 'dark') ? moonIcon : sunIcon;
    if (themeModeBadge) {
      themeModeBadge.textContent = preference === 'system'
        ? `SYSTEM · ${theme.toUpperCase()}`
        : `MANUAL · ${theme.toUpperCase()}`;
    }
  }

  function apply(pref, persist = false) {
    preference = pref;
    const theme = (pref === 'system') ? getSystemTheme() : pref;
    root.setAttribute('data-theme', theme);
    syncUI(theme);
    if (persist) localStorage.setItem(STORAGE_KEY, pref);
  }

  // Initial application
  apply(preference);

  // Toggle change handler
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      apply(themeToggle.checked ? 'dark' : 'light', true);
    });
  }

  // System theme change listener
  systemQuery.addEventListener?.('change', () => {
    if (preference === 'system') apply('system');
  });

  // Double-click to reset to system
  const themeWrap = document.querySelector('.theme-toggle-wrap');
  if (themeWrap) {
    themeWrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('.theme-switch')) return;
      apply('system', true);
    });
  }
}
