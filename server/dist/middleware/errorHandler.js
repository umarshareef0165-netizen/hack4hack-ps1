"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const errors_1 = require("../utils/errors");
/** Final error handler: ApiErrors become their status + code; anything else is a 500. */
function errorHandler(err, _req, res, _next) {
    if (err instanceof errors_1.ApiError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}
function notFoundHandler(_req, res) {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}
//# sourceMappingURL=errorHandler.js.map