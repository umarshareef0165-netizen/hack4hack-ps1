"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = connectDb;
exports.disconnectDb = disconnectDb;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let memoryReplSet = null;
/**
 * Connect to MongoDB.
 * - If MONGO_URI is set, use it (Atlas M0 is a replica set, which is what
 *   multi-document transactions need).
 * - Otherwise start an in-memory single-node replica set (dev convenience;
 *   transactions still work, which is exactly why we use a replSet here
 *   instead of a standalone mongod).
 */
async function connectDb() {
    const uri = process.env.MONGO_URI;
    if (uri) {
        await mongoose_1.default.connect(uri);
        return;
    }
    memoryReplSet = await mongodb_memory_server_1.MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose_1.default.connect(memoryReplSet.getUri());
    console.log('[db] using in-memory MongoDB replica set (no MONGO_URI set)');
}
async function disconnectDb() {
    await mongoose_1.default.disconnect();
    if (memoryReplSet) {
        await memoryReplSet.stop();
        memoryReplSet = null;
    }
}
//# sourceMappingURL=db.js.map