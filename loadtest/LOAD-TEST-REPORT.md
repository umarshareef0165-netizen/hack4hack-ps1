# Load-Test Report — Hack4Hack PS1 (measured, not estimated)

**Endpoint:** `GET /api/board?limit=20` (the "looking for teammates" board)
**Target (brief):** p95 < 200 ms with 100 concurrent users
**Tool:** k6 v0.55.0 (primary) + autocannon 7.15 (cross-check)
**Date:** Thu Nov 12, 2026. All numbers below are the real measured values.

## Results

| Run | Tool | Requests | Failed | p50 | p90 | p95 | p99 | Throughput |
|---|---|---|---|---|---|---|---|---|
| 1 — 100 VUs, 30 s | k6 | 10,446 | **0 (0.00%)** | 276 ms | 372 ms | **400 ms** | — | 342 req/s |
| 2 — 100 VUs, 30 s | k6 | 11,251 | **0 (0.00%)** | 251 ms | 337 ms | **369 ms** | — | ~375 req/s |
| 3 — 100 conn, 30 s | autocannon | 9,453 | **0, all 200** | 291 ms | 424 ms | — | 799 ms | 315 req/s |

**Verdict: p95 target MISSED on this machine — 369–400 ms vs the 200 ms
target. Zero failed requests in every run.**

Raw artefacts: `loadtest/k6-results.json`, `loadtest/k6-results-run2.json`,
`loadtest/results.json` (autocannon). Reproduce with:
`API_URL=<url> API_TOKEN=<jwt> k6 run loadtest/k6-board-test.js`
(login first: `POST /api/auth/login` as `demo@hack4hack.local`).

## Why it missed — evidence, not excuses

1. **The endpoint itself is fast.** A single board request measures
   ~8 ms after warm-up; the raw MongoDB find + count take ~4 ms each,
   sequential, against the seeded 10,000-user / 2,000-team dataset; the
   board query uses its index (`hackathonId, lookingForTeammates,
   createdAt`: 20 keys examined, 20 docs returned).
2. **The box is the bottleneck.** The test ran on a shared 1.5-vCPU VM
   with the API and MongoDB co-located, ~500 MB RAM available, and other
   work running concurrently (a `pip install` at 25–85% CPU during run 1).
   Load average was 1.3–1.8 on 1.5 CPUs.
3. **Control experiment proves it.** The same box, same 100 VUs, against
   `GET /health` (no database): 93,143 requests in 15 s, **p95 63 ms**,
   6,207 req/s. The HTTP layer is fine at 100 concurrent users; the
   database path saturates the shared CPUs.
4. **Raw-driver check agrees.** 100 parallel board queries through the
   driver alone: p50 327 ms, p95 443 ms — the same shape as the k6
   numbers, so this is not Express overhead.

## What this means for the submission

- The deployed stack separates the two (Atlas M0 + Render free tier =
  separate CPUs), so the deployed p95 is expected to be well under the
  dev-VM number. **The load test MUST be re-run against the live URL
  before submission and this report updated with that number** — the
  deployed number is the one judges will care about.
- A first, invalid autocannon run is also on record: with the production
  rate limiter at its default (300 req / 15 min), 99.9% of requests
  returned 429. That run measures the limiter, not the endpoint, and is
  excluded from the table above. Load-test runs raise the limiter via
  `RATE_LIMIT_MAX` (documented in the run command); production keeps the
  default.
