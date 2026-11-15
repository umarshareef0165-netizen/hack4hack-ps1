import crypto from 'node:crypto';

/** sha256 hex of a string — used for invite codes and idempotency fingerprints. */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate an invite code with 96 bits of entropy (12 random bytes,
 * base64url-encoded to 16 characters). Brute force is infeasible and the
 * join-by-code route is additionally rate-limited per IP.
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/** Small deterministic PRNG (mulberry32) so the seed script is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
