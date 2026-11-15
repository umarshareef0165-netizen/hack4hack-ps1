# Hack4Hack PS1 — Race-proof Team Formation at Scale

**Challenge:** [Hack4Hack Crew Hiring Challenge 2026](https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m),
Problem Statement 1. Build a production-grade team-formation service for a
hackathon with 10,000 participants. **Correctness under concurrency first.**

**Stack:** React (Vite) + Node.js / Express / TypeScript + MongoDB (Mongoose).
**Author:** Umar Shareef — final-year UAF BSCS; React, Node.js, MongoDB,
TypeScript. Built to be explained line-by-line in the interview.

## What it does

- Teams with invite codes (96-bit, hashed, 7-day expiry), join requests the
  leader accepts/declines, live "looking for teammates" board.
- **Race-proof seat claim:** one atomic `findOneAndUpdate` per join
  (`memberCount < maxSize` guard + `$inc`/`$push` in the same operation),
  inside a transaction that also sets the user's team and writes the audit
  row. 50 people racing for the last seat → exactly one wins.
- **Idempotent mutations** (`Idempotency-Key` header): replays return the
  stored response; same key + different body is a 422.
- **Real-time:** Server-Sent Events — the board and team pages update live,
  no refresh.
- **Audit log:** every team change (who / what / when), written in the same
  transaction as the change.
- **Teammate suggestions** with an explained score:
  `0.6 · skillComplement + 0.4 · timezoneOverlap`.
- **Rules enforced server-side:** team size 2–5, one team per person per
  hackathon, leadership passes to the longest-standing member when the
  leader leaves, last member leaving deletes the team.

## Quick start

```bash
# 1. Install (root uses npm workspaces)
npm install

# 2. Run the API (uses an in-memory MongoDB replica set if MONGO_URI is unset)
npm run dev --workspace=server        # http://localhost:4000

# 3. Run the UI (in another terminal)
npm run dev --workspace=client        # http://localhost:5173

# 4. Seed 10,000 users + 2,000 teams (needs a real MongoDB — see below)
MONGO_URI='mongodb://127.0.0.1:27017/hack4hack-ps1?replicaSet=rs0' npm run seed --workspace=server
```

> Transactions need a **replica set**. `MONGO_URI` unset → in-memory
> replica set (dev only, data is discarded on exit). For a persistent local
> DB use `docker compose up` (single-node replica set included).

## Tests — 30 API tests, all green

```bash
npm test --workspace=server
# Test Files  1 passed (1) · Tests  30 passed (30)
```

Includes the **race test** (50 concurrent claims for the last seat → exactly
one succeeds), idempotency tests, audit-log tests, invite-code expiry +
rate-limit tests, leadership-passing and team-deletion tests, and an SSE
live-update test. CI runs them on every push (`.github/workflows/ci.yml`).

## Load test (honest numbers)

```bash
# Against a running, seeded server:
npm run loadtest --workspace=server   # autocannon, 100 conn × 30 s
# or: API_URL=… API_TOKEN=… k6 run loadtest/k6-board-test.js
```

Measured on the dev VM (API + MongoDB sharing 1.5 vCPUs): **k6 p95 369–400 ms,
0 failed requests** — the 200 ms target was **missed on that box**; the
endpoint itself is ~8 ms and the miss is CPU contention (evidence and the
control experiment are in [`loadtest/LOAD-TEST-REPORT.md`](loadtest/LOAD-TEST-REPORT.md)).
Re-run against the deployed URL before submitting.

## Docs

- [`DESIGN-DOC.md`](DESIGN-DOC.md) — 1-page design doc (data model, race
  prevention, trade-offs, one-more-week list)
- [`VIDEO-SCRIPT.md`](VIDEO-SCRIPT.md) — ≤5-min walkthrough script
- [`DEPLOY-README.md`](DEPLOY-README.md) — exact deploy steps (Atlas + Render
  + Vercel, free tiers)
- [`loadtest/LOAD-TEST-REPORT.md`](loadtest/LOAD-TEST-REPORT.md) — measured
  load-test report

## Project layout

```
server/            Express + TypeScript API
  src/
    services/teamService.ts   ← the race-proof core (claimSeat, transactions)
    services/suggestions.ts   ← explained teammate scoring
    services/events.ts        ← SSE hub
    routes/                   ← auth, teams, board, suggestions, events
    models/                   ← User, Team, JoinRequest, AuditLog, IdempotencyKey
    middleware/               ← JWT auth, idempotency, zod validation, errors
  scripts/seed.ts             ← 10,000 users / 2,000 teams (deterministic)
  tests/api.test.ts           ← 30 tests incl. the 50-way race test
  loadtest/run-autocannon.js  ← measured load test
client/            React + Vite UI (board, team, create, suggestions, SSE)
loadtest/          k6 script + measured reports
.github/workflows/ci.yml
docker-compose.yml
```
