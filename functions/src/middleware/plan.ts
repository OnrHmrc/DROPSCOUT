import type { NextFunction, Response } from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthRequest } from './auth';
import '../lib/firebase-admin';
import {
  PLANS,
  type PlanId,
  type MeterId,
  planAtLeast,
  todayKey,
  monthKey
} from '../lib/plans';

export interface PlanRequest extends AuthRequest {
  plan?: PlanId;
}

export interface ResolvedPlan {
  plan: PlanId;
  status: 'trialing' | 'active' | 'expired' | 'none';
  trialEndsAt: number | null;
  planExpiresAt: number | null;
  bootstrapped: boolean;
}

const TRIAL_DAYS = 7;
const TRIAL_PLAN: PlanId = 'pro';

/**
 * Kullanicinin aktif planini dondurur. Plan alanlari hic set edilmemisse
 * 'start' + 7 gunluk Pro trial bootstrap eder (ilk /api cagrisinda).
 * Plan degismediyse yazma yapmaz.
 */
export async function getUserPlan(uid: string): Promise<ResolvedPlan> {
  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : undefined;

  const plan = (data?.plan as PlanId | undefined) ?? null;
  const planStatus = data?.planStatus as ResolvedPlan['status'] | undefined;
  const trialEndsAt = data?.trialEndsAt as Timestamp | undefined;
  const planExpiresAt = data?.planExpiresAt as Timestamp | undefined;
  const trialPlan = data?.trialPlan as PlanId | undefined;

  const nowMs = Date.now();

  // Ilk kez: plan alani yoksa bootstrap
  if (!plan) {
    const trialEnd = Timestamp.fromMillis(nowMs + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await ref.set(
      {
        plan: 'start',
        planStatus: 'trialing',
        planStartedAt: FieldValue.serverTimestamp(),
        trialPlan: TRIAL_PLAN,
        trialEndsAt: trialEnd,
        billingCycle: 'monthly',
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return {
      plan: TRIAL_PLAN,
      status: 'trialing',
      trialEndsAt: trialEnd.toMillis(),
      planExpiresAt: null,
      bootstrapped: true
    };
  }

  // Trial aktif
  if (trialEndsAt && trialEndsAt.toMillis() > nowMs && trialPlan) {
    return {
      plan: trialPlan,
      status: 'trialing',
      trialEndsAt: trialEndsAt.toMillis(),
      planExpiresAt: planExpiresAt?.toMillis() ?? null,
      bootstrapped: false
    };
  }

  // Odenmis plan aktif
  if (planExpiresAt && planExpiresAt.toMillis() > nowMs) {
    return {
      plan,
      status: planStatus === 'active' ? 'active' : 'active',
      trialEndsAt: null,
      planExpiresAt: planExpiresAt.toMillis(),
      bootstrapped: false
    };
  }

  // Trial bitmis, plan expired — fallback start (free-tier olmadigi icin
  // odeme alinana kadar en dusuk plan yetkisiyle devam)
  return {
    plan: 'start',
    status: 'expired',
    trialEndsAt: trialEndsAt?.toMillis() ?? null,
    planExpiresAt: planExpiresAt?.toMillis() ?? null,
    bootstrapped: false
  };
}

/**
 * Endpoint'e asgari plan sarti bagla.
 *   router.get('/gap-radar', requirePlan('business'), handler);
 * Plan yetmiyorsa 403 + yukseltme bilgisi doner.
 */
export function requirePlan(minPlan: PlanId) {
  return async (req: PlanRequest, res: Response, next: NextFunction): Promise<void> => {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const resolved = await getUserPlan(uid);
      if (!planAtLeast(resolved.plan, minPlan)) {
        res.status(403).json({
          error: 'plan_required',
          message: `Bu ozellik ${PLANS[minPlan].name} plani gerektiriyor`,
          currentPlan: resolved.plan,
          requiredPlan: minPlan,
          status: resolved.status
        });
        return;
      }
      req.plan = resolved.plan;
      next();
    } catch (err) {
      console.error('[requirePlan] hata', err);
      res.status(500).json({ error: 'plan_check_failed' });
    }
  };
}

export interface ConsumeResult {
  ok: boolean;
  reason?: 'daily_quota_exceeded' | 'monthly_quota_exceeded' | 'feature_not_in_plan';
  usedDaily?: number;
  usedMonthly?: number;
  remainingDaily?: number | null;
  remainingMonthly?: number | null;
  limitDaily?: number | null;
  limitMonthly?: number | null;
}

/**
 * Bir meter icin kota tuket. Transaction ile atomik: limit asilirsa
 * ok=false doner, sayaclar degismez.
 */
export async function consumeQuota(
  uid: string,
  meter: MeterId,
  plan: PlanId
): Promise<ConsumeResult> {
  const quota = PLANS[plan].quotas[meter];
  const db = getFirestore();
  const day = todayKey();
  const month = monthKey();

  const dailyRef = db.collection('users').doc(uid).collection('usageDaily').doc(day);
  const monthlyRef = db.collection('users').doc(uid).collection('usageMonthly').doc(month);

  // 0 quota = ozellik plana dahil degil
  if (quota.monthly === 0) {
    return {
      ok: false,
      reason: 'feature_not_in_plan',
      limitDaily: quota.daily,
      limitMonthly: quota.monthly
    };
  }

  return db.runTransaction(async (tx) => {
    const [daySnap, monthSnap] = await Promise.all([tx.get(dailyRef), tx.get(monthlyRef)]);
    const usedDaily = (daySnap.data()?.[meter] as number | undefined) ?? 0;
    const usedMonthly = (monthSnap.data()?.[meter] as number | undefined) ?? 0;

    if (quota.daily !== null && usedDaily >= quota.daily) {
      return {
        ok: false,
        reason: 'daily_quota_exceeded',
        usedDaily,
        usedMonthly,
        remainingDaily: 0,
        remainingMonthly:
          quota.monthly !== null ? Math.max(0, quota.monthly - usedMonthly) : null,
        limitDaily: quota.daily,
        limitMonthly: quota.monthly
      };
    }
    if (quota.monthly !== null && usedMonthly >= quota.monthly) {
      return {
        ok: false,
        reason: 'monthly_quota_exceeded',
        usedDaily,
        usedMonthly,
        remainingDaily: 0,
        remainingMonthly: 0,
        limitDaily: quota.daily,
        limitMonthly: quota.monthly
      };
    }

    tx.set(
      dailyRef,
      { [meter]: FieldValue.increment(1), date: day, lastUpdated: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(
      monthlyRef,
      {
        [meter]: FieldValue.increment(1),
        month,
        lastUpdated: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      ok: true,
      usedDaily: usedDaily + 1,
      usedMonthly: usedMonthly + 1,
      remainingDaily: quota.daily !== null ? quota.daily - usedDaily - 1 : null,
      remainingMonthly: quota.monthly !== null ? quota.monthly - usedMonthly - 1 : null,
      limitDaily: quota.daily,
      limitMonthly: quota.monthly
    };
  });
}

/**
 * Basarisiz operasyon durumunda tuketilen kotayi geri ver (best-effort).
 * Transaction disi; rollback saglamaz — sadece normal durumlarda calisir.
 */
export async function refundQuota(uid: string, meter: MeterId): Promise<void> {
  try {
    const db = getFirestore();
    const dailyRef = db.collection('users').doc(uid).collection('usageDaily').doc(todayKey());
    const monthlyRef = db
      .collection('users')
      .doc(uid)
      .collection('usageMonthly')
      .doc(monthKey());
    await Promise.all([
      dailyRef.set(
        { [meter]: FieldValue.increment(-1), lastUpdated: FieldValue.serverTimestamp() },
        { merge: true }
      ),
      monthlyRef.set(
        { [meter]: FieldValue.increment(-1), lastUpdated: FieldValue.serverTimestamp() },
        { merge: true }
      )
    ]);
  } catch (err) {
    console.warn('[refundQuota] geri iade basarisiz', { uid, meter, err });
  }
}

/**
 * UI icin: mevcut kotayi tuketmeden oku. Her meter icin daily/monthly
 * used ve limit bilgilerini doner.
 */
export async function getQuotaStatus(
  uid: string,
  plan: PlanId
): Promise<Record<MeterId, ConsumeResult>> {
  const db = getFirestore();
  const [daySnap, monthSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('usageDaily').doc(todayKey()).get(),
    db.collection('users').doc(uid).collection('usageMonthly').doc(monthKey()).get()
  ]);
  const dayData = (daySnap.data() ?? {}) as Record<string, number | Timestamp>;
  const monthData = (monthSnap.data() ?? {}) as Record<string, number | Timestamp>;

  const meters: MeterId[] = ['linkAnalysis', 'storeProductAnalysis', 'legalCheck', 'supplier'];
  const out = {} as Record<MeterId, ConsumeResult>;

  for (const meter of meters) {
    const quota = PLANS[plan].quotas[meter];
    const usedDaily = (dayData[meter] as number | undefined) ?? 0;
    const usedMonthly = (monthData[meter] as number | undefined) ?? 0;

    out[meter] = {
      ok: true,
      usedDaily,
      usedMonthly,
      remainingDaily: quota.daily !== null ? Math.max(0, quota.daily - usedDaily) : null,
      remainingMonthly:
        quota.monthly !== null ? Math.max(0, quota.monthly - usedMonthly) : null,
      limitDaily: quota.daily,
      limitMonthly: quota.monthly
    };
  }
  return out;
}
