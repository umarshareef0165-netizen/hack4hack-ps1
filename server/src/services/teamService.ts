import mongoose, { type ClientSession, type Types } from 'mongoose';
import { AuditLog, JoinRequest, Team, User } from '../models';
import { HACKATHON_ID, INVITE_CODE_TTL_MS, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../utils/constants';
import { generateInviteCode, sha256 } from '../utils/crypto';
import { badRequest, conflict, forbidden, gone, notFound } from '../utils/errors';
import { withTransaction } from '../utils/tx';
import { broadcast } from './events';

// ---------------------------------------------------------------------------
// Audit log: every team change is written in the SAME transaction as the
// change itself, so a change can never exist without its audit record.
// ---------------------------------------------------------------------------
async function audit(
  session: ClientSession,
  fields: { teamId: Types.ObjectId | null; actorId: Types.ObjectId | null; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await AuditLog.create(
    [{ hackathonId: HACKATHON_ID, teamId: fields.teamId, actorId: fields.actorId, action: fields.action, details: fields.details ?? {} }],
    { session },
  );
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
async function claimSeat(
  session: ClientSession,
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
  maxSize: number,
): Promise<boolean> {
  const updated = await Team.findOneAndUpdate(
    {
      _id: teamId,
      memberCount: { $lt: maxSize },
      'members.userId': { $ne: userId },
    },
    {
      $inc: { memberCount: 1 },
      $push: { members: { userId, joinedAt: new Date() } },
    },
    { session, new: true },
  );
  return updated !== null;
}

async function assertUserHasNoTeam(session: ClientSession, userId: Types.ObjectId): Promise<void> {
  const user = await User.findById(userId).session(session);
  if (!user) throw notFound('User not found');
  if (user.teamId) throw conflict('You are already in a team for this hackathon');
}

async function setUserTeam(session: ClientSession, userId: Types.ObjectId, teamId: Types.ObjectId | null): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { teamId } }, { session });
}

// ---------------------------------------------------------------------------
// Public operations (each is one transaction: state change + audit record).
// ---------------------------------------------------------------------------

export interface CreateTeamInput {
  name: string;
  description?: string;
  maxSize?: number;
  lookingForTeammates?: boolean;
}

export async function createTeam(userId: Types.ObjectId, input: CreateTeamInput) {
  const maxSize = input.maxSize ?? MAX_TEAM_SIZE;
  if (maxSize < MIN_TEAM_SIZE || maxSize > MAX_TEAM_SIZE) {
    throw badRequest(`maxSize must be between ${MIN_TEAM_SIZE} and ${MAX_TEAM_SIZE}`);
  }
  const inviteCode = generateInviteCode();
  const team = await withTransaction(async (session) => {
    await assertUserHasNoTeam(session, userId);
    const created = await Team.create(
      [
        {
          hackathonId: HACKATHON_ID,
          name: input.name,
          description: input.description ?? '',
          leaderId: userId,
          members: [{ userId, joinedAt: new Date() }],
          memberCount: 1,
          maxSize,
          lookingForTeammates: input.lookingForTeammates ?? true,
          inviteCodeHash: sha256(inviteCode),
          inviteCodeExpiresAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
        },
      ],
      { session },
    );
    const doc = created[0];
    await setUserTeam(session, userId, doc._id);
    await audit(session, { teamId: doc._id, actorId: userId, action: 'team.created', details: { name: input.name, maxSize } });
    return doc;
  });
  broadcast({ type: 'team.created', teamId: String(team._id), actorId: String(userId) });
  // The plaintext invite code is returned exactly once, at creation.
  return { team: team.toObject(), inviteCode };
}

export async function joinByCode(userId: Types.ObjectId, inviteCode: string) {
  const team = await withTransaction(async (session) => {
    // Invite codes are stored hashed; a lookup by hash keeps the code itself
    // out of the database. Expired codes are rejected, never silently honoured.
    const candidate = await Team.findOne({
      inviteCodeHash: sha256(inviteCode),
      inviteCodeExpiresAt: { $gt: new Date() },
    }).session(session);
    if (!candidate) throw gone('Invite code is invalid or expired');
    await assertUserHasNoTeam(session, userId);
    const claimed = await claimSeat(session, candidate._id, userId, candidate.maxSize);
    if (!claimed) throw conflict('Team is full');
    await setUserTeam(session, userId, candidate._id);
    await audit(session, { teamId: candidate._id, actorId: userId, action: 'team.joined_by_code', details: {} });
    return candidate;
  });
  broadcast({ type: 'team.member_joined', teamId: String(team._id), actorId: String(userId) });
  return team;
}

