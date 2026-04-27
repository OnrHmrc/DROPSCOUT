import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import '../lib/firebase-admin';

export interface AuthRequest extends Request {
  uid?: string;
  email?: string;
}

export async function verifyAuthToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token', message: 'Authorization header gerekli' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid_token', message: 'Token geçersiz veya süresi dolmuş' });
  }
}
