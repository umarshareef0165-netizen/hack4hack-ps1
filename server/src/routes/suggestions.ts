import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { suggestTeammates } from '../services/suggestions';

const router = Router();

/**
 * GET /api/suggestions?limit=10 — ranked teammate suggestions.
 * Response includes the score breakdown (skillComplement, timezoneOverlap)
 * and a plain-English explanation per candidate.
 */
router.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 50);
    const suggestions = await suggestTeammates(req.userId!, limit);
    res.json({
      suggestions,
      scoring: 'score = 0.6 * skillComplement + 0.4 * timezoneOverlap; ' +
        'skillComplement = share of the candidate\'s skills you lack; ' +
        'timezoneOverlap = shared 09:00-17:00 working hours / 8.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
