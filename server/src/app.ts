import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import boardRoutes from './routes/board';
import eventsRoutes from './routes/events';
import suggestionsRoutes from './routes/suggestions';
import teamsRoutes from './routes/teams';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));

  // Global abuse guard: 300 requests / 15 min per IP (tunable for tests/CI).
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.RATE_LIMIT_MAX ?? 300), standardHeaders: 'draft-7', legacyHeaders: false }));

  // Health check (no auth) — used by the deploy and by the load-test harness.
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'hack4hack-ps1', time: new Date().toISOString() }));

  // Stricter limits where brute force matters.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT ?? 50),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message: 'Too many attempts — try again later' } },
  });
  const inviteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.INVITE_RATE_LIMIT ?? 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message: 'Too many invite-code attempts — try again in a minute' } },
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  // Invite-code guessing: 10 attempts / minute / IP (+ 96-bit code entropy).
  app.use('/api/teams/join-by-code', inviteLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/board', boardRoutes);
  app.use('/api/suggestions', suggestionsRoutes);
  app.use('/api/events', eventsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