export async function requestJoin(userId: Types.ObjectId, teamId: Types.ObjectId) {
  const request = await withTransaction(async (session) => {
    const team = await Team.findById(teamId).session(session);
    if (!team) throw notFound('Team not found');
    await assertUserHasNoTeam(session, userId);
    if (team.memberCount >= team.maxSize) throw conflict('Team is full');
    if (team.members.some((m) => String(m.userId) === String(userId))) {
      throw conflict('You are already a member of this team');
    }
    try {
      const created = await JoinRequest.create([{ teamId, userId, status: 'pending' }], { session });
      await audit(session, { teamId, actorId: userId, action: 'join.requested', details: {} });
      return created[0];
    } catch (err) {
      // Unique partial index on (teamId, userId, pending) — a second pending
      // request for the same team is a conflict, not a second request.
      if ((err as { code?: number })?.code === 11000) throw conflict('You already have a pending request for this team');
      throw err;
    }
  });
  broadcast({ type: 'team.join_requested', teamId: String(teamId), actorId: String(userId) });
  return request;
}

export async function respondJoin(
  leaderId: Types.ObjectId,
  requestId: Types.ObjectId,
  decision: 'accepted' | 'declined',
) {
  const request = await withTransaction(async (session) => {
    const req = await JoinRequest.findById(requestId).session(session);
    if (!req) throw notFound('Join request not found');
    if (req.status !== 'pending') throw conflict(`Request was already ${req.status}`);
    const team = await Team.findById(req.teamId).session(session);
    if (!team) throw notFound('Team not found');
    // Only the leader can accept or decline — enforced server-side, always.
    if (String(team.leaderId) !== String(leaderId)) {
      throw forbidden('Only the team leader can accept or decline requests');
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
    if (!claimed) throw conflict('Team is full — the last seat was taken');
    req.status = 'accepted';
    await req.save({ session });
    await setUserTeam(session, req.userId, team._id);
    await audit(session, { teamId: team._id, actorId: leaderId, action: 'join.accepted', details: { userId: String(req.userId) } });
    return req;
  });
  broadcast({ type: `team.join_${decision}`, teamId: String(request.teamId), actorId: String(leaderId) });
  return request;
}

export async function removeMember(leaderId: Types.ObjectId, teamId: Types.ObjectId, memberId: Types.ObjectId) {
  const team = await withTransaction(async (session) => {
    const doc = await Team.findById(teamId).session(session);
    if (!doc) throw notFound('Team not found');
    if (String(doc.leaderId) !== String(leaderId)) throw forbidden('Only the team leader can remove members');
    if (String(memberId) === String(leaderId)) throw badRequest('The leader cannot remove themselves — leave the team instead');
    const updated = await Team.findOneAndUpdate(
      { _id: teamId, 'members.userId': memberId },
      { $pull: { members: { userId: memberId } }, $inc: { memberCount: -1 } },
      { session, new: true },
    );
    if (!updated) throw notFound('Member is not in this team');
    await setUserTeam(session, memberId, null);
    await audit(session, { teamId, actorId: leaderId, action: 'member.removed', details: { userId: String(memberId) } });
    return updated;
  });
  broadcast({ type: 'team.member_removed', teamId: String(teamId), actorId: String(leaderId) });
  return team;
}

export async function leaveTeam(userId: Types.ObjectId, teamId: Types.ObjectId) {
  const result = await withTransaction(async (session) => {
    const doc = await Team.findById(teamId).session(session);
    if (!doc) throw notFound('Team not found');
    if (!doc.members.some((m) => String(m.userId) === String(userId))) {
      throw conflict('You are not a member of this team');
    }
    const isLeader = String(doc.leaderId) === String(userId);
    const isLastMember = doc.memberCount <= 1;

    if (isLastMember) {
      // Last member leaving deletes the team — a rule, not a leftover.
      await Team.deleteOne({ _id: teamId }, { session });
      await setUserTeam(session, userId, null);
      await audit(session, { teamId, actorId: userId, action: 'team.deleted', details: { reason: 'last_member_left' } });
      return { deleted: true as const, team: null };
    }

    const updated = await Team.findOneAndUpdate(
      { _id: teamId, 'members.userId': userId },
      { $pull: { members: { userId } }, $inc: { memberCount: -1 } },
      { session, new: true },
    );
    if (!updated) throw conflict('Could not leave team');
    await setUserTeam(session, userId, null);

    if (isLeader) {
      // Leadership passes to the longest-standing member (join order).
      const nextLeader = [...updated.members].sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
      )[0];
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
    return { deleted: false as const, team: updated };
  });
  broadcast({ type: 'team.member_left', teamId: String(teamId), actorId: String(userId) });
  return result;
}

export async function regenerateInviteCode(leaderId: Types.ObjectId, teamId: Types.ObjectId) {
  const inviteCode = generateInviteCode();
  const team = await withTransaction(async (session) => {
    const doc = await Team.findById(teamId).session(session);
    if (!doc) throw notFound('Team not found');
    if (String(doc.leaderId) !== String(leaderId)) throw forbidden('Only the team leader can regenerate the invite code');
    doc.inviteCodeHash = sha256(inviteCode);
    doc.inviteCodeExpiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS);
    await doc.save({ session });
    await audit(session, { teamId, actorId: leaderId, action: 'invite_code.regenerated', details: {} });
    return doc;
  });
  return { team, inviteCode };
}
