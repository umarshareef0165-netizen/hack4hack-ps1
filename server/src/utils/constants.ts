// Shared constants for the Hack4Hack PS1 build.
// One hackathon context: every rule below is scoped to this id so the
// "one team per person per hackathon" rule is enforceable by the data model.
export const HACKATHON_ID = 'hack4hack-2026';
export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 5;
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const JWT_EXPIRES_IN = '7d';

/** Skills pool used by the seed script and the suggestion scorer. */
export const SKILL_POOL = [
  'react', 'node', 'typescript', 'mongodb', 'python', 'go', 'rust',
  'ui-design', 'devops', 'testing', 'ml', 'data', 'mobile', 'security',
  'graphql', 'docker', 'aws',
];

/** UTC offsets (hours) offered at registration; used for timezone overlap. */
export const TIMEZONE_OFFSETS = [-8, -5, 0, 1, 2, 5, 5.5, 8, 10];
