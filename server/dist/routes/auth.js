"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_1 = require("express");
const zod_1 = require("zod");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const idempotency_1 = require("../middleware/idempotency");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100),
    email: zod_1.z.string().email().max(200),
    password: zod_1.z.string().min(8).max(128),
    skills: zod_1.z.array(zod_1.z.string().trim().min(1).max(40)).max(20).default([]),
    timezoneOffset: zod_1.z.number().min(-12).max(14).default(0),
    lookingForTeam: zod_1.z.boolean().default(true),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
function publicUser(u) {
    return {
        id: String(u._id),
        name: u.name,
        email: u.email,
        skills: u.skills,
        timezoneOffset: u.timezoneOffset,
        lookingForTeam: u.lookingForTeam,
        teamId: u.teamId ? String(u.teamId) : null,
    };
}
router.post('/register', idempotency_1.idempotency, (0, validate_1.validateBody)(registerSchema), async (req, res, next) => {
    try {
        const { name, email, password, skills, timezoneOffset, lookingForTeam } = req.body;
        const existing = await models_1.User.findOne({ email }).lean();
        if (existing)
            throw (0, errors_1.conflict)('An account with this email already exists');
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await models_1.User.create({ name, email, passwordHash, skills, timezoneOffset, lookingForTeam });
        res.status(201).json({ user: publicUser(user), token: (0, auth_1.signToken)(String(user._id)) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/login', (0, validate_1.validateBody)(loginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await models_1.User.findOne({ email });
        if (!user)
            throw (0, errors_1.unauthorized)('Invalid email or password');
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok)
            throw (0, errors_1.unauthorized)('Invalid email or password');
        res.json({ user: publicUser(user), token: (0, auth_1.signToken)(String(user._id)) });
    }
    catch (err) {
        next(err);
    }
});
router.get('/me', auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = await models_1.User.findById(req.userId);
        if (!user)
            throw (0, errors_1.unauthorized)('Account no longer exists');
        res.json({ user: publicUser(user) });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map