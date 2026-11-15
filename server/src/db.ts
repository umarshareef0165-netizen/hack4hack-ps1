import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let memoryReplSet: MongoMemoryReplSet | null = null;

/**
 * Connect to MongoDB.
 * - If MONGO_URI is set, use it (Atlas M0 is a replica set, which is what
 *   multi-document transactions need).
 * - Otherwise start an in-memory single-node replica set (dev convenience;
 *   transactions still work, which is exactly why we use a replSet here
 *   instead of a standalone mongod).
 */
export async function connectDb(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (uri) {
    await mongoose.connect(uri);
    return;
  }
  memoryReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(memoryReplSet.getUri());
  console.log('[db] using in-memory MongoDB replica set (no MONGO_URI set)');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryReplSet) {
    await memoryReplSet.stop();
    memoryReplSet = null;
  }
}
