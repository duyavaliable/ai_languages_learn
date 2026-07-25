import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchWithTimeoutRetryCircuit,
  resetCircuitState,
  computeBackoff,
  parseRetryAfter
} from '../services/aiWrapper.js';

beforeEach(() => {
  vi.restoreAllMocks();
  resetCircuitState();
});

// ── computeBackoff ────────────────────────────────────────────────────────────

describe('computeBackoff', () => {
  it('returns a non-negative value', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(computeBackoff(attempt)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never exceeds the cap', () => {
    const cap = 5000;
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect(computeBackoff(attempt, 1000, cap)).toBeLessThanOrEqual(cap);
    }
  });

  it('uses a custom base and cap', () => {
    // With baseMs=500, capMs=2000, attempt=1 → range [0, 500]
    const result = computeBackoff(1, 500, 2000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(500);
  });

  it('scales exponentially with attempt (max ceiling)', () => {
    // attempt=4: min(30000, 1000 * 2^3) = 8000 → result in [0, 8000]
    const result = computeBackoff(4, 1000, 30000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(8000);
  });
});

// ── parseRetryAfter ───────────────────────────────────────────────────────────

describe('parseRetryAfter', () => {
  it('returns 0 for null or undefined', () => {
    expect(parseRetryAfter(null)).toBe(0);
    expect(parseRetryAfter(undefined)).toBe(0);
    expect(parseRetryAfter('')).toBe(0);
  });

  it('parses an integer seconds string', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter('5')).toBe(5);
  });

  it('returns 0 for a non-positive integer', () => {
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('-10')).toBe(0);
  });

  it('parses a future HTTP-date string', () => {
    const futureDate = new Date(Date.now() + 10_000).toUTCString();
    const result = parseRetryAfter(futureDate);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(11); // roughly 10s + rounding
  });

  it('returns 0 for a past HTTP-date string', () => {
    const pastDate = new Date(Date.now() - 5_000).toUTCString();
    expect(parseRetryAfter(pastDate)).toBe(0);
  });
});

// ── fetchWithTimeoutRetryCircuit — success ────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — success', () => {
  it('returns response on first success', async () => {
    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true })
    };
    vi.stubGlobal('fetch', vi.fn(async () => fakeRes));

    const res = await fetchWithTimeoutRetryCircuit(
      'https://example.test',
      { method: 'GET' },
      { timeoutMs: 5000, retries: 1 }
    );
    const data = await res.json();
    expect(data).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── 4xx client errors — no retry ─────────────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — 4xx no retry', () => {
  it('returns 400 response immediately without retry', async () => {
    const fakeRes = { ok: false, status: 400, headers: { get: () => null } };
    vi.stubGlobal('fetch', vi.fn(async () => fakeRes));

    const res = await fetchWithTimeoutRetryCircuit(
      'https://example.test',
      {},
      { timeoutMs: 5000, retries: 2 }
    );
    expect(res.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1); // no retry
  });

  it('returns 401 response immediately without retry', async () => {
    const fakeRes = { ok: false, status: 401, headers: { get: () => null } };
    vi.stubGlobal('fetch', vi.fn(async () => fakeRes));

    const res = await fetchWithTimeoutRetryCircuit(
      'https://example.test',
      {},
      { timeoutMs: 5000, retries: 2 }
    );
    expect(res.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── 429 rate limit — retry with backoff ──────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — 429 retry', () => {
  it('retries once on 429 then succeeds', async () => {
    const fake429 = {
      ok: false,
      status: 429,
      headers: { get: (h) => (h === 'Retry-After' ? '0' : null) }
    };
    const fakeOk = {
      ok: true,
      status: 200,
      json: async () => ({ done: true }),
      text: async () => '{}'
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(fake429)
      .mockResolvedValueOnce(fakeOk)
    );

    const res = await fetchWithTimeoutRetryCircuit(
      'https://example.test',
      {},
      { timeoutMs: 5000, retries: 1, baseMs: 0, capMs: 0 }
    );
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 429', async () => {
    const fake429 = {
      ok: false,
      status: 429,
      headers: { get: () => '0' }
    };
    vi.stubGlobal('fetch', vi.fn(async () => fake429));

    await expect(
      fetchWithTimeoutRetryCircuit(
        'https://example.test',
        {},
        { timeoutMs: 5000, retries: 1, baseMs: 0, capMs: 0 }
      )
    ).rejects.toThrow('429');

    expect(fetch).toHaveBeenCalledTimes(2); // 1 original + 1 retry
  });
});

// ── 5xx server errors — retry ─────────────────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — 5xx retry', () => {
  it('retries on 503 and succeeds', async () => {
    const fake503 = {
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      headers: { get: () => null }
    };
    const fakeOk = {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => '{}'
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(fake503)
      .mockResolvedValueOnce(fakeOk)
    );

    const res = await fetchWithTimeoutRetryCircuit(
      'https://example.test',
      {},
      { timeoutMs: 5000, retries: 1, baseMs: 0, capMs: 0 }
    );
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 503', async () => {
    const fake503 = {
      ok: false,
      status: 503,
      text: async () => 'error',
      headers: { get: () => null }
    };
    vi.stubGlobal('fetch', vi.fn(async () => fake503));

    await expect(
      fetchWithTimeoutRetryCircuit(
        'https://example.test',
        {},
        { timeoutMs: 5000, retries: 1, baseMs: 0, capMs: 0 }
      )
    ).rejects.toThrow('503');

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ── Network / timeout errors — retry ─────────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — network error retry', () => {
  it('retries once then throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

    await expect(
      fetchWithTimeoutRetryCircuit(
        'https://example.test',
        { method: 'GET' },
        { timeoutMs: 50, retries: 1, baseMs: 0, capMs: 0 }
      )
    ).rejects.toThrow('network');

    expect(fetch).toHaveBeenCalledTimes(2); // 1 original + 1 retry
  });

  it('does not retry when retries=0', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

    await expect(
      fetchWithTimeoutRetryCircuit(
        'https://example.test',
        {},
        { timeoutMs: 50, retries: 0 }
      )
    ).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── Circuit breaker ───────────────────────────────────────────────────────────

describe('fetchWithTimeoutRetryCircuit — circuit breaker', () => {
  it('opens circuit after 3 consecutive failures and refuses further requests', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fail'))));

    // Trigger 3 failures (each with retries: 0 to keep it clean)
    for (let i = 0; i < 3; i++) {
      await expect(
        fetchWithTimeoutRetryCircuit('https://example.test', {}, { timeoutMs: 50, retries: 0, apiKey: 'test-key-for-circuit' })
      ).rejects.toThrow();
    }

    // Circuit should now be open — next call should fail immediately without fetch
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));

    await expect(
      fetchWithTimeoutRetryCircuit('https://example.test', {}, { timeoutMs: 50, retries: 0, apiKey: 'test-key-for-circuit' })
    ).rejects.toThrow('Circuit is open');

    // fetch was NOT called for the 4th request
    expect(fetch).toHaveBeenCalledTimes(0);
  });
});

