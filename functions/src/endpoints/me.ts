import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import type { AuthRequest } from '../middleware/auth';
import '../lib/firebase-admin';
import { getUserPlan, getQuotaStatus } from '../middleware/plan';
import { PLANS, monthKey } from '../lib/plans';
import { calcClaudeCostUsd, ZERO_USAGE, type TokenUsage } from '../lib/pricing';

/**
 * GET /api/me/plan
 * Frontend UI bunu cagirir → plan + quota durumu + ozellik bayraklari
 * tek isteklik. Middleware'e dokunmaz; UI gating icin gerekli her sey
 * burada.
 */
export async function getMyPlanHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const resolved = await getUserPlan(uid);
  const definition = PLANS[resolved.plan];
  const quotas = await getQuotaStatus(uid, resolved.plan);

  res.json({
    plan: resolved.plan,
    status: resolved.status,
    trialEndsAt: resolved.trialEndsAt,
    planExpiresAt: resolved.planExpiresAt,
    definition: {
      name: definition.name,
      priceTl: definition.priceTl,
      features: definition.features
    },
    quotas
  });
}

/**
 * GET /api/me/usage
 * Son N ayin Claude token kullanim ve USD maliyet ozeti.
 * Profil sayfasinda "bu ay X analiz, $Y" widget icin.
 */
export async function getMyUsageHandler(req: AuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const monthsBack = Math.min(12, Math.max(1, Number(req.query.months ?? 3)));
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    months.push(monthKey(d));
  }

  const db = getFirestore();
  const docs = await Promise.all(
    months.map((m) => db.collection('users').doc(uid).collection('usageMonthly').doc(m).get())
  );

  const items = months.map((m, i) => {
    const data = docs[i].data();
    const tokens: TokenUsage = {
      input: data?.tokens?.input ?? 0,
      output: data?.tokens?.output ?? 0,
      cacheRead: data?.tokens?.cacheRead ?? 0,
      cacheCreation: data?.tokens?.cacheCreation ?? 0,
      calls: data?.tokens?.calls ?? 0
    };
    return {
      month: m,
      tokens,
      costUsd: calcClaudeCostUsd(tokens)
    };
  });

  const totalUsage: TokenUsage = items.reduce(
    (acc, it) => ({
      input: acc.input + it.tokens.input,
      output: acc.output + it.tokens.output,
      cacheRead: acc.cacheRead + it.tokens.cacheRead,
      cacheCreation: acc.cacheCreation + it.tokens.cacheCreation,
      calls: acc.calls + it.tokens.calls
    }),
    ZERO_USAGE
  );

  res.json({
    months: items,
    totalUsage,
    totalCostUsd: calcClaudeCostUsd(totalUsage),
    pricingPerMillion: { input: 1.0, output: 5.0, cacheRead: 0.1, cacheCreation: 1.25 }
  });
}
