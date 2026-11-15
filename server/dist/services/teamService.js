"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTeam = createTeam;
exports.joinByCode = joinByCode;
exports.requestJoin = requestJoin;
exports.respondJoin = respondJoin;
exports.removeMember = removeMember;
exports.leaveTeam = leaveTeam;
exports.regenerateInviteCode = regenerateInviteCode;
const models_1 = require("../models");
const constants_1 = require("../utils/constants");
const crypto_1 = require("../utils/crypto");
const errors_1 = require("../utils/errors");
const tx_1 = require("../utils/tx");
const events_1 = require("./events");
// ---------------------------------------------------------------------------
// Audit log: every team change is written in the SAME transaction as the
// change itself, so a change can never exist without its audit record.
// ---------------------------------------------------------------------------
async function audit(session, fields) {
    await models_1.AuditLog.create([{ hackathonId: constants_1.HACKATHON_ID, teamId: fields.teamId, actorId: fields.actorId, action: fields.action, details: fields.details ?? {} }], { session });
}
// ---------------------------------------------------------------------------
// THE race-proof primitive.
//
// claimSeat atomically adds ONE user to a team, and it is impossible for two
// concurrent claims to both take the same last seat — by construction, not
// by timing:
//
//   filter: { _id, memberCount: { $lt: maxSize }, 'members.userId': { $ne: userId } }
//   update: { $inc: { memberCount: 1 }, $push: { members: { userId, joinedAt } } }
//
// MongoDB applies a single-document update atomically: the filter is
// evaluated against the document state at the moment the update is applied.
// When 50 requests race for 1 seat, the first update raises memberCount to
// maxSize; every later update sees `memberCount < maxSize` as FALSE and
// matches zero documents, so findOneAndUpdate returns null and the caller
// gets a 409. No lock, no queue, no "check then write" gap — the check and
// the write are the same operation.
//
// The caller's transaction additionally guarantees the user is in no other
// team (user.teamId is set in the same transaction; two concurrent joins by
// the same user conflict on the user document and one aborts).
// ---------------------------------------------------------------------------
async function claimSeat(session, teamId, userId, maxSize) {
    const updated = await models_1.Team.findOneAndUpdate({
        _id: teamId,
        memberCount: { $lt: maxSize },
        'members.userId': { $ne: userId },
    }, {
        $inc: { memberCount: 1 },
        $push: { members: { userId, joinedAt: new Date() } },
    }, { session, new: true });
    return updated !== null;
}
async function assertUserHasNoTeam(session, userId) {
    const user = await models_1.User.findById(userId).session(session);
    if (!user)
        throw (0, errors_1.notFound)('User not found');
    if (user.teamId)
        throw (0, errors_1.conflict)('You are already in a team for this hackathon');
}
async function setUserTeam(session, userId, teamId) {
    await models_1.User.updateOne({ _id: userId }, { $set: { teamId } }, { session });
}
async function createTeam(userId, input) {
    const maxSize = input.maxSize ?? constants_1.MAX_TEAM_SIZE;
    if (maxSize < constants_1.MIN_TEAM_SIZE || maxSize > constants_1.MAX_TEAM_SIZE) {
        throw (0, errors_1.badRequest)(`maxSize must be between ${constants_1.MIN_TEAM_SIZE} and ${constants_1.MAX_TEAM_SIZE}`);
    }
    const inviteCode = (0, crypto_1.generateInviteCode)();
    const team = await (0, tx_1.withTransaction)(async (session) => {
        await assertUserHasNoTeam(session, userId);
        const created = await models_1.Team.create([
            {
                hackathonId: constants_1.HACKATHON_ID,
                name: input.name,
                description: input.description ?? '',
                leaderId: userId,
                members: [{ userId, joinedAt: new Date() }],
                memberCount: 1,
                maxSize,
                lookingForTeammates: input.lookingForTeammates ?? true,
                inviteCodeHash: (0, crypto_1.sha256)(inviteCode),
                inviteCodeExpiresAt: new Date(Date.now() + constants_1.INVITE_CODE_TTL_MS),
            },
        ], { session });
        const doc = created[0];
        await setUserTeam(session, userId, doc._id);
        await audit(session, { teamId: doc._id, actorId: userId, action: 'team.created', details: { name: input.name, maxSize } });
        return doc;
    });
    (0, events_1.broadcast)({ type: 'team.created', teamId: String(team._id), actorId: String(userId) });
    // The plaintext invite code is returned exactly once, at creation.
    return { team: team.toObject(), inviteCode };
}
async function joinByCode(userId, inviteCode) {
    const team = await (0, tx_1.withTransaction)(async (session) => {
        // Invite codes are stored hashed; a lookup by hash keeps the code itself
        // out of the database. Expired codes are rejected, never silently honoured.
        const candidate = await models_1.Team.findOne({
            inviteCodeHash: (0, crypto_1.sha256)(inviteCode),
            inviteCodeExpiresAt: { $gt: new Date() },
        }).session(session);
        if (!candidate)
            throw (0, errors_1.gone)('Invite code is invalid or expired');
        await assertUserHasNoTeam(session, userId);
        const claimed = await claimSeat(session, candidate._id, userId, candidate.maxSize);
        if (!claimed)
            throw (0, errors_1.conflict)('Team is full');
        await setUserTeam(session, userId, candidate._id);
        await audit(session, { teamId: candidate._id, actorId: userId, action: 'team.joined_by_code', details: {} });
        return candidate;
    });
    (0, events_1.broadcast)({ type: 'team.member_joined', teamId: String(team._id), actorId: String(userId) });
    return team;
}
async function requestJoin(userId, teamId) {
    const request = await (0, tx_1.withTransaction)(async (session) => {
        const team = await models_1.Team.findById(teamId).session(session);
        if (!team)
            throw (0, errors_1.notFound)('Team not found');
        await assertUserHasNoTeam(session, userId);
        if (team.memberCount >= team.maxSize)
            throw (0, errors_1.conflict)('Team is full');
        if (team.members.some((m) => String(m.userId) === String(userId))) {
            throw (0, errors_1.conflict)('You are already a member of this team');
        }
        try {
            const created = await models_1.JoinRequest.create([{ teamId, userId, status: 'pending' }], { session });
            await audit(session, { teamId, actorId: userId, action: 'join.requested', details: {} });
            return created[0];
        }
        catch (err) {
            // Unique partial index on (teamId, userId, pending) — a second pending
            // request for the same team is a conflict, not a second request.
            if (err?.code === 11000)
                throw (0, errors_1.conflict)('You already have a pending request for this team');
            throw err;
        }
    });
    (0, events_1.broadcast)({ type: 'team.join_requested', teamId: String(teamId), actorId: String(userId) });
    return request;
}
async function respondJoin(leaderId, requestId, decision) {
    const request = await (0, tx_1.withTransaction)(async (session) => {
        const req = await models_1.JoinRequest.findById(requestId).session(session);
        if (!req)
            throw (0, errors_1.notFound)('Join request not found');
        if (req.status !== 'pending')
            throw (0, errors_1.conflict)(`Request was already ${req.status}`);
        const team = await models_1.Team.findById(req.teamId).session(session);
        if (!team)
            throw (0, errors_1.notFound)('Team not found');
        // Only the leader can accept or decline — enforced server-side, always.
        if (String(team.leaderId) !== String(leaderId)) {
            throw (0, errors_1.forbidden)('Only the team leader can accept or decline requests');
        }
        if (decision === 'declined') {
            req.status = 'declined';
            await req.save({ session });
            await audit(session, { teamId: team._id, actorId: leaderId, action: 'join.declined', details: { userId: String(req.userId) } });
            return req;
        }
        // Accept goes through the SAME atomic claim as a code join, so a race
        // between "accept" and "last seat taken by code" cannot overfill a team.
        await assertUserHasNoTeam(session, req.userId);
        const claimed = await claimSeat(session, team._id, req.userId, team.maxSize);
        if (!claimed)
            throw (0, errors_1.conflict)('Team is full — the last seat was taken');
        req.status = 'accepted';
        await req.save({ session });
        await setUserTeam(session, req.userId, team._id);
        await audit(session, { teamId: team._id, actorId: leaderId, action: 'join.accepted', details: { userId: String(req.userId) } });
        return req;
    });
    (0, events_1.broadcast)({ type: `team.join_${decision}`, teamId: String(request.teamId), actorId: String(leaderId) });
    return request;
}
async function removeMember(leaderId, teamId, memberId) {
    const team = await (0, tx_1.withTransaction)(async (session) => {
        const doc = await models_1.Team.findById(teamId).session(session);
        if (!doc)
            throw (0, errors_1.notFound)('Team not found');
        if (String(doc.leaderId) !== String(leaderId))
            throw (0, errors_1.forbidden)('Only the team leader can remove members');
        if (String(memberId) === String(leaderId))
            throw (0, errors_1.badRequest)('The leader cannot remove themselves — leave the team instead');
        const updated = await models_1.Team.findOneAndUpdate({ _id: teamId, 'members.userId': memberId }, { $pull: { members: { userId: memberId } }, $inc: { memberCount: -1 } }, { session, new: true });
        if (!updated)
            throw (0, errors_1.notFound)('Member is not in this team');
        await setUserTeam(session, memberId, null);
        await audit(session, { teamId, actorId: leaderId, action: 'member.removed', details: { userId: String(memberId) } });
        return updated;
    });
    (0, events_1.broadcast)({ type: 'team.member_removed', teamId: String(teamId), actorId: String(leaderId) });
    return team;
}
async function leaveTeam(userId, teamId) {
    const result = await (0, tx_1.withTransaction)(async (session) => {
        const doc = await models_1.Team.findById(teamId).session(session);
        if (!doc)
            throw (0, errors_1.notFound)('Team not found');
        if (!doc.members.some((m) => String(m.userId) === String(userId))) {
            throw (0, errors_1.conflict)('You are not a member of this team');
        }
        const isLeader = String(doc.leaderId) === String(userId);
        const isLastMember = doc.memberCount <= 1;
        if (isLastMember) {
            // Last member leaving deletes the team — a rule, not a leftover.
            await models_1.Team.deleteOne({ _id: teamId }, { session });
            await setUserTeam(session, userId, null);
            await audit(session, { teamId, actorId: userId, action: 'team.deleted', details: { reason: 'last_member_left' } });
            return { deleted: true, team: null };
        }
        const updated = await models_1.Team.findOneAndUpdate({ _id: teamId, 'members.userId': userId }, { $pull: { members: { userId } }, $inc: { memberCount: -1 } }, { session, new: true });
        if (!updated)
            throw (0, errors_1.conflict)('Could not leave team');
        await setUserTeam(session, userId, null);
        if (isLeader) {
            // Leadership passes to the longest-standing member (join order).
            const nextLeader = [...updated.members].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
            updated.leaderId = nextLeader.userId;
            await updated.save({ session });
            await audit(session, {
                teamId,
                actorId: userId,
                action: 'leader.left',
                details: { newLeaderId: String(nextLeader.userId) },
            });
        }
        await audit(session, { teamId, actorId: userId, action: 'member.left', details: {} });
        return { deleted: false, team: updated };
    });
    (0, events_1.broadcast)({ type: 'team.member_left', teamId: String(teamId), actorId: String(userId) });
    return result;
}
async function regenerateInviteCode(leaderId, teamId) {
    const inviteCode = (0, crypto_1.generateInviteCode)();
    const team = await (0, tx_1.withTransaction)(async (session) => {
        const doc = await models_1.Team.findById(teamId).session(session);
        if (!doc)
            throw (0, errors_1.notFound)('Team not found');
        if (String(doc.leaderId) !== String(leaderId))
            throw (0, errors_1.forbidden)('Only the team leader can regenerate the invite code');
        doc.inviteCodeHash = (0, crypto_1.sha256)(inviteCode);
        doc.inviteCodeExpiresAt = new Date(Date.now() + constants_1.INVITE_CODE_TTL_MS);
        await doc.save({ session });
        await audit(session, { teamId, actorId: leaderId, action: 'invite_code.regenerated', details: {} });
        return doc;
    });
    return { team, inviteCode };
}
//# sourceMappingURL=teamService.js.map