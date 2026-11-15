import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Generous limits in tests so the suite measures the API, not the limiter.
// The invite-code rate limit is tested separately with a fresh app instance.
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT = '100000';
process.env.INVITE_RATE_LIMIT = '100000';

// Instance data goes to the repo-local tmp dir (see vitest.config.ts).
fs.mkdirSync(path.resolve(process.cwd(), '.test-tmp'), { recursive: true });

let replSet: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  // On a loaded box the replica set can take >30 s to elect a primary on
  // the first try; retry instead of failing the whole suite.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      await mongoose.connect(replSet.getUri());
      return;
    } catch (err) {
      lastError = err;
      console.warn(`[setup] replSet start attempt ${attempt} failed, retrying…`);
      try {
        await replSet?.stop();
      } catch {
        /* already stopped */
      }
      replSet = undefined;
    }
  }
  throw lastError;
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});
