# Hack4Hack PS1 — Submission Package (prepared Sun Nov 15, 2026, ~07:50 PT)

**Deadline: Sun Nov 15, 2026, 10:29 AM PT / 11:29 PM PKT.**
**Status: PREPARED — nothing submitted, nothing registered. Final approval + submit are HIS.**

## Pillars

| # | Pillar | Status | Evidence / link |
|---|--------|--------|-----------------|
| 1 | Public GitHub repo | ✅ DONE | https://github.com/umarshareef0165-netizen/hack4hack-ps1 — public, branch `main`, 117 files, commit `2a391f5` (HEAD `2a391f544b79d2c44b3d6689321770fba0d2e738`). All code, tests, docs, load-test report present. |
| 2 | Live URL (working app) | ❌ BLOCKED | No live URL. Vercel API helper cannot deploy this Vite app (hardcodes framework `nextjs` → build error `NEXT_NO_VERSION`). Full-stack deploy needs MongoDB Atlas M0 + Render — accounts do not exist; signup is browser-only (his). See "What unblocks the live URL" below. |
| 3 | Demo video (≤5 min) | ❌ HIS-ONLY | Script ready: `VIDEO-SCRIPT.md` (~4:30, timed). Recording is his. Must show the LIVE URL, not localhost. |
| 4 | Registration + submission | ❌ HIS-ONLY | Register on https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m, pick PS1, submit repo + live URL + video + load-test report. Nothing registered or submitted yet. |

## Verified today (Nov 15, 2026)

- **Tests: 30/30 PASS** — re-run Nov 15, 07:20 PT (`npm test --workspace=server`, 31.7 s). Includes the 50-way race test (exactly 1 winner, 49 × 409).
- **Builds green** — server `tsc` ✓, client Vite build ✓ (Nov 15, 07:21 PT).
- **GitHub repo verified** — public (`private: false`), default branch `main`, tree lists README, DESIGN-DOC, VIDEO-SCRIPT, DEPLOY-README, `server/src/services/teamService.ts`, `client/src/App.tsx`, `loadtest/LOAD-TEST-REPORT.md`.
- **One file missing from the repo: `.github/workflows/ci.yml`.** GitHub rejects it (404) because the stored classic PAT has only the `repo` scope — writing workflow files needs the `workflow` scope. Also tried the Git Data API (blob created, tree rejected 404). Fix: user creates a new classic PAT with `repo` + `workflow` scopes on his own device, then the file can be pushed. CI will NOT run on push until then. The file exists locally at `.github/workflows/ci.yml`.

## Load test — honest numbers

- **Last measured (Nov 12, 2026, same commit `2a391f5`, same dev VM): k6 p95 369–400 ms, 0 failed requests** (10,446 + 11,251 reqs, 100 VUs × 30 s, board endpoint). **Target p95 < 200 ms MISSED on the dev VM.** Single board request ≈ 8 ms; the miss is CPU contention (API + MongoDB sharing 1.5 vCPUs), proven by the `/health` control (p95 63 ms at 100 VUs). Full analysis: `loadtest/LOAD-TEST-REPORT.md`.
- **No live re-run possible yet** — there is no live API URL. The deployed stack (Atlas M0 + Render = separate CPUs) is expected to be well under the dev-VM number, but that is an expectation, NOT a measurement. Re-run against the live URL before submitting and update the report.
- Do NOT claim p95 < 200 ms anywhere until a live run proves it.

## What unblocks the live URL (parent agent: browser tasks needed)

1. **MongoDB Atlas M0 (free)** — create account (his Gmail), cluster, DB user, network access `0.0.0.0/0`, copy connection string. Atlas M0 is a replica set — transactions require it.
2. **Seed the database** — `MONGO_URI='<atlas uri>' npm run seed --workspace=server` → expect `users: 10004, teams: 2001`.
3. **Render (free Web Service)** — API from this repo, root `server`, build `npm install && npm run build`, start `node dist/index.js`, env `MONGO_URI`, `JWT_SECRET` (generate), `CLIENT_URL` = Vercel URL. Verify `GET <api>/health` → `{"ok": true}`.
4. **Vercel (dashboard import, NOT the API helper)** — import repo, root `client`, framework Vite, env `VITE_API_URL` = Render API URL. Verify login with demo account, board loads, create team, join by code.
5. **Re-run load test against the live URL** — `API_URL=<live api> API_TOKEN=<jwt> k6 run loadtest/k6-board-test.js` (raise `RATE_LIMIT_MAX` for the run only) and update `loadtest/LOAD-TEST-REPORT.md`.

Full steps + env vars: `DEPLOY-README.md`.

## Remaining his-only steps (in order)

1. Atlas + Render accounts + Vercel dashboard import (or confirm the parent agent may do the browser steps with his Gmail).
2. New classic PAT with `workflow` scope (his device) so `.github/workflows/ci.yml` can be pushed — or accept CI not running.
3. Record the ≤5-min demo video from `VIDEO-SCRIPT.md` (must show the LIVE URL).
4. Register on hack4hack.com, pick PS1.
5. Final approval + submit before 10:29 AM PT.

## Links

- Repo: https://github.com/umarshareef0165-netizen/hack4hack-ps1
- Challenge: https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m
- Demo login (seeded): `demo@hack4hack.local` / `Seed1234!` (change if the deployment stays public)
