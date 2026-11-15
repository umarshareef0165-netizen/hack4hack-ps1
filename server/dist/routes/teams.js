"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicTeam = publicTeam;
const express_1 = require("express");
const zod_1 = require("zod");
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const idempotency_1 = require("../middleware/idempotency");
const validate_1 = require("../middleware/validate");
const teamService = __importStar(require("../services/teamService"));
const constants_1 = require("../utils/constants");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// All team routes require authentication.
router.use(auth_1.requireAuth);
const createTeamSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80),
    description: zod_1.z.string().max(1000).default(''),
    maxSize: zod_1.z.number().int().min(2).max(5).default(5),
    lookingForTeammates: zod_1.z.boolean().default(true),
});
const joinCodeSchema = zod_1.z.object({
    inviteCode: zod_1.z.string().trim().min(1).max(64),
});
/** Public team shape — inviteCodeHash is NEVER sent to clients. */
function publicTeam(t) {
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
function toObjectId(id) {
    return new mongoose_1.default.Types.ObjectId(id);
}
// --- Create ----------------------------------------------------------------
router.post('/', idempotency_1.idempotency, (0, validate_1.validateBody)(createTeamSchema), async (req, res, next) => {
    try {
        const { team, inviteCode } = await teamService.createTeam(toObjectId(req.userId), req.body);
        // Invite code is returned exactly once, at creation.
        res.status(201).json({ team: publicTeam(team), inviteCode });
    }
    catch (err) {
        next(err);
    }
});
// --- Join by invite code (rate-limited in app.ts) ---------------------------
router.post('/join-by-code', idempotency_1.idempotency, (0, validate_1.validateBody)(joinCodeSchema), async (req, res, next) => {
    try {
        const team = await teamService.joinByCode(toObjectId(req.userId), req.body.inviteCode);
        res.json({ team: publicTeam(team) });
    }
    catch (err) {
        next(err);
    }
});
// --- List my team (defined BEFORE /:teamId so "mine" is not treated as an id) ---
router.get('/mine/current', async (req, res, next) => {
    try {
        const team = await models_1.Team.findOne({ 'members.userId': toObjectId(req.userId), hackathonId: constants_1.HACKATHON_ID }).lean();
        res.json({ team: team ? publicTeam(team) : null });
    }
    catch (err) {
        next(err);
    }
});
// --- Get one team -----------------------------------------------------------
router.get('/:teamId', (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const team = await models_1.Team.findOne({ _id: req.params.teamId, hackathonId: constants_1.HACKATHON_ID }).lean();
        if (!team)
            throw (0, errors_1.notFound)('Team not found');
        res.json({ team: publicTeam(team) });
    }
    catch (err) {
        next(err);
    }
});
// --- Join requests ----------------------------------------------------------
router.post('/:teamId/requests', idempotency_1.idempotency, (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const request = await teamService.requestJoin(toObjectId(req.userId), toObjectId(req.params.teamId));
        res.status(201).json({
            request: { id: String(request._id), teamId: String(request.teamId), userId: String(request.userId), status: request.status },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:teamId/requests', (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const team = await models_1.Team.findById(req.params.teamId).lean();
        if (!team)
            throw (0, errors_1.notFound)('Team not found');
        if (String(team.leaderId) !== req.userId)
            throw (0, errors_1.forbidden)('Only the team leader can view join requests');
        const requests = await models_1.JoinRequest.find({ teamId: team._id, status: 'pending' }).sort({ createdAt: 1 }).lean();
        res.json({
            requests: requests.map((r) => ({ id: String(r._id), teamId: String(r.teamId), userId: String(r.userId), status: r.status, createdAt: r.createdAt })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/requests/:requestId/respond', (0, validate_1.validateParam)('requestId'), (0, validate_1.validateBody)(zod_1.z.object({ decision: zod_1.z.enum(['accepted', 'declined']) })), async (req, res, next) => {
    try {
        const request = await teamService.respondJoin(toObjectId(req.userId), toObjectId(req.params.requestId), req.body.decision);
        res.json({ request: { id: String(request._id), status: request.status } });
    }
    catch (err) {
        next(err);
    }
});
// --- Leave / remove / regenerate invite code --------------------------------
router.post('/:teamId/leave', (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const result = await teamService.leaveTeam(toObjectId(req.userId), toObjectId(req.params.teamId));
        if (result.deleted) {
            res.json({ deleted: true, team: null });
            return;
        }
        res.json({ deleted: false, team: publicTeam(result.team) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:teamId/members/:memberId/remove', (0, validate_1.validateParam)('teamId'), (0, validate_1.validateParam)('memberId'), async (req, res, next) => {
    try {
        const team = await teamService.removeMember(toObjectId(req.userId), toObjectId(req.params.teamId), toObjectId(req.params.memberId));
        res.json({ team: publicTeam(team) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:teamId/invite-code/regenerate', (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const { team, inviteCode } = await teamService.regenerateInviteCode(toObjectId(req.userId), toObjectId(req.params.teamId));
        res.json({ team: publicTeam(team), inviteCode });
    }
    catch (err) {
        next(err);
    }
});
// --- Audit log for a team (members only) ------------------------------------
router.get('/:teamId/audit', (0, validate_1.validateParam)('teamId'), async (req, res, next) => {
    try {
        const team = await models_1.Team.findById(req.params.teamId).lean();
        if (!team)
            throw (0, errors_1.notFound)('Team not found');
        const isMember = team.members.some((m) => String(m.userId) === req.userId);
        if (!isMember)
            throw (0, errors_1.forbidden)('Only team members can view the audit log');
        const entries = await models_1.AuditLog.find({ teamId: team._id }).sort({ createdAt: -1 }).limit(200).lean();
        res.json({
            audit: entries.map((e) => ({
                id: String(e._id),
                action: e.action,
                actorId: e.actorId ? String(e.actorId) : null,
                details: e.details,
                createdAt: e.createdAt,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=teams.js.map