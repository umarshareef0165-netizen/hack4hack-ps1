import path from 'node:path';
import { defineConfig } from 'vitest/config';

// mongodb-memory-server writes its instance data to os.tmpdir() (/tmp),
// which on this box is a 512 MB tmpfs shared with other work — a full /tmp
// makes the replica set fail to start ("No space left on device").
// Point it at a directory on the workspace disk instead.
const testTmp = path.resolve(process.cwd(), '.test-tmp');

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    setupFiles: ['./tests/setup.ts'],
    // Race + transaction tests must run serially in one file.
    fileParallelism: false,
    env: {
      TMPDIR: testTmp,
    },
  },
});
