import { User } from '../models';

/**
 * Teammate suggestions, with the scoring explained in the response.
 *
 * For a user looking for a team (or a team looking for members), every other
 * user who is currently team-less and looking is scored as:
 *
 *   score = 0.6 * skillComplement + 0.4 * timezoneOverlap
 *
 * - skillComplement (0..1): fraction of the requester's skills that the
 *   candidate does NOT have. A high value means the candidate brings skills
 *   the requester lacks — complementary, not identical.
 * - timezoneOverlap (0..1): overlap of a 9:00–17:00 working day in each
 *   person's UTC offset, divided by 8 hours. 1.0 = same working hours.
 *
 * Both components and the final score are returned per candidate, so the
 * ranking is inspectable, not a black box.
 */
export interface Suggestion {
  userId: string;
  name: string;
  skills: string[];
  timezoneOffset: number;
  score: number;
  skillComplement: number;
  timezoneOverlap: number;
  explanation: string;
}

function timezoneOverlapHours(aOffset: number, bOffset: number): number {
  // Working day 09:00–17:00 local, expressed in UTC, then overlapped.
  const aStart = 9 - aOffset;
  const aEnd = 17 - aOffset;
  const bStart = 9 - bOffset;
  const bEnd = 17 - bOffset;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export async function suggestTeammates(
  userId: string,
  limit = 10,
): Promise<Suggestion[]> {
  const me = await User.findById(userId).lean();
  if (!me) return [];
  const mySkills = new Set(me.skills ?? []);

  // Candidates: team-less, looking, not me. Bounded scan (500) keeps the
  // endpoint fast at 10k users; the board endpoint (indexed) is the one
  // the load test measures.
  const candidates = await User.find({
    _id: { $ne: me._id },
    teamId: null,
    lookingForTeam: true,
  })
    .limit(500)
    .lean();

  const scored: Suggestion[] = candidates.map((c) => {
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
      explanation:
        `${candidateSkills.filter((s) => !mySkills.has(s)).length} skill(s) you lack` +
        `; ${overlapHours}h shared working hours (09:00–17:00 local)`,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}
