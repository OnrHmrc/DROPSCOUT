// ─────────────────────────────────────────────────────────
// DropScout TR — Payment provider adapter contract
// Yerel odeme firmasi / iyzico / PayTR / Param vb. hepsi
// ayni arayuzu implement eder. Endpoint provider-agnostic.
// ─────────────────────────────────────────────────────────

import type { PlanId } from '../plans';

export type BillingCycle = 'monthly' | 'yearly';

export interface CheckoutInput {
  uid: string;
  email: string;
  plan: PlanId;
  cycle: BillingCycle;
  /** Kullanici fatura bilgisi (fatura gerekli ise) */
  billing?: {
    fullName?: string;
    taxNumber?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  /** Basari/iptal donus URL'leri (provider redirect sonrasi) */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Kullaniciyi yonlendirecegimiz checkout sayfasi */
  checkoutUrl: string;
  /** Provider tarafindaki benzersiz session/subscription id (webhook eslesmesi icin) */
  externalId: string;
  /** Provider adi — log/audit */
  provider: string;
}

/** Webhook'tan gelen normalize edilmis olay */
export interface PaymentEvent {
  type:
    | 'subscription.activated'
    | 'subscription.renewed'
    | 'subscription.canceled'
    | 'subscription.past_due'
    | 'payment.failed'
    | 'unknown';
  externalId: string;
  uid?: string;
  plan?: PlanId;
  cycle?: BillingCycle;
  /** Bu olayla birlikte plan dolumu uzayan tarih (ms) */
  expiresAt?: number;
  raw: unknown;
}

export interface PaymentAdapter {
  readonly id: string;
  readonly displayName: string;

  /**
   * Provider'da checkout session/subscription olustur, kullaniciyi yonlendirecek
   * URL + eslesme id'si dondur.
   */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /**
   * Webhook'u dogrula (imza kontrolu) + normalize edilmis olay dondur.
   * Imza gecersiz ise throw et; handler 400 donecek.
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): Promise<PaymentEvent>;

  /**
   * (Opsiyonel) Mevcut aboneligi iptal et. Kullanicinin "plani iptal et"
   * butonu icin.
   */
  cancelSubscription?(externalId: string): Promise<void>;
}
