"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const models_1 = require("../models");
const events_1 = require("../services/events");
Object.defineProperty(exports, "broadcast", { enumerable: true, get: function () { return events_1.broadcast; } });
const router = (0, express_1.Router)();
/**
 * GET /api/events — Server-Sent Events stream for live board/team updates.
 * EventSource cannot send Authorization headers, so the JWT is passed as
 * ?token=... (same token, same verification, short-lived stream).
 * Events: team.created, team.member_joined, team.member_left,
 * team.member_removed, team.join_requested, team.join_accepted,
 * team.join_declined.
 */
router.get('/', async (req, res) => {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
        return;
    }
    try {
        const secret = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
        const payload = jsonwebtoken_1.default.verify(token, secret);
        const user = await models_1.User.findById(payload.sub).select('_id').lean();
        if (!user)
            throw new Error('no user');
    }
    catch {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid token' } });
        return;
    }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    (0, events_1.addClient)(res);
    // Heartbeat every 25 s so proxies do not close the stream.
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    req.on('close', () => {
        clearInterval(heartbeat);
        (0, events_1.removeClient)(res);
    });
});
exports.default = router;
//# sourceMappingURL=events.js.map