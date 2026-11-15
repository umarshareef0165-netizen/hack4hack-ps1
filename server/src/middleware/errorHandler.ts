import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/errors';

/** Final error handler: ApiErrors become their status + code; anything else is a 500. */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}
