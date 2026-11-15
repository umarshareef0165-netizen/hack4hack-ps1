# Deploy README — Hack4Hack PS1

**Status: NOT deployed yet.** Everything below is prepared so deployment is
one step once a hosting account is available. No accounts were created and
no credentials were entered anywhere in this repo.

## What you need (his-only, ~20 min)

1. A **MongoDB Atlas** account (free M0 tier) — create a cluster, a database
   user, and allow network access from `0.0.0.0/0` (or Render's IPs).
   Copy the connection string.
2. A **Render** account (free tier) — for the API.
3. A **Vercel** account (free tier) — for the React UI (or serve the UI
   from Render as a static site; either is fine).

## 1. Database (Atlas M0, free)

- Create cluster → database user `hack4hack` (strong password, stored in
  Atlas, never pasted in chat) → Network Access → Add IP `0.0.0.0/0`.
- Connection string looks like:
  `mongodb+srv://hack4hack:<password>@<cluster>.mongodb.net/hack4hack-ps1?retryWrites=true&w=majority`
- Atlas M0 **is a replica set**, which is what the transaction-based seat
  claim requires. (A standalone `mongod` cannot run transactions — the API
  will fail on joins. This is the single most common deploy mistake.)

## 2. Seed the database (once, from your laptop)

```bash
cd server
npm install
MONGO_URI='mongodb+srv://...' npm run seed
# Expect: users: 10004, teams: 2001 (10,000 + 2,000 + demo entries)
```

## 3. API on Render (free Web Service)

- New → Web Service → connect this repo → Root Directory `server`.
- Build command: `npm install && npm run build`
- Start command: `node dist/index.js`
- Environment variables:
  - `MONGO_URI` = the Atlas connection string above
  - `JWT_SECRET` = a long random string (generate: `openssl rand -base64 32`)
  - `CLIENT_URL` = your Vercel URL (e.g. `https://hack4hack-ps1.vercel.app`)
  - `PORT` = Render sets this automatically; the server reads `process.env.PORT`
- Deploy → open `https://<your-service>.onrender.com/health` → expect
  `{"ok": true}`. Note: Render free tier sleeps after inactivity; the first
  request can take ~30–60 s (cold start). That is fine for the submission,
  but re-run the load test against the **warm** URL.

## 4. UI on Vercel (free)

- Import this repo → Root Directory `client` → Framework: Vite.
- Environment variable: `VITE_API_URL` = your Render API URL
  (e.g. `https://hack4hack-ps1-api.onrender.com`).
- Deploy → open the URL → register / log in with the demo account
  (`demo@hack4hack.local` / `Seed1234!` — change the demo password after
  the video if the deployment stays public).

## 5. Verify before submitting (checklist)

- [ ] `GET <api>/health` → 200 `{"ok": true}`
- [ ] Log in on the live UI; board loads; create a team; join by code
- [ ] Re-run the load test against the live URL and update
      `loadtest/LOAD-TEST-REPORT.md` with the deployed p95:
      `API_URL=<live api> API_TOKEN=<jwt> k6 run loadtest/k6-board-test.js`
- [ ] Confirm the demo video shows the **live** URL, not localhost

## Local one-command alternative (Docker Compose)

```bash
docker compose up --build
# API on http://localhost:4000, UI on http://localhost:5173
# MongoDB runs as a single-node replica set (rs0) so transactions work.
```

## Environment variables (reference)

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | yes (prod) | Atlas `mongodb+srv://…`; omit locally to use in-memory MongoDB |
| `JWT_SECRET` | yes (prod) | Long random string; dev fallback exists but must not be used in prod |
| `CLIENT_URL` | no | CORS origin; default `http://localhost:5173` |
| `PORT` | no | Default 4000 |
| `RATE_LIMIT_MAX` | no | Default 300 / 15 min; raise only for load tests |
| `AUTH_RATE_LIMIT` | no | Default 50 / 15 min |
| `INVITE_RATE_LIMIT` | no | Default 10 / min (invite-code guessing) |
