import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithTimeoutRetryCircuit, resetCircuitState } from '../services/aiWrapper.js';

beforeEach(() => {
  vi.restoreAllMocks();
  resetCircuitState();
});

describe('fetchWithTimeoutRetryCircuit', () => {
  it('returns response on success', async () => {
    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true })
    };

    vi.stubGlobal('fetch', vi.fn(async () => fakeRes));

    const res = await fetchWithTimeoutRetryCircuit('https://example.test', { method: 'GET' }, { timeoutMs: 5000, retries: 1 });
    const data = await res.json();
    expect(data).toEqual({ success: true });
  });

  it('retries once then throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

    await expect(fetchWithTimeoutRetryCircuit('https://example.test', { method: 'GET' }, { timeoutMs: 50, retries: 1 }))
      .rejects.toThrow();
  });
});
