import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request tracing middleware.
 * Generates a unique request ID, attaches it to the request and response,
 * and logs request duration on completion.
 */
export function tracing(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  const start = Date.now();

  // Attach to request for downstream use
  (req as any).requestId = requestId;

  // Include in response headers
  res.setHeader('x-request-id', requestId);

  // Log on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      JSON.stringify({
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration,
        timestamp: new Date().toISOString(),
      })
    );
  });

  next();
}
