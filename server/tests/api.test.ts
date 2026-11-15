/**
 * API tests for Hack4Hack PS1 — 27 tests, including the race test.
 *
 * Run: npm test (from server/)
 * The suite runs against an in-memory MongoDB replica set (transactions
 * need a replica set; a standalone mongod cannot run them).
 */
import http from 'node:http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { AuditLog, Team, User } from '../src/models';

const app = createApp();

let userCounter = 0;

async function registerUser(skills: string[] = ['react'], timezoneOffset = 0) {
  userCounter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .set('Idempotency-Key', `test-register-${userCounter}`)
    .send({ name: `User ${userCounter}`, email: `user${userCounter}@test.local`, password: 'Password123!', skills, timezoneOffset });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, user: res.body.user as { id: string } };
}

async function createTeam(token: string, maxSize = 5, name = 'Test Team') {
  const res = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', `test-team-${name}-${Date.now()}-${Math.random()}`)
    .send({ name, maxSize });
  expect(res.status).toBe(201);
  return { team: res.body.team, inviteCode: res.body.inviteCode as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// Auth (4 tests)
// ---------------------------------------------------------------------------
describe('auth', () => {
  it('registers a user and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Auth Test', email: 'auth-test@test.local', password: 'Password123!', skills: ['node'], timezoneOffset: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('auth-test@test.local');
  });

  it('rejects a duplicate email with 409', async () => {
    const body = { name: 'Dup', email: 'dup@test.local', password: 'Password123!' };
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(201);
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(409);
  });

  it('rejects login with a wrong password (401)', async () => {
    await request(app).post('/api/auth/register').send({ name: 'L', email: 'login@test.local', password: 'Password123!' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@test.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects protected routes without a token (401)', async () => {
    expect((await request(app).get('/api/board')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Teams: create / rules / board (6 tests)
// ---------------------------------------------------------------------------
describe('teams', () => {
  it('creates a team and returns the invite code exactly once', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/teams').set(auth(token)).send({ name: 'Alpha', maxSize: 4 });
    expect(res.status).toBe(201);
    expect(res.body.inviteCode).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(res.body.team.memberCount).toBe(1);
    expect(res.body.team.inviteCodeHash).toBeUndefined();
  });

  it('rejects a second team while already in one (409)', async () => {
    const { token } = await registerUser();
    await createTeam(token, 5, 'First');
    const res = await request(app).post('/api/teams').set(auth(token)).send({ name: 'Second', maxSize: 5 });
    expect(res.status).toBe(409);
  });

  it('validates maxSize (400 for maxSize 9)', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/teams').set(auth(token)).send({ name: 'TooBig', maxSize: 9 });
    expect(res.status).toBe(400);
  });

  it('lists open teams on the board', async () => {
    const { token } = await registerUser();
    await createTeam(token, 5, 'BoardTeam');
    const res = await request(app).get('/api/board').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBeGreaterThan(0);
    expect(res.body.teams[0].openSeats).toBeDefined();
  });

  it('returns the current team via /mine/current', async () => {
    const { token } = await registerUser();
    const { team } = await createTeam(token, 5, 'MineTeam');
    const res = await request(app).get('/api/teams/mine/current').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(team.id);
  });

  it('join request + leader accept adds the member', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'RequestTeam');
    const reqRes = await request(app).post(`/api/teams/${team.id}/requests`).set(auth(member.token)).send({});
    expect(reqRes.status).toBe(201);
    const accept = await request(app)
      .post(`/api/teams/requests/${reqRes.body.request.id}/respond`)
      .set(auth(leader.token))
      .send({ decision: 'accepted' });
    expect(accept.status).toBe(200);
    const after = await Team.findById(team.id).lean();
    expect(after!.memberCount).toBe(2);
  });

  it('leader decline keeps the requester out', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'DeclineTeam');
    const reqRes = await request(app).post(`/api/teams/${team.id}/requests`).set(auth(member.token)).send({});
    const decline = await request(app)
      .post(`/api/teams/requests/${reqRes.body.request.id}/respond`)
      .set(auth(leader.token))
      .send({ decision: 'declined' });
    expect(decline.status).toBe(200);
    expect(decline.body.request.status).toBe('declined');
    const after = await Team.findById(team.id).lean();
    expect(after!.memberCount).toBe(1);
  });

  it('non-leader cannot accept a join request (403)', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const other = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'ForbiddenTeam');
    const reqRes = await request(app).post(`/api/teams/${team.id}/requests`).set(auth(member.token)).send({});
    const res = await request(app)
      .post(`/api/teams/requests/${reqRes.body.request.id}/respond`)
      .set(auth(other.token))
      .send({ decision: 'accepted' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Race test — the core proof (2 tests)
// ---------------------------------------------------------------------------
describe('race-proof seat claim', () => {
  it('50 people race for the last seat: exactly one wins', async () => {
    const leader = await registerUser();
    const { team, inviteCode } = await createTeam(leader.token, 5, 'RaceTeam');
    // Fill 3 more seats so exactly ONE seat remains (4/5).
    for (let i = 0; i < 3; i++) {
      const filler = await registerUser();
      const r = await request(app).post('/api/teams/join-by-code').set(auth(filler.token)).send({ inviteCode });
      expect(r.status).toBe(200);
    }
    const before = await Team.findById(team.id).lean();
    expect(before!.memberCount).toBe(4);

    // 50 fresh users hit join-by-code at the same instant.
    const racers = await Promise.all(Array.from({ length: 50 }, () => registerUser()));
    const results = await Promise.all(
      racers.map((r) =>
        request(app).post('/api/teams/join-by-code').set(auth(r.token)).send({ inviteCode }),
      ),
    );
    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(49);

    const after = await Team.findById(team.id).lean();
    expect(after!.memberCount).toBe(5);
    const memberIds = after!.members.map((m) => String(m.userId));
    expect(new Set(memberIds).size).toBe(5); // no duplicate members
  });

  it('a second join attempt by the same user is a 409, not a second seat', async () => {
    const leader = await registerUser();
    const { inviteCode } = await createTeam(leader.token, 5, 'DoubleJoinTeam');
    const member = await registerUser();
    expect((await request(app).post('/api/teams/join-by-code').set(auth(member.token)).send({ inviteCode })).status).toBe(200);
    const again = await request(app).post('/api/teams/join-by-code').set(auth(member.token)).send({ inviteCode });
    expect(again.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Idempotency (3 tests)
// ---------------------------------------------------------------------------
describe('idempotency', () => {
  it('replaying create-team with the same key returns the same team, no duplicate', async () => {
    const { token, user } = await registerUser();
    const key = `idem-create-${user.id}`;
    const first = await request(app).post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'IdemTeam', maxSize: 5 });
    expect(first.status).toBe(201);
    const replay = await request(app).post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'IdemTeam', maxSize: 5 });
    expect(replay.status).toBe(201);
    expect(replay.body.team.id).toBe(first.body.team.id);
    expect(await Team.countDocuments({ 'members.userId': new mongoose.Types.ObjectId(user.id) })).toBe(1);
  });

  it('replaying join-by-code with the same key does not double-join', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team, inviteCode } = await createTeam(leader.token, 5, 'IdemJoinTeam');
    const key = `idem-join-${member.user.id}`;
    const first = await request(app).post('/api/teams/join-by-code').set(auth(member.token)).set('Idempotency-Key', key).send({ inviteCode });
    expect(first.status).toBe(200);
    const replay = await request(app).post('/api/teams/join-by-code').set(auth(member.token)).set('Idempotency-Key', key).send({ inviteCode });
    expect(replay.status).toBe(200);
    const after = await Team.findById(team.id).lean();
    expect(after!.memberCount).toBe(2);
  });

  it('same key with a different body is a 422', async () => {
    const { token, user } = await registerUser();
    const key = `idem-mismatch-${user.id}`;
    await request(app).post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'A', maxSize: 5 });
    const res = await request(app).post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'B', maxSize: 5 });
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Invite codes + rate limit (3 tests)
// ---------------------------------------------------------------------------
describe('invite codes', () => {
  it('rejects a wrong invite code with 410', async () => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/teams/join-by-code').set(auth(token)).send({ inviteCode: 'not-a-real-code' });
    expect(res.status).toBe(410);
  });

  it('rejects an expired invite code with 410', async () => {
    const leader = await registerUser();
    const { team, inviteCode } = await createTeam(leader.token, 5, 'ExpiredTeam');
    await Team.updateOne({ _id: team.id }, { $set: { inviteCodeExpiresAt: new Date(Date.now() - 1000) } });
    const member = await registerUser();
    const res = await request(app).post('/api/teams/join-by-code').set(auth(member.token)).send({ inviteCode });
    expect(res.status).toBe(410);
  });

  it('rate-limits invite-code guessing (429 after the limit)', async () => {
    process.env.INVITE_RATE_LIMIT = '3';
    const limitedApp = createApp();
    const { token } = await registerUser();
    // Use the fresh app instance (its limiter reads the new env value).
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(limitedApp).post('/api/teams/join-by-code').set(auth(token)).send({ inviteCode: 'guess' });
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
    process.env.INVITE_RATE_LIMIT = '100000';
  });
});

// ---------------------------------------------------------------------------
// Leave / leadership / deletion (3 tests)
// ---------------------------------------------------------------------------
describe('leave and leadership', () => {
  it('leader leaving passes leadership to the longest-standing member', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'PassTeam');
    const reqRes = await request(app).post(`/api/teams/${team.id}/requests`).set(auth(member.token)).send({});
    await request(app).post(`/api/teams/requests/${reqRes.body.request.id}/respond`).set(auth(leader.token)).send({ decision: 'accepted' });
    const leave = await request(app).post(`/api/teams/${team.id}/leave`).set(auth(leader.token)).send({});
    expect(leave.status).toBe(200);
    expect(leave.body.team.leaderId).toBe(member.user.id);
  });

  it('last member leaving deletes the team', async () => {
    const { token } = await registerUser();
    const { team } = await createTeam(token, 5, 'SoloTeam');
    const leave = await request(app).post(`/api/teams/${team.id}/leave`).set(auth(token)).send({});
    expect(leave.status).toBe(200);
    expect(leave.body.deleted).toBe(true);
    expect(await Team.findById(team.id)).toBeNull();
  });

  it('leader can remove a member; non-leader cannot', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'RemoveTeam');
    const reqRes = await request(app).post(`/api/teams/${team.id}/requests`).set(auth(member.token)).send({});
    await request(app).post(`/api/teams/requests/${reqRes.body.request.id}/respond`).set(auth(leader.token)).send({ decision: 'accepted' });
    const removed = await request(app).post(`/api/teams/${team.id}/members/${member.user.id}/remove`).set(auth(leader.token)).send({});
    expect(removed.status).toBe(200);
    expect(removed.body.team.memberCount).toBe(1);
    const userAfter = await User.findById(member.user.id).lean();
    expect(userAfter!.teamId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audit log (2 tests)
// ---------------------------------------------------------------------------
describe('audit log', () => {
  it('records team creation and joins', async () => {
    const leader = await registerUser();
    const member = await registerUser();
    const { team, inviteCode } = await createTeam(leader.token, 5, 'AuditTeam');
    await request(app).post('/api/teams/join-by-code').set(auth(member.token)).send({ inviteCode });
    const res = await request(app).get(`/api/teams/${team.id}/audit`).set(auth(leader.token));
    expect(res.status).toBe(200);
    const actions = res.body.audit.map((e: { action: string }) => e.action);
    expect(actions).toContain('team.created');
    expect(actions).toContain('team.joined_by_code');
  });

  it('records a member leaving', async () => {
    const { token } = await registerUser();
    const { team } = await createTeam(token, 5, 'AuditLeaveTeam');
    await request(app).post(`/api/teams/${team.id}/leave`).set(auth(token)).send({});
    const entries = await AuditLog.find({ teamId: team.id }).lean();
    expect(entries.some((e) => e.action === 'team.deleted')).toBe(true);
  });

  it('non-members cannot read the audit log (403)', async () => {
    const leader = await registerUser();
    const outsider = await registerUser();
    const { team } = await createTeam(leader.token, 5, 'AuditPrivateTeam');
    const res = await request(app).get(`/api/teams/${team.id}/audit`).set(auth(outsider.token));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Suggestions (2 tests)
// ---------------------------------------------------------------------------
describe('suggestions', () => {
  it('ranks team-less users with an explained score', async () => {
    const me = await registerUser(['react', 'node'], 0);
    // Candidate with complementary skills + same timezone should outrank one
    // with identical skills in a far timezone.
    await registerUser(['ml', 'data'], 0);
    await registerUser(['react', 'node'], 10);
    const res = await request(app).get('/api/suggestions?limit=10').set(auth(me.token));
    expect(res.status).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    const top = res.body.suggestions[0];
    expect(top.score).toBeGreaterThan(0);
    expect(top.explanation).toBeTruthy();
    expect(res.body.scoring).toMatch(/0\.6/);
  });

  it('excludes users who are already in a team', async () => {
    const me = await registerUser(['react'], 0);
    const busy = await registerUser(['go'], 0);
    await createTeam(busy.token, 5, 'BusyTeam');
    const res = await request(app).get('/api/suggestions?limit=50').set(auth(me.token));
    const ids = res.body.suggestions.map((s: { userId: string }) => s.userId);
    expect(ids).not.toContain(busy.user.id);
  });
});

// ---------------------------------------------------------------------------
// SSE live updates (1 test)
// ---------------------------------------------------------------------------
describe('live updates (SSE)', () => {
  it('pushes a team.created event to a connected client', async () => {
    const { token } = await registerUser();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const eventPromise = new Promise<string>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/events?token=${token}`, (res) => {
          let buf = '';
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString();
            const match = buf.match(/data: (\{.*\})/);
            if (match) resolve(match[1]);
          });
        });
        req.on('error', reject);
        setTimeout(() => reject(new Error('no SSE event within 10s')), 10_000);
      });
      // Give the stream a moment to connect, then create a team.
      await new Promise((r) => setTimeout(r, 300));
      await createTeam(token, 5, 'SseTeam');
      const payload = JSON.parse(await eventPromise);
      expect(payload.type).toBe('team.created');
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Health (1 test)
// ---------------------------------------------------------------------------
describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
