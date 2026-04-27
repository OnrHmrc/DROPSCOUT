import type { Request, Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import { getActiveProvider } from '../lib/payments';
import type { BillingCycle } from '../lib/payments/types';
import { isPlanId, type PlanId, PLANS } from '../lib/plans';
import { captureError } from '../lib/sentry';

function validateCheckoutInput(body: unknown): { plan: PlanId; cycle: BillingCycle } | string {
  if (!body || typeof body !== 'object') return 'Gövde geçersiz, JSON obje bekleniyor';
  const b = body as Record<string, unknown>;
  if (!isPlanId(b.plan)) return 'plan alanı start/pro/business olmalı';
  const cycle = b.cycle === 'yearly' ? 'yearly' : 'monthly';
  return { plan: b.plan, cycle };
}

function computeExpiresAt(cycle: BillingCycle): number {
  const now = Date.now();
  const days = cycle === 'yearly' ? 365 : 30;
  return now + days * 24 * 60 * 60 * 1000;
}

/**
 * POST /api/payment/checkout
 * Kullaniciyi provider'in checkout sayfasina yonlendirecek URL doner.
 * Body: { plan: 'pro'|'business', cycle: 'monthly'|'yearly' }
 */
export async function createCheckoutHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  const email = req.email;
  if (!uid || !email) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const validated = validateCheckoutInput(req.body);
  if (typeof validated === 'string') {
    res.status(400).json({ error: 'invalid_input', message: validated });
    return;
  }

  if (validated.plan === 'start') {
    res.status(400).json({ error: 'invalid_plan', message: 'Start planı ödeme gerektirmez' });
    return;
  }

  const origin = (req.headers.origin as string) || 'https://dropscoutapp.web.app';
  const successUrl = `${origin}/profil.html?upgrade=success`;
  const cancelUrl = `${origin}/pricing.html?upgrade=cancel`;

  try {
    const provider = getActiveProvider();
    const result = await provider.createCheckout({
      uid,
      email,
      plan: validated.plan,
      cycle: validated.cycle,
      successUrl,
      cancelUrl
    });

    // Firestore'a pending kaydet — webhook gelince aktiflesecek
    const db = getFirestore();
    await db.collection('users').doc(uid).collection('paymentSessions').doc(result.externalId).set({
      externalId: result.externalId,
      provider: result.provider,
      plan: validated.plan,
      cycle: validated.cycle,
      status: 'pending',
      priceTl: validated.cycle === 'yearly'
        ? PLANS[validated.plan].priceTlYearly
        : PLANS[validated.plan].priceTl,
      createdAt: FieldValue.serverTimestamp()
    });

    res.json({
      checkoutUrl: result.checkoutUrl,
      provider: result.provider,
      externalId: result.externalId
    });
  } catch (err) {
    captureError(err, { endpoint: 'payment/checkout', uid, plan: validated.plan });
    const message = err instanceof Error ? err.message : 'Checkout baslatilamadi';
    res.status(501).json({ error: 'checkout_failed', message });
  }
}

/**
 * POST /api/payment/webhook
 * Provider'in webhook'u — auth middleware'i bypass eder (verifyWebhook
 * adapter icinde imzayi dogrular). Firestore'a plan alanlarini yazar.
 *
 * NOT: Bu endpoint `app.post('/api/payment/webhook', ...)` olarak router'dan
 * once mount edilir cunku Bearer auth yapmayiz.
 */
export async function paymentWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = (req as any).rawBody?.toString('utf8') ?? JSON.stringify(req.body);

  try {
    const provider = getActiveProvider();
    const event = await provider.verifyWebhook(req.headers as Record<string, string | string[] | undefined>, rawBody);

    const db = getFirestore();

    // Session kaydini eslestir (externalId → uid)
    let uid = event.uid;
    if (!uid) {
      const sessions = await db
        .collectionGroup('paymentSessions')
        .where('externalId', '==', event.externalId)
        .limit(1)
        .get();
      if (sessions.empty) {
        console.warn('[payment webhook] session bulunamadi', { externalId: event.externalId });
        res.status(200).send('ok'); // provider retry etmesin
        return;
      }
      uid = sessions.docs[0].ref.parent.parent?.id;
    }

    if (!uid) {
      res.status(200).send('ok');
      return;
    }

    const userRef = db.collection('users').doc(uid);
    const sessionRef = userRef.collection('paymentSessions').doc(event.externalId);

    switch (event.type) {
      case 'subscription.activated':
      case 'subscription.renewed': {
        const expiresAtMs = event.expiresAt ?? computeExpiresAt(event.cycle || 'monthly');
        await userRef.set(
          {
            plan: event.plan,
            planStatus: 'active',
            planStartedAt: FieldValue.serverTimestamp(),
            planExpiresAt: Timestamp.fromMillis(expiresAtMs),
            billingCycle: event.cycle || 'monthly',
            paymentSubscriptionId: event.externalId,
            trialEndsAt: FieldValue.delete(),
            trialPlan: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        await sessionRef.set(
          { status: 'active', processedAt: FieldValue.serverTimestamp(), event: event.type },
          { merge: true }
        );
        break;
      }
      case 'subscription.canceled':
      case 'subscription.past_due':
      case 'payment.failed': {
        await userRef.set(
          {
            planStatus: 'expired',
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        await sessionRef.set(
          { status: 'canceled', processedAt: FieldValue.serverTimestamp(), event: event.type },
          { merge: true }
        );
        break;
      }
      default: {
        console.warn('[payment webhook] unknown event', { type: event.type, externalId: event.externalId });
      }
    }

    res.status(200).send('ok');
  } catch (err) {
    captureError(err, { endpoint: 'payment/webhook' });
    const message = err instanceof Error ? err.message : 'Webhook verify failed';
    // 400 verirsek provider retry eder — imza hatasi icin dogru davranis
    res.status(400).json({ error: 'webhook_verification_failed', message });
  }
}
