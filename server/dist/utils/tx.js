"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTransaction = withTransaction;
const mongoose_1 = __importDefault(require("mongoose"));
/**
 * Run `fn` inside a MongoDB transaction, retrying transient failures.
 * Write conflicts (two transactions touching the same user/team document)
 * abort with a TransientTransactionError label — retrying is correct and
 * bounded (3 attempts). After 3 attempts the caller sees a 409.
 */
async function withTransaction(fn) {
    const MAX_ATTEMPTS = 3;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const session = await mongoose_1.default.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                result = await fn(session);
            });
            return result;
        }
        catch (err) {
            lastError = err;
            const labels = err?.errorLabels ?? [];
            const transient = labels.includes('TransientTransactionError') ||
                err?.code === 112; // WriteConflict
            if (!transient || attempt === MAX_ATTEMPTS)
                throw err;
            // Small back-off before retrying a write conflict.
            await new Promise((r) => setTimeout(r, 10 * attempt));
        }
        finally {
            await session.endSession();
        }
    }
    throw lastError;
}
//# sourceMappingURL=tx.js.map