"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestTeammates = suggestTeammates;
const models_1 = require("../models");
function timezoneOverlapHours(aOffset, bOffset) {
    // Working day 09:00–17:00 local, expressed in UTC, then overlapped.
    const aStart = 9 - aOffset;
    const aEnd = 17 - aOffset;
    const bStart = 9 - bOffset;
    const bEnd = 17 - bOffset;
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}
async function suggestTeammates(userId, limit = 10) {
    const me = await models_1.User.findById(userId).lean();
    if (!me)
        return [];
    const mySkills = new Set(me.skills ?? []);
    // Candidates: team-less, looking, not me. Bounded scan (500) keeps the
    // endpoint fast at 10k users; the board endpoint (indexed) is the one
    // the load test measures.
    const candidates = await models_1.User.find({
        _id: { $ne: me._id },
        teamId: null,
        lookingForTeam: true,
    })
        .limit(500)
        .lean();
    const scored = candidates.map((c) => {
        const candidateSkills = c.skills ?? [];
        const complementary = mySkills.size === 0
            ? 1
            : candidateSkills.filter((s) => !mySkills.has(s)).length / Math.max(1, candidateSkills.length);
        // skillComplement: share of the candidate's skills that are new to me.
        const skillComplement = Math.round(complementary * 100) / 100;
        const overlapHours = timezoneOverlapHours(me.timezoneOffset, c.timezoneOffset);
        const timezoneOverlap = Math.round((overlapHours / 8) * 100) / 100;
        const score = Math.round((0.6 * skillComplement + 0.4 * timezoneOverlap) * 100) / 100;
        return {
            userId: String(c._id),
            name: c.name,
            skills: candidateSkills,
            timezoneOffset: c.timezoneOffset,
            score,
            skillComplement,
            timezoneOverlap,
            explanation: `${candidateSkills.filter((s) => !mySkills.has(s)).length} skill(s) you lack` +
                `; ${overlapHours}h shared working hours (09:00–17:00 local)`,
        };
    });
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, limit);
}
//# sourceMappingURL=suggestions.js.map