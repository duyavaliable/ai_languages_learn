import { setTimeout as delay } from 'timers/promises';

const DEFAULT_TIMEOUT = 15000; // 15s
const DEFAULT_RETRIES = 0;
const FAILURE_THRESHOLD = 3; // open circuit after 3 consecutive failures on the SAME key
const OPEN_DURATION_MS = 60 * 1000; // 1 minute

// ── Per-key circuit breaker ──────────────────────────────────────────────────
// Using Map so each API Key gets its own independent fail counter.
// This prevents a 429/503 on Key A from blocking requests using Key B.
const circuitMap = new Map();

function getCircuit(apiKey) {
  const mapKey = apiKey ? String(apiKey).slice(0, 8) : 'default';
  if (!circuitMap.has(mapKey)) {
    circuitMap.set(mapKey, { failureCount: 0, openUntil: 0 });
  }
  return circuitMap.get(mapKey);
}

function isCircuitOpen(apiKey) {
  return Date.now() < getCircuit(apiKey).openUntil;
}

function recordFailure(apiKey) {
  const c = getCircuit(apiKey);
  c.failureCount += 1;
  if (c.failureCount >= FAILURE_THRESHOLD) {
    c.openUntil = Date.now() + OPEN_DURATION_MS;
    console.warn(`[Circuit] Key ${apiKey ? String(apiKey).slice(0, 8) : '?'}*** opened for ${OPEN_DURATION_MS / 1000}s after ${FAILURE_THRESHOLD} failures`);
  }
}

function recordSuccess(apiKey) {
  const c = getCircuit(apiKey);
  c.failureCount = 0;
  c.openUntil = 0;
}

export function resetCircuitState(apiKey) {
  if (apiKey) {
    const mapKey = String(apiKey).slice(0, 8);
    circuitMap.delete(mapKey);
  } else {
    circuitMap.clear();
  }
}

async function fetchWithTimeout(endpoint, init, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { signal: controller.signal, ...init });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function fetchWithTimeoutRetryCircuit(endpoint, init = {}, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT;
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : DEFAULT_RETRIES;
  const apiKey = options.apiKey || null; // pass this for per-key circuit tracking

  if (isCircuitOpen(apiKey)) {
    throw new Error(`Circuit is open for this API key: temporarily refusing requests to external AI service`);
  }

  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(endpoint, init, timeoutMs);
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          // 4xx errors are client errors – return response for caller to handle (don't count as circuit failure)
          return res;
        }
        const text = await (async () => {
          try { return await res.text(); } catch { return '' }
        })();
        const err = new Error(`Request failed with status ${res.status}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }

      recordSuccess(apiKey);
      return res;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      recordFailure(apiKey);
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      // small delay before retry unless this was the last attempt
      if (attempt <= retries) await delay(backoff);
    }
  }

  // If we reach here, all retries failed
  throw lastErr || new Error('Unknown fetch error');
}

export default {
  fetchWithTimeoutRetryCircuit,
  resetCircuitState
};
