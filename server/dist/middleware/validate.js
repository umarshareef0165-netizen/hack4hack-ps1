"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectIdParam = void 0;
exports.validateBody = validateBody;
exports.validateParam = validateParam;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
/** Validate req.body against a zod schema; replaces it with the parsed value. */
function validateBody(schema) {
    return (req, _res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            const first = parsed.error.issues[0];
            next((0, errors_1.badRequest)(`Invalid input: ${first.path.join('.')} — ${first.message}`));
            return;
        }
        req.body = parsed.data;
        next();
    };
}
exports.objectIdParam = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');
function validateParam(name) {
    return (req, _res, next) => {
        const parsed = exports.objectIdParam.safeParse(req.params[name]);
        if (!parsed.success) {
            next((0, errors_1.badRequest)(`Invalid input: ${name} — must be a valid id`));
            return;
        }
        next();
    };
}
//# sourceMappingURL=validate.js.map