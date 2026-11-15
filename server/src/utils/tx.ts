import mongoose from 'mongoose';

/**
 * Run `fn` inside a MongoDB transaction, retrying transient failures.
 * Write conflicts (two transactions touching the same user/team document)
 * abort with a TransientTransactionError label — retrying is correct and
 * bounded (3 attempts). After 3 attempts the caller sees a 409.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const session = await mongoose.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result as T;
    } catch (err) {
      lastError = err;
      const labels = (err as { errorLabels?: string[] })?.errorLabels ?? [];
      const transient =
        labels.includes('TransientTransactionError') ||
        (err as { code?: number })?.code === 112; // WriteConflict
      if (!transient || attempt === MAX_ATTEMPTS) throw err;
      // Small back-off before retrying a write conflict.
      await new Promise((r) => setTimeout(r, 10 * attempt));
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}
