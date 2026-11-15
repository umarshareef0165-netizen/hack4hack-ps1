import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { unauthorized } from '../utils/errors';

export interface AuthedRequest extends Request {
  userId?: string;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Dev-only fallback. Production must set JWT_SECRET (see DEPLOY-README).
    console.warn('[auth] JWT_SECRET not set — using dev-only fallback secret');
    return 'dev-only-secret-change-me';
  }
  return secret;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: '7d' });
}

/** Require a valid Bearer token; attaches req.userId. */
export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token || typeof token !== 'string') throw unauthorized();
    const payload = jwt.verify(token, jwtSecret()) as { sub: string };
    const user = await User.findById(payload.sub).select('_id').lean();
    if (!user) throw unauthorized('Account no longer exists');
    req.userId = String(user._id);
    next();
  } catch (err) {
    next(err instanceof Error && err.name === 'JsonWebTokenError' ? unauthorized('Invalid token') : err);
  }
}
