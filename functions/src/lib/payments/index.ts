// ─────────────────────────────────────────────────────────
// DropScout TR — Payment adapter registry
// PAYMENT_PROVIDER env/secret'e bagli olarak adapter dondurur.
// Set degilse: mock (dev). Gercek kullanimda 'iyzico' veya
// kullanicinin sectigi local provider'in id'si olacak.
// ─────────────────────────────────────────────────────────

import { defineSecret } from 'firebase-functions/params';
import type { PaymentAdapter } from './types';
import { mockAdapter } from './mock';
import { iyzicoAdapter } from './iyzico';

// Webhook imzasi icin gerekli secret — provider bazli kullanilir
export const PAYMENT_API_KEY = defineSecret('PAYMENT_API_KEY');
export const PAYMENT_SECRET_KEY = defineSecret('PAYMENT_SECRET_KEY');
export const PAYMENT_WEBHOOK_SECRET = defineSecret('PAYMENT_WEBHOOK_SECRET');

const REGISTRY: Record<string, PaymentAdapter> = {
  mock: mockAdapter,
  iyzico: iyzicoAdapter
  // Local provider adapter'i eklendiginde buraya mount edilir:
  // paytr: paytrAdapter,
  // param: paramAdapter,
  // yerel: yerelAdapter
};

export function getActiveProvider(): PaymentAdapter {
  const id = (process.env.PAYMENT_PROVIDER || 'mock').trim();
  const adapter = REGISTRY[id];
  if (!adapter) throw new Error(`Unknown PAYMENT_PROVIDER: ${id}`);
  return adapter;
}

export function listProviders(): Array<{ id: string; displayName: string }> {
  return Object.values(REGISTRY).map((a) => ({ id: a.id, displayName: a.displayName }));
}

export type { PaymentAdapter, CheckoutInput, CheckoutResult, PaymentEvent, BillingCycle } from './types';
