"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
function jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        // Dev-only fallback. Production must set JWT_SECRET (see DEPLOY-README).
        console.warn('[auth] JWT_SECRET not set — using dev-only fallback secret');
        return 'dev-only-secret-change-me';
    }
    return secret;
}
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, jwtSecret(), { expiresIn: '7d' });
}
/** Require a valid Bearer token; attaches req.userId. */
async function requireAuth(req, _res, next) {
    try {
        const header = req.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
        if (!token || typeof token !== 'string')
            throw (0, errors_1.unauthorized)();
        const payload = jsonwebtoken_1.default.verify(token, jwtSecret());
        const user = await models_1.User.findById(payload.sub).select('_id').lean();
        if (!user)
            throw (0, errors_1.unauthorized)('Account no longer exists');
        req.userId = String(user._id);
        next();
    }
    catch (err) {
        next(err instanceof Error && err.name === 'JsonWebTokenError' ? (0, errors_1.unauthorized)('Invalid token') : err);
    }
}
//# sourceMappingURL=auth.js.map