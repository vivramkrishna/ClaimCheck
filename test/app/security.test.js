import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../server/security.js';

function response() {
  return {
    headers: new Map(),
    statusCode: 200,
    body: null,
    set(name, value) {
      if (typeof name === 'object') {
        for (const [key, entry] of Object.entries(name)) this.headers.set(key.toLowerCase(), entry);
      } else this.headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('rate limiter permits the budget then returns a bounded JSON 429', () => {
  let timestamp = 1_000;
  const limit = createRateLimiter({ limit: 2, windowMs: 5_000, now: () => timestamp });
  const request = { ip: '127.0.0.1', requestId: 'request-1' };
  let calls = 0;
  const next = () => { calls += 1; };

  const first = response();
  const second = response();
  const third = response();
  limit(request, first, next);
  limit(request, second, next);
  limit(request, third, next);

  assert.equal(calls, 2);
  assert.equal(first.headers.get('ratelimit-remaining'), '1');
  assert.equal(second.headers.get('ratelimit-remaining'), '0');
  assert.equal(third.statusCode, 429);
  assert.equal(third.body.requestId, 'request-1');
  assert.equal(third.headers.get('retry-after'), '5');

  timestamp += 5_000;
  const reset = response();
  limit(request, reset, next);
  assert.equal(calls, 3);
});
