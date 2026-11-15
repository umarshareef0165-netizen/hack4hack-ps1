"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = __importDefault(require("./routes/auth"));
const board_1 = __importDefault(require("./routes/board"));
const events_1 = __importDefault(require("./routes/events"));
const suggestions_1 = __importDefault(require("./routes/suggestions"));
const teams_1 = __importDefault(require("./routes/teams"));
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }));
    app.use(express_1.default.json({ limit: '100kb' }));
    // Global abuse guard: 300 requests / 15 min per IP (tunable for tests/CI).
    app.use((0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: Number(process.env.RATE_LIMIT_MAX ?? 300), standardHeaders: 'draft-7', legacyHeaders: false }));
    // Health check (no auth) — used by the deploy and by the load-test harness.
    app.get('/health', (_req, res) => res.json({ ok: true, service: 'hack4hack-ps1', time: new Date().toISOString() }));
    // Stricter limits where brute force matters.
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        limit: Number(process.env.AUTH_RATE_LIMIT ?? 50),
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'too_many_requests', message: 'Too many attempts — try again later' } },
    });
    const inviteLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        limit: Number(process.env.INVITE_RATE_LIMIT ?? 10),
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'too_many_requests', message: 'Too many invite-code attempts — try again in a minute' } },
    });
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    // Invite-code guessing: 10 attempts / minute / IP (+ 96-bit code entropy).
    app.use('/api/teams/join-by-code', inviteLimiter);
    app.use('/api/auth', auth_1.default);
    app.use('/api/teams', teams_1.default);
    app.use('/api/board', board_1.default);
    app.use('/api/suggestions', suggestions_1.default);
    app.use('/api/events', events_1.default);
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map