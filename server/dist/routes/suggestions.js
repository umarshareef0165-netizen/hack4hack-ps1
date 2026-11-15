"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const suggestions_1 = require("../services/suggestions");
const router = (0, express_1.Router)();
/**
 * GET /api/suggestions?limit=10 — ranked teammate suggestions.
 * Response includes the score breakdown (skillComplement, timezoneOverlap)
 * and a plain-English explanation per candidate.
 */
router.get('/', auth_1.requireAuth, async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 50);
        const suggestions = await (0, suggestions_1.suggestTeammates)(req.userId, limit);
        res.json({
            suggestions,
            scoring: 'score = 0.6 * skillComplement + 0.4 * timezoneOverlap; ' +
                'skillComplement = share of the candidate\'s skills you lack; ' +
                'timezoneOverlap = shared 09:00-17:00 working hours / 8.',
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=suggestions.js.map