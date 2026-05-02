// ─────────────────────────────────────────────────────────
// DropScout TR — iyzico adapter (referans / fallback)
// Kullanici yerel firmayla anlasamazsa devreye girer.
//
// TODO (provider anlasmasi sonrasi kaldir/duzenle):
//   1) `npm install iyzipay` (functions/)
//   2) Secret Manager:
//      firebase functions:secrets:set IYZICO_API_KEY
//      firebase functions:secrets:set IYZICO_SECRET_KEY
//   3) Checkout Form (CF) veya Pay With iyzico — plan/abonelik icin
//      Subscription API kullanilir (aylik/yillik otomatik yenileme).
//   4) Webhook imzasi dogrulanir: x-iyz-signature (HMAC-SHA256 body hash)
//   5) pricing.html CTA checkoutUrl'e yonlendirir.
// ─────────────────────────────────────────────────────────

import type { PaymentAdapter, CheckoutInput, CheckoutResult, PaymentEvent } from './types';

export const iyzicoAdapter: PaymentAdapter = {
  id: 'iyzico',
  displayName: 'iyzico',

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    // TODO: const Iyzipay = require('iyzipay');
    // const client = new Iyzipay({ apiKey: process.env.IYZICO_API_KEY, secretKey: process.env.IYZICO_SECRET_KEY, uri: 'https://api.iyzipay.com' });
    // const product = await client.subscriptionProduct.create({...});  // plan urunu (bir kez)
    // const pricingPlan = await client.subscriptionPricingPlan.create({...}); // aylik/yillik
    // const initResult = await client.subscriptionCheckoutFormInit.create({
    //   pricingPlanReferenceCode: '...', subscriptionInitialStatus: 'ACTIVE',
    //   customer: { email, name, surname, billingAddress: {...} },
    //   callbackUrl: input.successUrl
    // });
    // return { checkoutUrl: initResult.checkoutFormContent, externalId: initResult.token, provider: 'iyzico' };
    throw new Error('iyzico adapter not implemented — IYZICO_API_KEY and iyzipay SDK required');
  },

  async verifyWebhook(_headers, _rawBody): Promise<PaymentEvent> {
    // TODO: iyzico imza: x-iyz-signature header, HMAC-SHA256 of rawBody, key=IYZICO_SECRET_KEY
    // const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    // if (headers['x-iyz-signature'] !== computed) throw new Error('invalid signature');
    // body.eventType -> map to PaymentEvent.type
    throw new Error('iyzico webhook not implemented');
  }
};
