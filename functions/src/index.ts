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
import { getMyPlanHandler, getMyUsageHandler, getDataExportHandler, deleteAccountHandler } from './endpoints/me';
import { getTrendsHandler } from './endpoints/trends';
import { getGapRadarHandler } from './endpoints/gapRadar';
import { searchSuppliersHandler } from './endpoints/suppliers';
import { requirePlan } from './middleware/plan';
import { CLAUDE_API_KEY } from './lib/claude';
import { SENTRY_DSN, initSentry, sentryErrorHandler } from './lib/sentry';
import { ALERT_WEBHOOK_URL } from './lib/alerts';
import {
  APIFY_TOKEN,
  APIFY_GAP_ACTOR_ID,
  APIFY_SUPPLIER_ACTOR_ID,
  APIFY_DOUYIN_ACTOR_ID,
  APIFY_XIAOHONGSHU_ACTOR_ID,
  APIFY_TAOBAO_ACTOR_ID,
  APIFY_COUPANG_ACTOR_ID,
  APIFY_RAKUTEN_ACTOR_ID,
  APIFY_MERCARI_JP_ACTOR_ID
} from './lib/apify';
import { SERPAPI_KEY } from './lib/serpapi';

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
router.get('/me/data-export', getDataExportHandler);
router.post('/me/delete-account', deleteAccountHandler);
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
  console.error('[api 500]', err);
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: 'internal_error', message });
});

export const api = onRequest(
  {
    secrets: [
      CLAUDE_API_KEY,
      SENTRY_DSN,
      ALERT_WEBHOOK_URL,
      APIFY_TOKEN,
      APIFY_GAP_ACTOR_ID,
      APIFY_SUPPLIER_ACTOR_ID,
      APIFY_DOUYIN_ACTOR_ID,
      APIFY_XIAOHONGSHU_ACTOR_ID,
      APIFY_TAOBAO_ACTOR_ID,
      APIFY_COUPANG_ACTOR_ID,
      APIFY_RAKUTEN_ACTOR_ID,
      APIFY_MERCARI_JP_ACTOR_ID,
      SERPAPI_KEY
    ]
  },
  app
);

export {
  scheduledCleanupCache,
  scheduledSyncActiveStores,
  scheduledCleanupOldUsage
} from './schedulers';
