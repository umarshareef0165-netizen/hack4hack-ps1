import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { HACKATHON_ID } from '../utils/constants';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  skills: string[];
  /** UTC offset in hours, e.g. -8 for Los Angeles, 5 for Pakistan. */
  timezoneOffset: number;
  lookingForTeam: boolean;
  /** The team this user belongs to in this hackathon, or null. One team per person. */
  teamId: Types.ObjectId | null;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    skills: { type: [String], default: [] },
    timezoneOffset: { type: Number, default: 0, min: -12, max: 14 },
    lookingForTeam: { type: Boolean, default: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
  },
  { timestamps: true },
);

UserSchema.index({ lookingForTeam: 1, teamId: 1 });
UserSchema.index({ skills: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

// ---------------------------------------------------------------------------

export interface ITeamMember {
  userId: Types.ObjectId;
  joinedAt: Date;
}

export interface ITeam extends Document {
  hackathonId: string;
  name: string;
  description: string;
  leaderId: Types.ObjectId;
  /** Members in join order. `memberCount` mirrors members.length and is the
   *  field the atomic seat claim guards on (see teamService.claimSeat). */
  members: ITeamMember[];
  memberCount: number;
  maxSize: number;
  lookingForTeammates: boolean;
  /** sha256 of the invite code; the plaintext code is shown once, at creation. */
  inviteCodeHash: string;
  inviteCodeExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const TeamSchema = new Schema<ITeam>(
  {
    hackathonId: { type: String, required: true, default: HACKATHON_ID },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 1000 },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [TeamMemberSchema], default: [] },
    memberCount: { type: Number, default: 0, min: 0 },
    maxSize: { type: Number, required: true, min: 2, max: 5 },
    lookingForTeammates: { type: Boolean, default: true },
    inviteCodeHash: { type: String, required: true },
    inviteCodeExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Board query: open teams, newest first. The load test hits this index.
TeamSchema.index({ hackathonId: 1, lookingForTeammates: 1, createdAt: -1 });
TeamSchema.index({ 'members.userId': 1 });

export const Team = mongoose.model<ITeam>('Team', TeamSchema);

// ---------------------------------------------------------------------------

export type JoinRequestStatus = 'pending' | 'accepted' | 'declined';

export interface IJoinRequest extends Document {
  teamId: Types.ObjectId;
  userId: Types.ObjectId;
  status: JoinRequestStatus;
  createdAt: Date;
}

const JoinRequestSchema = new Schema<IJoinRequest>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  },
  { timestamps: true },
);

// At most one *pending* request per (team, user).
JoinRequestSchema.index({ teamId: 1, userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

export const JoinRequest = mongoose.model<IJoinRequest>('JoinRequest', JoinRequestSchema);

// ---------------------------------------------------------------------------

export interface IAuditLog extends Document {
  hackathonId: string;
  teamId: Types.ObjectId | null;
  actorId: Types.ObjectId | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    hackathonId: { type: String, required: true, default: HACKATHON_ID },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ teamId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// ---------------------------------------------------------------------------

export interface IIdempotencyKey extends Document {
  key: string;
  userId: Types.ObjectId | null;
  fingerprint: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  expiresAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    key: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fingerprint: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: keys expire automatically 24 h after creation.
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
