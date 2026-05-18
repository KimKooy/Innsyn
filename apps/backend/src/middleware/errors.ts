import type { ErrorRequestHandler } from 'express';
import { logger } from '~/lib/logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', details?: unknown) {
    super(404, 'not_found', message, details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, 'forbidden', message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, 'unauthorized', message, details);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(400, 'validation_error', message, details);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = 'Service unavailable', details?: unknown) {
    super(503, 'service_unavailable', message, details);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
};
