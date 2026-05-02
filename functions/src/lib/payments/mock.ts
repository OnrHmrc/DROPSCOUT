// ─────────────────────────────────────────────────────────
// DropScout TR — Mock payment provider (dev/test)
// Gercek provider secilinceye kadar aktif. Checkout "sahte"
// bir basari sayfasina yonlendirir; emulator'da abone akisini
// doğrulamak icin kullanilir. Production'da ASLA kullanilmaz.
// ─────────────────────────────────────────────────────────

import type { PaymentAdapter, CheckoutInput, CheckoutResult, PaymentEvent } from './types';

function randomId(): string {
  return 'mock_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const mockAdapter: PaymentAdapter = {
  id: 'mock',
  displayName: 'Mock Provider (dev)',

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const externalId = randomId();
    // Emulator'da direkt success URL'e donuruz — gercek bir checkout yok
    return {
      checkoutUrl: `${input.successUrl}?mock=1&externalId=${encodeURIComponent(externalId)}&plan=${input.plan}&cycle=${input.cycle}`,
      externalId,
      provider: 'mock'
    };
  },

  async verifyWebhook(_headers, rawBody): Promise<PaymentEvent> {
    const body = JSON.parse(rawBody);
    return {
      type: body.type || 'unknown',
      externalId: body.externalId || 'mock_unknown',
      uid: body.uid,
      plan: body.plan,
      cycle: body.cycle || 'monthly',
      expiresAt: body.expiresAt,
      raw: body
    };
  }
};
