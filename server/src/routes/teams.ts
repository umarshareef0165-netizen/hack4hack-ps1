import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { AuditLog, JoinRequest, Team } from '../models';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { validateBody, validateParam } from '../middleware/validate';
import * as teamService from '../services/teamService';
import { HACKATHON_ID } from '../utils/constants';
import { badRequest, forbidden, notFound } from '../utils/errors';

const router = Router();

// All team routes require authentication.
router.use(requireAuth);

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(''),
  maxSize: z.number().int().min(2).max(5).default(5),
  lookingForTeammates: z.boolean().default(true),
});

const joinCodeSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});

/** Public team shape — inviteCodeHash is NEVER sent to clients. */
export function publicTeam(t: {
  _id: unknown; name: string; description: string; leaderId: unknown;
  members: { userId: unknown; joinedAt: Date }[]; memberCount: number;
  maxSize: number; lookingForTeammates: boolean; inviteCodeExpiresAt: Date;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: String(t._id),
    name: t.name,
    description: t.description,
    leaderId: String(t.leaderId),
    members: t.members.map((m) => ({ userId: String(m.userId), joinedAt: m.joinedAt })),
    memberCount: t.memberCount,
    maxSize: t.maxSize,
    lookingForTeammates: t.lookingForTeammates,
    inviteCodeExpiresAt: t.inviteCodeExpiresAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

// --- Create ----------------------------------------------------------------
router.post('/', idempotency, validateBody(createTeamSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { team, inviteCode } = await teamService.createTeam(toObjectId(req.userId!), req.body);
    // Invite code is returned exactly once, at creation.
    res.status(201).json({ team: publicTeam(team), inviteCode });
  } catch (err) {
    next(err);
  }
});

// --- Join by invite code (rate-limited in app.ts) ---------------------------
router.post('/join-by-code', idempotency, validateBody(joinCodeSchema), async (req: AuthedRequest, res, next) => {
  try {
    const team = await teamService.joinByCode(toObjectId(req.userId!), req.body.inviteCode);
    res.json({ team: publicTeam(team) });
  } catch (err) {
    next(err);
  }
});

// --- List my team (defined BEFORE /:teamId so "mine" is not treated as an id) ---
router.get('/mine/current', async (req: AuthedRequest, res, next) => {
  try {
    const team = await Team.findOne({ 'members.userId': toObjectId(req.userId!), hackathonId: HACKATHON_ID }).lean();
    res.json({ team: team ? publicTeam(team) : null });
  } catch (err) {
    next(err);
  }
});

// --- Get one team -----------------------------------------------------------
router.get('/:teamId', validateParam('teamId'), async (req, res, next) => {
  try {
    const team = await Team.findOne({ _id: req.params.teamId, hackathonId: HACKATHON_ID }).lean();
    if (!team) throw notFound('Team not found');
    res.json({ team: publicTeam(team) });
  } catch (err) {
    next(err);
  }
});

// --- Join requests ----------------------------------------------------------
router.post('/:teamId/requests', idempotency, validateParam('teamId'), async (req: AuthedRequest, res, next) => {
  try {
    const request = await teamService.requestJoin(toObjectId(req.userId!), toObjectId(req.params.teamId));
    res.status(201).json({
      request: { id: String(request._id), teamId: String(request.teamId), userId: String(request.userId), status: request.status },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:teamId/requests', validateParam('teamId'), async (req: AuthedRequest, res, next) => {
  try {
    const team = await Team.findById(req.params.teamId).lean();
    if (!team) throw notFound('Team not found');
    if (String(team.leaderId) !== req.userId) throw forbidden('Only the team leader can view join requests');
    const requests = await JoinRequest.find({ teamId: team._id, status: 'pending' }).sort({ createdAt: 1 }).lean();
    res.json({
      requests: requests.map((r) => ({ id: String(r._id), teamId: String(r.teamId), userId: String(r.userId), status: r.status, createdAt: r.createdAt })),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/requests/:requestId/respond',
  validateParam('requestId'),
  validateBody(z.object({ decision: z.enum(['accepted', 'declined']) })),
  async (req: AuthedRequest, res, next) => {
    try {
      const request = await teamService.respondJoin(
        toObjectId(req.userId!),
        toObjectId(req.params.requestId),
        req.body.decision,
      );
      res.json({ request: { id: String(request._id), status: request.status } });
    } catch (err) {
      next(err);
    }
  },
);

// --- Leave / remove / regenerate invite code --------------------------------
router.post('/:teamId/leave', validateParam('teamId'), async (req: AuthedRequest, res, next) => {
  try {
    const result = await teamService.leaveTeam(toObjectId(req.userId!), toObjectId(req.params.teamId));
    if (result.deleted) {
      res.json({ deleted: true, team: null });
      return;
    }
    res.json({ deleted: false, team: publicTeam(result.team!) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:teamId/members/:memberId/remove',
  validateParam('teamId'),
  validateParam('memberId'),
  async (req: AuthedRequest, res, next) => {
    try {
      const team = await teamService.removeMember(
        toObjectId(req.userId!),
        toObjectId(req.params.teamId),
        toObjectId(req.params.memberId),
      );
      res.json({ team: publicTeam(team) });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:teamId/invite-code/regenerate', validateParam('teamId'), async (req: AuthedRequest, res, next) => {
  try {
    const { team, inviteCode } = await teamService.regenerateInviteCode(toObjectId(req.userId!), toObjectId(req.params.teamId));
    res.json({ team: publicTeam(team), inviteCode });
  } catch (err) {
    next(err);
  }
});

// --- Audit log for a team (members only) ------------------------------------
router.get('/:teamId/audit', validateParam('teamId'), async (req: AuthedRequest, res, next) => {
  try {
    const team = await Team.findById(req.params.teamId).lean();
    if (!team) throw notFound('Team not found');
    const isMember = team.members.some((m) => String(m.userId) === req.userId);
    if (!isMember) throw forbidden('Only team members can view the audit log');
    const entries = await AuditLog.find({ teamId: team._id }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      audit: entries.map((e) => ({
        id: String(e._id),
        action: e.action,
        actorId: e.actorId ? String(e.actorId) : null,
        details: e.details,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
