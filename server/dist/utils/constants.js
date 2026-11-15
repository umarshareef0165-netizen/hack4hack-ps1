"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMEZONE_OFFSETS = exports.SKILL_POOL = exports.JWT_EXPIRES_IN = exports.IDEMPOTENCY_TTL_MS = exports.INVITE_CODE_TTL_MS = exports.MAX_TEAM_SIZE = exports.MIN_TEAM_SIZE = exports.HACKATHON_ID = void 0;
// Shared constants for the Hack4Hack PS1 build.
// One hackathon context: every rule below is scoped to this id so the
// "one team per person per hackathon" rule is enforceable by the data model.
exports.HACKATHON_ID = 'hack4hack-2026';
exports.MIN_TEAM_SIZE = 2;
exports.MAX_TEAM_SIZE = 5;
exports.INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
exports.IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
exports.JWT_EXPIRES_IN = '7d';
/** Skills pool used by the seed script and the suggestion scorer. */
exports.SKILL_POOL = [
    'react', 'node', 'typescript', 'mongodb', 'python', 'go', 'rust',
    'ui-design', 'devops', 'testing', 'ml', 'data', 'mobile', 'security',
    'graphql', 'docker', 'aws',
];
/** UTC offsets (hours) offered at registration; used for timezone overlap. */
exports.TIMEZONE_OFFSETS = [-8, -5, 0, 1, 2, 5, 5.5, 8, 10];
//# sourceMappingURL=constants.js.map