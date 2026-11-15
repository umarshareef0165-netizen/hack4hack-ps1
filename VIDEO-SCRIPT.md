# Walkthrough Video Script — Hack4Hack PS1 (≤ 5:00)

Record in one take, screen + voice. Total target ≈ 4:30. Speak plainly;
every claim below is something the repo actually does — do not ad-lib
features that are not built.

## 0:00–0:25 — The problem (25 s)
> "Hack4Hack PS1: race-proof team formation for 10,000 participants. The
> hard requirement is one sentence: 50 people click join on the last seat
> at the same instant, and exactly one gets it. Everything in this build
> exists to make that true by construction, not by luck."

Show: the live board (or localhost:5173) with open teams.

## 0:25–1:20 — The race, live (55 s)
1. Open the demo team "Demo Crew — one seat left" (4 of 5 seats filled).
2. Show the code that decides it — `server/src/services/teamService.ts`,
   `claimSeat`: one atomic `findOneAndUpdate`, filter
   `memberCount < maxSize`, `$inc` + `$push` in the same operation.
3. Run the race test: `npm test` — point at the test name
   "50 people race for the last seat: exactly one wins" and the green
   result (30/30 tests pass).
4. Say the result out loud: "Exactly one 200, forty-nine 409s, team ends
   at exactly five members, no duplicates."

## 1:20–2:20 — The rest of the flow (60 s)
- Create a team (show the invite code returned once), join with the code,
  send a join request and accept it as leader.
- Leader leaves → leadership passes to the longest-standing member
  (show the audit log entry `leader.left`).
- Last member leaves → team is deleted (show `team.deleted`).
- Open the audit log tab: every change with who/what/when.

## 2:20–3:10 — Idempotency + live updates (50 s)
- Double-click "Join" / replay the same request with the same
  `Idempotency-Key`: show the replayed response, no second membership.
- Open the board in two browser windows; create a team in one — the
  other updates with no refresh (SSE). Point at the "● Live updates
  connected" indicator.

## 3:10–4:00 — Suggestions + scale proof (50 s)
- Open Suggested teammates: show the score breakdown
  (0.6 skill complement + 0.4 timezone overlap) and the explanation line.
- Show the seed: `npm run seed` output — 10,000 users, 2,000 teams.
- Show the load-test report (`loadtest/LOAD-TEST-REPORT.md`): k6, 100
  concurrent users, 0 failed requests — and state the honest number:
  p95 368–400 ms on the dev VM, which misses the 200 ms target, why
  (API + MongoDB sharing 1.5 vCPUs), and that the deployed re-run is
  pending. Do not hide this.

## 4:00–4:30 — Design in one breath (30 s)
> "One API, one MongoDB replica set. The seat claim is a single atomic
> update inside a transaction that also writes the audit row. Idempotency
> keys make retries safe. SSE keeps the board live. Trade-offs and the
> load-test miss are written in DESIGN-DOC.md."

End on the repo README (setup, seed, test, load test) and the live URL.

## Recording checklist (before you press record)
- [ ] API running and seeded (demo login works; demo team shows 4/5)
- [ ] `npm test` already run once today (green) so the on-camera run is fast
- [ ] Two browser windows open for the SSE demo; second window logged in
- [ ] k6 report open in a tab; know the two p95 numbers (400 ms run 1,
      369 ms run 2) and the reason before you say them
- [ ] Keep it under 5:00 — if you run long, cut the suggestions section,
      never the race test
