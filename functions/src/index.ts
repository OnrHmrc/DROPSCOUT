import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import express from 'express';
import { verifyAuthToken } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { healthHandler } from './endpoints/health';
import { analyzeProductHandler } from './endpoints/analyzeProduct';
import {
  connectPlatformHandler,
  syncPlatformHandler,
  getPlatformStatusHandler,
  disconnectPlatformHandler
} from './endpoints/platforms';
import { getMyPlanHandler, getMyUsageHandler } from './endpoints/me';
import { getTrendsHandler } from './endpoints/trends';
import { getGapRadarHandler } from './endpoints/gapRadar';
import { searchSuppliersHandler } from './endpoints/suppliers';
import { requirePlan } from './middleware/plan';
import { CLAUDE_API_KEY } from './lib/claude';
import { ENCRYPTION_KEY } from './lib/crypto';
import { SENTRY_DSN, initSentry, sentryErrorHandler } from './lib/sentry';
import { ALERT_WEBHOOK_URL } from './lib/alerts';
import { SERPAPI_KEY } from './lib/serpapi';
import {
  APIFY_TOKEN,
  APIFY_GAP_ACTOR_ID,
  APIFY_SUPPLIER_ACTOR_ID,
  APIFY_TRENDYOL_ACTOR_ID,
  APIFY_HEPSIBURADA_ACTOR_ID,
  APIFY_N11_ACTOR_ID,
  APIFY_AMAZON_TR_ACTOR_ID
} from './lib/apify';

// Sentry init — cold start'ta bir kez
initSentry();

setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 30
});

const app = express();
app.use(express.json({ limit: '512kb' }));

const router = express.Router();
router.use(verifyAuthToken);
router.use(rateLimit);
router.get('/health', healthHandler);
router.get('/me/plan', getMyPlanHandler);
router.get('/me/usage', getMyUsageHandler);
router.get('/trends', getTrendsHandler);
router.post('/analyze-product', analyzeProductHandler);
router.post('/platforms/connect', connectPlatformHandler);
router.post('/platforms/sync', syncPlatformHandler);
router.get('/platforms/status', getPlatformStatusHandler);
router.post('/platforms/disconnect', disconnectPlatformHandler);
router.get('/gap-radar', requirePlan('business'), getGapRadarHandler);
router.post('/suppliers', requirePlan('pro'), searchSuppliersHandler);

app.use('/api', router);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Sentry hata yakalayici — 404'ten sonra, generic 500 fallback'ten once
app.use(sentryErrorHandler());

// Generic 500 fallback
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: 'internal_error', message });
});

export const api = onRequest(
  {
    secrets: [
      CLAUDE_API_KEY,
      ENCRYPTION_KEY,
      SENTRY_DSN,
      ALERT_WEBHOOK_URL,
      SERPAPI_KEY,
      APIFY_TOKEN,
      APIFY_GAP_ACTOR_ID,
      APIFY_SUPPLIER_ACTOR_ID,
      APIFY_TRENDYOL_ACTOR_ID,
      APIFY_HEPSIBURADA_ACTOR_ID,
      APIFY_N11_ACTOR_ID,
      APIFY_AMAZON_TR_ACTOR_ID
    ]
  },
  app
);

export {
  scheduledCleanupCache,
  scheduledSyncActiveStores,
  scheduledRefreshTrends,
  scheduledCleanupOldUsage
} from './schedulers';
