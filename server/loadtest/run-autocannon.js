/**
 * Measured load test (autocannon) — board endpoint, 100 concurrent users.
 *
 * Run:  npm run loadtest   (from server/; expects a running seeded server
 *       on API_URL, default http://127.0.0.1:4000)
 *
 * Flow: login as the demo seed user -> hammer GET /api/board?limit=20 with
 * 100 concurrent connections for 30 s -> write loadtest/results.json and
 * print a summary. The numbers are the real measured values; if p95 misses
 * the 200 ms target the report says so (see LOAD-TEST-REPORT.md).
 */
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('autocannon');

const API_URL = process.env.API_URL || 'http://127.0.0.1:4000';
const DURATION = Number(process.env.LOADTEST_DURATION || 30);
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS || 100);

async function login() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@hack4hack.local', password: 'Seed1234!' }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} — is the server seeded? (npm run seed)`);
  const body = await res.json();
  return body.token;
}

async function main() {
  const token = await login();
  console.log(`[loadtest] ${CONNECTIONS} connections x ${DURATION}s -> ${API_URL}/api/board`);
  const result = await autocannon({
    url: `${API_URL}/api/board?limit=20`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { Authorization: `Bearer ${token}` },
  });
  const summary = {
    target: 'p95 < 200 ms on GET /api/board with 100 concurrent users',
    tool: 'autocannon',
    url: `${API_URL}/api/board?limit=20`,
    connections: CONNECTIONS,
    durationSeconds: DURATION,
    requests: result.requests,
    throughput: result.throughput,
    latency: result.latency,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result['non2xx'] ?? result.non2xx,
    statusCodeStats: result.statusCodeStats,
    measuredAt: new Date().toISOString(),
    pass: result.latency.p95 < 200,
  };
  const outDir = path.join(__dirname, '..', '..', 'loadtest');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[loadtest] fatal', err);
  process.exit(1);
});
