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

// ── Backoff helpers ──────────────────────────────────────────────────────────

/**
 * Full Jitter exponential backoff (AWS recommendation).
 * Returns a random delay in [0, min(capMs, baseMs * 2^(attempt-1))].
 * Jitter prevents thundering herd when multiple requests fail simultaneously.
 *
 * @param {number} attempt  - 1-based attempt index (1 = first retry)
 * @param {number} baseMs   - base delay in ms (default 1000)
 * @param {number} capMs    - maximum delay cap in ms (default 30000)
 * @returns {number} delay in ms
 */
export function computeBackoff(attempt, baseMs = 1000, capMs = 30000) {
  const exponential = Math.min(capMs, baseMs * Math.pow(2, attempt - 1));
  return Math.random() * exponential; // Full Jitter: [0, exponential]
}

/**
 * Parse the Retry-After header value.
 * Supports both integer seconds and HTTP-date formats.
 *
 * @param {string|null} headerValue
 * @returns {number} seconds to wait (0 if unparseable or missing)
 */
export function parseRetryAfter(headerValue) {
  if (!headerValue) return 0;
  const asInt = parseInt(headerValue, 10);
  if (Number.isFinite(asInt) && asInt > 0) return asInt;
  // HTTP-date format: "Wed, 21 Oct 2015 07:28:00 GMT"
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    const diffSec = Math.ceil((asDate - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 0;
  }
  return 0;
}

// ── Fetch with AbortController timeout ──────────────────────────────────────

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

// ── Main wrapper: timeout + conditional retry + circuit breaker ──────────────
//
// Retry policy (Phase 1):
//   • 429 (Rate Limit)  → retry with max(Retry-After, exponentialBackoff) + Full Jitter
//   • 5xx (Server err)  → retry with exponential backoff + Full Jitter
//   • 4xx (Client err)  → NO retry — return response immediately to caller
//   • Network / timeout → retry with exponential backoff + Full Jitter
//
// Circuit breaker counts failures from 5xx and network errors only.
// 429 does NOT open the circuit — it is expected under burst traffic.
//
export async function fetchWithTimeoutRetryCircuit(endpoint, init = {}, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT;
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : DEFAULT_RETRIES;
  const baseMs = Number.isFinite(Number(options.baseMs)) ? Number(options.baseMs) : 1000;
  const capMs = Number.isFinite(Number(options.capMs)) ? Number(options.capMs) : 30000;
  const apiKey = options.apiKey || null; // pass this for per-key circuit tracking
  const label = options.label || 'unknown';

  if (isCircuitOpen(apiKey)) {
    throw new Error(`Circuit is open for this API key: temporarily refusing requests to external AI service`);
  }

  const startTime = Date.now();
  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(endpoint, init, timeoutMs);

      // ── 429 Rate Limit: retry with Retry-After awareness ─────────────────
      if (res.status === 429) {
        if (attempt < retries) {
          const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After'));
          const backoffMs = computeBackoff(attempt + 1, baseMs, capMs);
          const waitMs = Math.max(retryAfterSec * 1000, backoffMs);
          console.warn(`[Retry] 429 Rate Limit (Label: ${label}) — waiting ${Math.round(waitMs)}ms before retry (attempt ${attempt + 1}/${retries})`, {
            retryAfterSec,
            backoffMs: Math.round(backoffMs)
          });
          await delay(waitMs);
          attempt += 1;
          continue;
        }
        // All retries exhausted on 429 — surface as error
        const err429 = new Error('Rate limit exceeded (429): all retries exhausted');
        err429.status = 429;
        recordFailure(apiKey);
        const duration = Date.now() - startTime;
        console.error(`[AI Request] FAILED (429 exhausted) - Label: ${label} | Duration: ${duration}ms | Total Attempts: ${attempt + 1}`);
        throw err429;
      }

      // ── 4xx Client errors (not 429): do NOT retry ────────────────────────
      // These are caller mistakes (bad input, auth, not found).
      // Return immediately so the caller can read the response body.
      if (res.status >= 400 && res.status < 500) {
        const duration = Date.now() - startTime;
        console.warn(`[AI Request] CLIENT_ERROR (${res.status}) - Label: ${label} | Duration: ${duration}ms | Attempts: ${attempt + 1}`);
        return res;
      }

      // ── 5xx Server errors: count as failure, retry with backoff ──────────
      if (!res.ok) {
        const text = await (async () => {
          try { return await res.text(); } catch { return ''; }
        })();
        const err = new Error(`Request failed with status ${res.status}`);
        err.status = res.status;
        err.body = text;
        throw err; // falls into catch block below → retry with backoff
      }

      // ── Success ──────────────────────────────────────────────────────────
      recordSuccess(apiKey);
      const duration = Date.now() - startTime;
      console.log(`[AI Request] SUCCESS - Label: ${label} | Duration: ${duration}ms | Attempts: ${attempt + 1}`);
      return res;

    } catch (err) {
      lastErr = err;
      attempt += 1;

      // 429 errors already handled above (retry in-loop). If we land here
      // from a re-thrown 429 (retries exhausted), stop immediately.
      if (err.status === 429) {
        throw err;
      }

      recordFailure(apiKey);

      const isTimeout = err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('timeout');
      const errType = isTimeout ? 'TIMEOUT' : (err.status ? `HTTP ${err.status}` : 'NETWORK_ERROR');

      const backoffMs = computeBackoff(attempt, baseMs, capMs);
      if (attempt <= retries) {
        console.warn(`[Retry] ${errType} (Label: ${label}) — waiting ${Math.round(backoffMs)}ms before retry (attempt ${attempt}/${retries})`, {
          message: err.message
        });
        await delay(backoffMs);
      }
    }
  }

  // All retries exhausted
  const duration = Date.now() - startTime;
  const finalErr = lastErr || new Error('Unknown fetch error');
  const isTimeout = finalErr.name === 'AbortError' || finalErr.message.includes('aborted') || finalErr.message.includes('timeout');
  const errType = isTimeout ? 'TIMEOUT' : (finalErr.status ? `HTTP ${finalErr.status}` : 'NETWORK_ERROR');
  console.error(`[AI Request] FAILED (${errType}) - Label: ${label} | Duration: ${duration}ms | Total Attempts: ${attempt} | Error: ${finalErr.message}`);
  throw finalErr;
}

export default {
  fetchWithTimeoutRetryCircuit,
  resetCircuitState
};
