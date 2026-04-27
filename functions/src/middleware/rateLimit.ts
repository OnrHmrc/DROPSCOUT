import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';

// 60 istek / dakika / kullanici (architecture.md §3.5)
// In-memory token bucket — Cloud Run instance'larina dagitik degil; max 10
// instance × 60 = 600/dak teorik tavan, kotuye kullanima karsi 1.satir
// koruma. Daha sert sinir gerekirse Firestore counter eklenecek.

const RATE_PER_MIN = 60;
const REFILL_PER_MS = RATE_PER_MIN / 60_000;
const MAX_BUCKETS = 5_000;
const PRUNE_TARGET = 4_000;
const IDLE_PRUNE_MS = 5 * 60_000;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function pruneIfNeeded(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  const cutoff = now - IDLE_PRUNE_MS;
  const stale: string[] = [];
  for (const [k, v] of buckets) {
    if (v.lastRefill < cutoff) stale.push(k);
    if (stale.length >= PRUNE_TARGET) break;
  }
  for (const k of stale) buckets.delete(k);
  // Hala dolu: en eski erisilenleri at
  if (buckets.size > MAX_BUCKETS) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].lastRefill - b[1].lastRefill);
    for (let i = 0; i < buckets.size - PRUNE_TARGET; i++) {
      buckets.delete(sorted[i][0]);
    }
  }
}

function bucketKey(req: AuthRequest): string {
  if (req.uid) return `u:${req.uid}`;
  // IP fallback (auth'suz path'ler icin — su an hicbir public path yok)
  return `ip:${req.ip || 'unknown'}`;
}

export function rateLimit(req: AuthRequest, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = bucketKey(req);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: RATE_PER_MIN, lastRefill: now };
    buckets.set(key, bucket);
    pruneIfNeeded(now);
  } else {
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(RATE_PER_MIN, bucket.tokens + elapsed * REFILL_PER_MS);
    bucket.lastRefill = now;
  }

  if (bucket.tokens < 1) {
    const waitSeconds = Math.ceil((1 - bucket.tokens) / REFILL_PER_MS / 1000);
    res.setHeader('Retry-After', String(waitSeconds));
    res.status(429).json({
      error: 'rate_limited',
      message: `Çok fazla istek (60/dakika). ${waitSeconds} sn sonra tekrar deneyin.`,
      retryAfterSeconds: waitSeconds,
      limit: RATE_PER_MIN,
      window: '1m'
    });
    return;
  }
  bucket.tokens -= 1;
  next();
}
