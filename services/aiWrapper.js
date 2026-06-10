import { setTimeout as delay } from 'timers/promises';

const DEFAULT_TIMEOUT = 15000; // 15s
const DEFAULT_RETRIES = 1;
const FAILURE_THRESHOLD = 3; // open circuit after 3 consecutive failures
const OPEN_DURATION_MS = 60 * 1000; // 1 minute

const circuit = {
  failureCount: 0,
  openUntil: 0
};

function isCircuitOpen() {
  return Date.now() < circuit.openUntil;
}

function recordFailure() {
  circuit.failureCount += 1;
  if (circuit.failureCount >= FAILURE_THRESHOLD) {
    circuit.openUntil = Date.now() + OPEN_DURATION_MS;
  }
}

function recordSuccess() {
  circuit.failureCount = 0;
  circuit.openUntil = 0;
}

export function resetCircuitState() {
  circuit.failureCount = 0;
  circuit.openUntil = 0;
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

  if (isCircuitOpen()) {
    throw new Error('Circuit is open: temporarily refusing requests to external AI service');
  }

  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(endpoint, init, timeoutMs);
      if (!res.ok) {
        const text = await (async () => {
          try { return await res.text(); } catch { return '' }
        })();
        const err = new Error(`Request failed with status ${res.status}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }

      recordSuccess();
      return res;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      recordFailure();
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
