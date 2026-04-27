import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

export function healthHandler(req: AuthRequest, res: Response): void {
  res.json({
    ok: true,
    uid: req.uid,
    email: req.email,
    serverTime: new Date().toISOString(),
    region: 'europe-west1'
  });
}
