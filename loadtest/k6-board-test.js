/**
 * k6 load test — board endpoint, 100 concurrent users.
 *
 * Run (needs the k6 binary + a running, seeded server):
 *   export API_URL=http://127.0.0.1:4000
 *   export API_TOKEN=<JWT from POST /api/auth/login>
 *   k6 run loadtest/k6-board-test.js
 *
 * Target from the brief: p95 < 200 ms on the board endpoint with 100
 * concurrent users. The measured report for this submission was produced
 * with autocannon (same scenario) — see LOAD-TEST-REPORT.md — because the
 * k6 binary was not available on the build machine; this script is kept so
 * the same scenario can be re-run with k6 verbatim.
 */
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://127.0.0.1:4000';

export default function () {
  const res = http.get(`${API_URL}/api/board?limit=20`, {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'p95 under 200ms': (r) => r.timings.duration < 200,
  });
}
