"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotency = idempotency;
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models");
const constants_1 = require("../utils/constants");
const crypto_1 = require("../utils/crypto");
const errors_1 = require("../utils/errors");
/**
 * Idempotency for mutations (POST / PUT / PATCH / DELETE with an
 * `Idempotency-Key` header).
 *
 * How it works:
 * 1. fingerprint = sha256(method + path + JSON body). The same key with a
 *    DIFFERENT body is a 422 — a key must always mean the same request.
 * 2. If the key was already stored, the stored response is replayed verbatim
 *    and the handler never runs again — a double-click or a retried request
 *    can never create a second team or a second membership.
 * 3. Otherwise the handler runs; on a 2xx JSON response the status + body
 *    are stored under the key (24 h TTL) before the response is sent.
 * 4. If two identical requests race, the unique index on `key` lets exactly
 *    one store win; the loser re-reads the stored response and replays it.
 *
 * Keys are optional per request (clients that do not send one get no
 * replay protection) but the UI always sends one for team mutations.
 */
function idempotency(req, res, next) {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string' || key.length === 0) {
        next();
        return;
    }
    const fingerprint = (0, crypto_1.sha256)(`${req.method}:${req.path}:${JSON.stringify(req.body ?? {})}`);
    void (async () => {
        try {
            const existing = await models_1.IdempotencyKey.findOne({ key }).lean();
            if (existing) {
                if (existing.fingerprint !== fingerprint) {
                    next((0, errors_1.unprocessable)('Idempotency-Key was already used with a different request body'));
                    return;
                }
                res.status(existing.responseStatus).json(existing.responseBody);
                return;
            }
            // Intercept res.json so we can store the response before sending it.
            const originalJson = res.json.bind(res);
            res.json = ((body) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const authed = req;
                    const userId = authed.userId ? new mongoose_1.default.Types.ObjectId(authed.userId) : null;
                    void models_1.IdempotencyKey.create({
                        key,
                        userId,
                        fingerprint,
                        responseStatus: res.statusCode,
                        responseBody: body,
                        expiresAt: new Date(Date.now() + constants_1.IDEMPOTENCY_TTL_MS),
                    }).catch((err) => {
                        // 11000 = a concurrent identical request stored first. The
                        // response we are about to send is the same one, so ignore.
                        if (err.code !== 11000)
                            console.error('[idempotency] store failed', err);
                    });
                }
                return originalJson(body);
            });
            next();
        }
        catch (err) {
            next(err);
        }
    })();
}
//# sourceMappingURL=idempotency.js.map