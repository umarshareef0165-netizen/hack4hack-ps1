import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../utils/errors';

/** Validate req.body against a zod schema; replaces it with the parsed value. */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      next(badRequest(`Invalid input: ${first.path.join('.')} — ${first.message}`));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export const objectIdParam = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

export function validateParam(name: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = objectIdParam.safeParse(req.params[name]);
    if (!parsed.success) {
      next(badRequest(`Invalid input: ${name} — must be a valid id`));
      return;
    }
    next();
  };
}
