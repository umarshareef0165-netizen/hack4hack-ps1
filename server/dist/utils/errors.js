"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tooManyRequests = exports.unprocessable = exports.gone = exports.conflict = exports.notFound = exports.forbidden = exports.unauthorized = exports.badRequest = exports.ApiError = void 0;
/** HTTP error with a stable machine-readable code. */
class ApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
const badRequest = (msg) => new ApiError(400, 'bad_request', msg);
exports.badRequest = badRequest;
const unauthorized = (msg = 'Authentication required') => new ApiError(401, 'unauthorized', msg);
exports.unauthorized = unauthorized;
const forbidden = (msg) => new ApiError(403, 'forbidden', msg);
exports.forbidden = forbidden;
const notFound = (msg) => new ApiError(404, 'not_found', msg);
exports.notFound = notFound;
const conflict = (msg) => new ApiError(409, 'conflict', msg);
exports.conflict = conflict;
const gone = (msg) => new ApiError(410, 'gone', msg);
exports.gone = gone;
const unprocessable = (msg) => new ApiError(422, 'unprocessable', msg);
exports.unprocessable = unprocessable;
const tooManyRequests = (msg) => new ApiError(429, 'too_many_requests', msg);
exports.tooManyRequests = tooManyRequests;
//# sourceMappingURL=errors.js.map