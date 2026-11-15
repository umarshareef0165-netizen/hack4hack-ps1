import { Router } from 'express';
import { Team } from '../models';
import { requireAuth } from '../middleware/auth';
import { HACKATHON_ID } from '../utils/constants';

const router = Router();

/**
 * GET /api/board — the "looking for teammates" board.
 * Indexed query (hackathonId, lookingForTeammates, createdAt) so it stays
 * fast at 2,000 teams; this is the endpoint the load test measures
 * (100 concurrent users, p95 target < 200 ms).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const [teams, total] = await Promise.all([
      Team.find({ hackathonId: HACKATHON_ID, lookingForTeammates: true })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name description leaderId memberCount maxSize lookingForTeammates createdAt')
        .lean(),
      Team.countDocuments({ hackathonId: HACKATHON_ID, lookingForTeammates: true }),
    ]);
    res.json({
      teams: teams.map((t) => ({
        id: String(t._id),
        name: t.name,
        description: t.description,
        leaderId: String(t.leaderId),
        memberCount: t.memberCount,
        maxSize: t.maxSize,
        openSeats: t.maxSize - t.memberCount,
        lookingForTeammates: t.lookingForTeammates,
        createdAt: t.createdAt,
      })),
      page,
      limit,
      total,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
