import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models';
import { requireAuth, signToken, type AuthedRequest } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import { conflict, unauthorized } from '../utils/errors';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  timezoneOffset: z.number().min(-12).max(14).default(0),
  lookingForTeam: z.boolean().default(true),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(u: { _id: unknown; name: string; email: string; skills: string[]; timezoneOffset: number; lookingForTeam: boolean; teamId: unknown }) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    skills: u.skills,
    timezoneOffset: u.timezoneOffset,
    lookingForTeam: u.lookingForTeam,
    teamId: u.teamId ? String(u.teamId) : null,
  };
}

router.post('/register', idempotency, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, skills, timezoneOffset, lookingForTeam } = req.body as z.infer<typeof registerSchema>;
    const existing = await User.findOne({ email }).lean();
    if (existing) throw conflict('An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, skills, timezoneOffset, lookingForTeam });
    res.status(201).json({ user: publicUser(user), token: signToken(String(user._id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await User.findOne({ email });
    if (!user) throw unauthorized('Invalid email or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid email or password');
    res.json({ user: publicUser(user), token: signToken(String(user._id)) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) throw unauthorized('Account no longer exists');
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
