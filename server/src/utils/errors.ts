/** HTTP error with a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (msg: string) => new ApiError(400, 'bad_request', msg);
export const unauthorized = (msg = 'Authentication required') => new ApiError(401, 'unauthorized', msg);
export const forbidden = (msg: string) => new ApiError(403, 'forbidden', msg);
export const notFound = (msg: string) => new ApiError(404, 'not_found', msg);
export const conflict = (msg: string) => new ApiError(409, 'conflict', msg);
export const gone = (msg: string) => new ApiError(410, 'gone', msg);
export const unprocessable = (msg: string) => new ApiError(422, 'unprocessable', msg);
export const tooManyRequests = (msg: string) => new ApiError(429, 'too_many_requests', msg);
