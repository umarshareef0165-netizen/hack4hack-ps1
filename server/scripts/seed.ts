/**
 * Seed script — 10,000 users + 2,000 teams (the brief's exact numbers).
 *
 * Usage:
 *   MONGO_URI=mongodb://127.0.0.1:27017/hack4hack-ps1 npm run seed
 *   (without MONGO_URI it seeds the in-memory replica set, which is discarded
 *   on exit — only useful as a smoke test.)
 *
 * Deterministic: the same seed always produces the same dataset (mulberry32).
 * All seed users share one bcrypt hash of the password `Seed1234!` — hashing
 * 10,000 passwords individually would take ~15 minutes; one hash is the
 * honest, documented shortcut (seed data only, never for real accounts).
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db';
import { Team, User } from '../src/models';
import { HACKATHON_ID, INVITE_CODE_TTL_MS, SKILL_POOL, TIMEZONE_OFFSETS } from '../src/utils/constants';
import { generateInviteCode, mulberry32, sha256 } from '../src/utils/crypto';

const TOTAL_USERS = 10_000;
const TOTAL_TEAMS = 2_000;

const FIRST = ['Ayesha','Bilal','Chen','Diego','Emma','Farah','George','Hana','Ivan','Julia','Kiran','Liam','Maya','Noah','Omar','Priya','Quinn','Ravi','Sara','Tariq','Uma','Vikram','Wendy','Yusuf','Zara','Ahmed','Nina','Oleg','Tara','Felix'];
const LAST = ['Khan','Sharma','Li','Garcia','Smith','Ahmed','Patel','Kim','Ali','Hassan','Raza','Iqbal','Chen','Wang','Singh','Kaur','Malik','Rahman','Siddiqui','Qureshi'];

async function main(): Promise<void> {
  await connectDb();
  const rand = mulberry32(20261112);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  console.log('[seed] clearing existing data…');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
  ]);
  // Also clear dependent collections via raw collection handles (same DB).
  await mongoose.connection.collection('joinrequests').deleteMany({});
  await mongoose.connection.collection('auditlogs').deleteMany({});
  await mongoose.connection.collection('idempotencykeys').deleteMany({});

  const passwordHash = await bcrypt.hash('Seed1234!', 10);

  console.log(`[seed] creating ${TOTAL_USERS} users…`);
  const users: Record<string, unknown>[] = [];
  const usedEmails = new Set<string>();
  for (let i = 0; i < TOTAL_USERS; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    let email = `user${i}@seed.hack4hack.local`;
    if (usedEmails.has(email)) email = `user${i}-${Math.floor(rand() * 1e6)}@seed.hack4hack.local`;
    usedEmails.add(email);
    const skills = [...new Set([pick(SKILL_POOL), pick(SKILL_POOL), pick(SKILL_POOL)])];
    users.push({
      name,
      email,
      passwordHash,
      skills,
      timezoneOffset: pick(TIMEZONE_OFFSETS),
      lookingForTeam: rand() < 0.7,
      teamId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const inserted = await User.insertMany(users, { ordered: false });
  const userIds = inserted.map((u) => u._id);
  console.log(`[seed] users inserted: ${inserted.length}`);

  console.log(`[seed] creating ${TOTAL_TEAMS} teams…`);
  const teams: Record<string, unknown>[] = [];
  const memberUserIds: mongoose.Types.ObjectId[] = [];
  for (let t = 0; t < TOTAL_TEAMS; t++) {
    // Each team takes 1 leader + 0–3 extra members from the pool, so about
    // 4,000 of the 10,000 users end up in teams and 6,000 stay team-less
    // (which is also what makes the board and suggestions meaningful).
    const size = 1 + Math.floor(rand() * 4); // 1–4 members
    const members: { userId: mongoose.Types.ObjectId; joinedAt: Date }[] = [];
    for (let m = 0; m < size; m++) {
      const idx = t * 4 + m; // disjoint slices: no user joins two teams
      if (idx >= userIds.length) break;
      const uid = userIds[idx] as mongoose.Types.ObjectId;
      members.push({ userId: uid, joinedAt: new Date(Date.now() - Math.floor(rand() * 7 * 86400_000)) });
      memberUserIds.push(uid);
    }
    if (members.length === 0) continue;
    const maxSize = members.length >= 4 ? 5 : 3 + Math.floor(rand() * 3); // 3–5
    teams.push({
      hackathonId: HACKATHON_ID,
      name: `Team ${t + 1} — ${pick(FIRST)}'s crew`,
      description: `Seed team ${t + 1} for the Hack4Hack PS1 load/seed demo.`,
      leaderId: members[0].userId,
      members,
      memberCount: members.length,
      maxSize,
      lookingForTeammates: members.length < maxSize && rand() < 0.8,
      inviteCodeHash: sha256(generateInviteCode()),
      inviteCodeExpiresAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const insertedTeams = await Team.insertMany(teams, { ordered: false });
  console.log(`[seed] teams inserted: ${insertedTeams.length}`);

  // Point each member's teamId at their team (bulk, one round trip).
  const bulk = User.collection.initializeUnorderedBulkOp();
  insertedTeams.forEach((team) => {
    const members = (team as unknown as { members: { userId: mongoose.Types.ObjectId }[] }).members;
    members.forEach((m) => {
      bulk.find({ _id: m.userId }).updateOne({ $set: { teamId: team._id, lookingForTeam: false } });
    });
  });
  await bulk.execute();
  console.log(`[seed] team memberships linked: ${memberUserIds.length}`);

  // Demo account + a team with exactly ONE open seat (4/5) — used by the
  // walkthrough video to show the race live, and by the race test's demo.
  const demo = await User.create({
    name: 'Demo User',
    email: 'demo@hack4hack.local',
    passwordHash,
    skills: ['react', 'node', 'typescript'],
    timezoneOffset: -8,
    lookingForTeam: true,
    teamId: null,
  });
  const demoMembers = await User.create([
    { name: 'Demo Member One', email: 'demo1@hack4hack.local', passwordHash, skills: ['mongodb'], timezoneOffset: -8, lookingForTeam: false, teamId: null },
    { name: 'Demo Member Two', email: 'demo2@hack4hack.local', passwordHash, skills: ['testing'], timezoneOffset: 5, lookingForTeam: false, teamId: null },
    { name: 'Demo Member Three', email: 'demo3@hack4hack.local', passwordHash, skills: ['ui-design'], timezoneOffset: 0, lookingForTeam: false, teamId: null },
  ]);
  const demoCode = generateInviteCode();
  const demoTeam = await Team.create({
    hackathonId: HACKATHON_ID,
    name: 'Demo Crew — one seat left',
    description: 'Demo team for the walkthrough video: 4 of 5 seats filled.',
    leaderId: demo._id,
    members: [
      { userId: demo._id, joinedAt: new Date(Date.now() - 3000) },
      ...demoMembers.map((m, i) => ({ userId: m._id, joinedAt: new Date(Date.now() - 2000 + i * 500) })),
    ],
    memberCount: 4,
    maxSize: 5,
    lookingForTeammates: true,
    inviteCodeHash: sha256(demoCode),
    inviteCodeExpiresAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
  });
  await User.updateMany(
    { _id: { $in: [demo._id, ...demoMembers.map((m) => m._id)] } },
    { $set: { teamId: demoTeam._id, lookingForTeam: false } },
  );

  const counts = { users: await User.countDocuments(), teams: await Team.countDocuments() };
  console.log('[seed] DONE:', counts);
  console.log('[seed] demo login: demo@hack4hack.local / Seed1234!');
  console.log('[seed] demo team id:', String(demoTeam._id), '| invite code:', demoCode);
  await disconnectDb();
}

main().catch((err) => {
  console.error('[seed] fatal', err);
  process.exit(1);
});
