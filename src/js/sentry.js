/* ══════════════════════════════════════════════════
   DropScout TR — Frontend Sentry (browser)
   ══════════════════════════════════════════════════
   @sentry/browser v10. DSN Vite env'den (VITE_SENTRY_DSN).
   DSN yoksa no-op — local dev icin guvenli, build baki.
*/

import * as Sentry from '@sentry/browser';

let initialized = false;

/** Tek seferlik init — main.js'ten cagrilir */
export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env?.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env?.MODE === 'development' ? 'development' : 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Ağ/abort hatalari gibi gurultuluyu cikart
      const msg = event?.exception?.values?.[0]?.value || '';
      if (msg.includes('network_error') || msg.includes('AbortError')) return null;
      return event;
    }
  });
  initialized = true;
}

/** Uid'i Sentry'ye bildir — login sonrasi cagrilir */
export function setSentryUser(user) {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.uid, email: user.email || undefined });
}

/** Manuel capture — handleApiError non-business-errors icin kullanir */
export function captureError(err, context) {
  if (!initialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}
