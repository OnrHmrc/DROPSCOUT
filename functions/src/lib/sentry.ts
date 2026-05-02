// ─────────────────────────────────────────────────────────
// DropScout TR — Sentry (backend)
// @sentry/node v10. DSN Secret Manager'dan (SENTRY_DSN).
// DSN yoksa no-op — local emulator & test icin guvenli.
// ─────────────────────────────────────────────────────────

import * as Sentry from '@sentry/node';
import { defineSecret } from 'firebase-functions/params';
import { postAlert } from './alerts';

export const SENTRY_DSN = defineSecret('SENTRY_DSN');

let initialized = false;

/**
 * Sentry init — idempotent. Function cold start'ta cagrilir.
 * DSN env/secret'ten okunur; yoksa sessizce atlanir.
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // DSN yoksa capture no-op, hatasiz

  Sentry.init({
    dsn,
    environment: process.env.FUNCTIONS_EMULATOR === 'true' ? 'emulator' : 'production',
    tracesSampleRate: 0, // performance monitoring kapali — sadece error capture
    sendDefaultPii: false,
    beforeSend(event) {
      // Cron raporu log'lari gibi beklenen mesajlari filtreleme noktasi
      return event;
    }
  });
  initialized = true;
}

/**
 * Exception'i Sentry'e gonder. DSN yoksa no-op.
 * @param err Error veya unknown
 * @param context Ek bilgi (uid, endpoint, vs)
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) initSentry();
  if (!initialized) return; // hala false ise DSN yok

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

/**
 * Express error middleware. Route sonuna ekle, 500 yanittan once capture eder.
 */
export function sentryErrorHandler() {
  return (err: unknown, req: any, res: any, next: any): void => {
    captureError(err, {
      path: req?.originalUrl,
      method: req?.method,
      uid: req?.uid
    });
    next(err);
  };
}

/**
 * Scheduler wrapper — try/catch + Sentry capture + webhook alert (kritik).
 * scheduler body'sini bununla sar.
 */
export async function runWithSentry<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T | void> {
  try {
    return await fn();
  } catch (err) {
    captureError(err, { scheduler: name });
    // Webhook alert — bekleme, bloklama
    const message = err instanceof Error ? err.message : String(err);
    void postAlert({
      title: `Cron failed: ${name}`,
      message: message.slice(0, 800),
      level: 'error',
      context: { scheduler: name }
    });
    // re-throw: Firebase retry mekanizmasi calisabilsin
    throw err;
  }
}

/** Fire-and-forget partial-failure alert (cron icinde bireysel hatalar icin) */
export function notifyPartialFailure(
  scheduler: string,
  failed: number,
  total: number,
  samples: unknown[]
): void {
  if (failed === 0) return;
  void postAlert({
    title: `Cron partial failure: ${scheduler}`,
    message: `${failed}/${total} item failed`,
    level: failed === total ? 'error' : 'warn',
    context: {
      scheduler,
      failed,
      total,
      samples: samples.slice(0, 3)
    }
  });
}
