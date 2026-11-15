import type { Response } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { addClient, broadcast, removeClient } from '../services/events';

const router = Router();

/**
 * GET /api/events — Server-Sent Events stream for live board/team updates.
 * EventSource cannot send Authorization headers, so the JWT is passed as
 * ?token=... (same token, same verification, short-lived stream).
 * Events: team.created, team.member_joined, team.member_left,
 * team.member_removed, team.join_requested, team.join_accepted,
 * team.join_declined.
 */
router.get('/', async (req, res: Response) => {
  const token = req.query.token;
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    return;
  }
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
    const payload = jwt.verify(token, secret) as { sub: string };
    const user = await User.findById(payload.sub).select('_id').lean();
    if (!user) throw new Error('no user');
  } catch {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid token' } });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  addClient(res);
  // Heartbeat every 25 s so proxies do not close the stream.
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

// Test/debug helper (not part of the public API surface in production docs).
export { broadcast };

export default router;
