import { randomBytes, randomUUID } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_CLIENTS = 2_000;

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function securityHeaders(request, response, next) {
  const nonce = randomBytes(18).toString('base64');
  response.locals.cspNonce = nonce;
  response.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://cdn.tailwindcss.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'"
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  if (request.secure) response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function requestContext(request, response, next) {
  const supplied = request.get('x-request-id');
  const requestId = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  request.requestId = requestId;
  response.set('X-Request-Id', requestId);
  next();
}

export function noStoreApi(_request, response, next) {
  response.set('Cache-Control', 'no-store');
  next();
}

export function createRateLimiter({
  limit = positiveInteger(process.env.API_RATE_LIMIT, 120, { max: 10_000 }),
  windowMs = WINDOW_MS,
  now = () => Date.now()
} = {}) {
  const clients = new Map();
  return (request, response, next) => {
    const timestamp = now();
    const key = request.ip || request.socket?.remoteAddress || 'unknown';
    let entry = clients.get(key);
    if (!entry || timestamp >= entry.resetAt) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    response.set({
      'RateLimit-Limit': String(limit),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000))
    });
    if (clients.size > MAX_CLIENTS) {
      for (const [client, value] of clients) {
        if (timestamp >= value.resetAt) clients.delete(client);
      }
      while (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value);
    }
    if (entry.count <= limit) return next();
    response.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
    return response.status(429).json({
      error: 'Too many API requests. Try again shortly.',
      status: 429,
      requestId: request.requestId
    });
  };
}

export function graphSandboxHeaders(_request, response, next) {
  response.set({
    'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline'; img-src data:",
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  next();
}
