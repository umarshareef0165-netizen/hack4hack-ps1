"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyKey = exports.AuditLog = exports.JoinRequest = exports.Team = exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const constants_1 = require("../utils/constants");
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    skills: { type: [String], default: [] },
    timezoneOffset: { type: Number, default: 0, min: -12, max: 14 },
    lookingForTeam: { type: Boolean, default: true },
    teamId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team', default: null },
}, { timestamps: true });
UserSchema.index({ lookingForTeam: 1, teamId: 1 });
UserSchema.index({ skills: 1 });
exports.User = mongoose_1.default.model('User', UserSchema);
const TeamMemberSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: () => new Date() },
}, { _id: false });
const TeamSchema = new mongoose_1.Schema({
    hackathonId: { type: String, required: true, default: constants_1.HACKATHON_ID },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 1000 },
    leaderId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [TeamMemberSchema], default: [] },
    memberCount: { type: Number, default: 0, min: 0 },
    maxSize: { type: Number, required: true, min: 2, max: 5 },
    lookingForTeammates: { type: Boolean, default: true },
    inviteCodeHash: { type: String, required: true },
    inviteCodeExpiresAt: { type: Date, required: true },
}, { timestamps: true });
// Board query: open teams, newest first. The load test hits this index.
TeamSchema.index({ hackathonId: 1, lookingForTeammates: 1, createdAt: -1 });
TeamSchema.index({ 'members.userId': 1 });
exports.Team = mongoose_1.default.model('Team', TeamSchema);
const JoinRequestSchema = new mongoose_1.Schema({
    teamId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team', required: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true });
// At most one *pending* request per (team, user).
JoinRequestSchema.index({ teamId: 1, userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
exports.JoinRequest = mongoose_1.default.model('JoinRequest', JoinRequestSchema);
const AuditLogSchema = new mongoose_1.Schema({
    hackathonId: { type: String, required: true, default: constants_1.HACKATHON_ID },
    teamId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team', default: null },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    details: { type: mongoose_1.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });
AuditLogSchema.index({ teamId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
exports.AuditLog = mongoose_1.default.model('AuditLog', AuditLogSchema);
const IdempotencyKeySchema = new mongoose_1.Schema({
    key: { type: String, required: true, unique: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    fingerprint: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: mongoose_1.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });
// TTL index: keys expire automatically 24 h after creation.
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
exports.IdempotencyKey = mongoose_1.default.model('IdempotencyKey', IdempotencyKeySchema);
//# sourceMappingURL=index.js.map