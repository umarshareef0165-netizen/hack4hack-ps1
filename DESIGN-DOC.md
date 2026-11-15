# Hack4Hack PS1 — Design Doc (1 page)

**Problem.** A hackathon with 10,000 participants needs team formation that stays
correct when hundreds of people click "join" at the same second: exactly one
person gets the last seat, a retried request never double-applies, every change
is audited, and the board updates live.

## Architecture

```
React (Vite) ──HTTPS──▶ Express + TypeScript API ──▶ MongoDB (Atlas M0, replica set)
                              │  SSE (/api/events)         Users / Teams / JoinRequests
                              └──────── AuditLog + IdempotencyKey (same DB)
```

One API instance, one database. No queue, no cache, no second service — the
brief's hard part is correctness, not infrastructure, and every extra moving
part is a new way to lose a seat claim.

## Data model

- **User**: name, email (unique), password hash, skills, UTC offset,
  `lookingForTeam`, `teamId` (null = in no team). One team per person is
  enforced by `teamId` + a transaction check, not by hope.
- **Team**: `members: [{userId, joinedAt}]` in join order, `memberCount`
  (mirrors `members.length`), `maxSize` (2–5), `leaderId`, invite-code
  **hash** (sha256) + expiry, `lookingForTeammates`.
- **JoinRequest**: team + user + `pending/accepted/declined`; unique partial
  index allows only one pending request per (team, user).
- **AuditLog**: every team change — who, what, when — written **in the same
  transaction** as the change, so a change can never exist without its record.
- **IdempotencyKey**: key + request fingerprint + stored response, TTL 24 h.

## How races are prevented (the core)

The seat claim is a **single atomic `findOneAndUpdate`**, not check-then-write:

```js
filter: { _id, memberCount: { $lt: maxSize }, 'members.userId': { $ne: userId } }
update: { $inc: { memberCount: 1 }, $push: { members: { userId, joinedAt } } }
```

MongoDB evaluates the filter against the document state at the moment the
update applies. When 50 requests race for 1 seat, the first update raises
`memberCount` to `maxSize`; the other 49 match zero documents and get a 409.
The claim runs inside a transaction that also sets `user.teamId` and writes
the audit row, with bounded retry (×3) on write conflicts. Proven by
`tests/api.test.ts`: 50 concurrent claims → exactly 1 success, 49 × 409,
team ends at exactly 5 members, no duplicates.

## Idempotency, real-time, security

- **Idempotency**: clients send `Idempotency-Key` on mutations. Same key +
  same body replays the stored response; same key + different body is a 422;
  a unique index means racing duplicates still store once.
- **Real-time**: Server-Sent Events (`GET /api/events?token=…`); every
  mutation broadcasts `team.created / member_joined / member_left /
  join_accepted …`. Single-instance in-process hub (see trade-offs).
- **Security**: JWT auth; only the leader accepts/declines/removes; invite
  codes are 96-bit random, stored hashed, expire in 7 days, and the
  join-by-code route is rate-limited (10/min/IP); all inputs validated
  with zod; global limiter 300 req/15 min.

## Suggestions

`score = 0.6 · skillComplement + 0.4 · timezoneOverlap`, where
skillComplement is the share of the candidate's skills you lack and
timezoneOverlap is shared 09:00–17:00 working hours ÷ 8. Both components
and a plain-English explanation are returned per candidate.

## Trade-offs & what I'd do with one more week

- **SSE hub is in-process**: correct on one instance; multi-instance deploys
  need Redis pub/sub (same event names/payloads). Chosen deliberately for
  the free tier.
- **Load test missed p95 < 200 ms on the dev VM** (k6: p95 368–400 ms, 0
  failures; single-request latency ≈ 8 ms; see `loadtest/LOAD-TEST-REPORT.md`).
  Cause is CPU contention from API + MongoDB sharing 1.5 vCPUs, not the
  query (indexed, ~4 ms sequential). Re-run against the deployed URL.
- **No optimistic UI rollback yet** (bonus): the UI shows the server's
  answer after each mutation; conflict responses surface as messages.
- **No chaos test yet** (bonus): kill-server-mid-join is untested; the
  transaction + atomic claim make partial joins impossible by construction,
  but it is not yet demonstrated.
- **Auth check per request** costs one DB round-trip; trusting the JWT alone
  would be faster but would let deleted accounts act until expiry.
