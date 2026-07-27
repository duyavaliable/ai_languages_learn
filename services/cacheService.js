import crypto from 'crypto';

/**
 * Simple LRU In-Memory Cache for AI Responses.
 * Prevents memory leaks by evicting the oldest items when maxSize is reached.
 */
class LRUCache {
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value, ttlMs) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU status by removing and re-inserting at the end
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const aiResponseCache = new LRUCache(200);

/**
 * Builds a deterministic cache key.
 * Format: {Model}:{PromptVersion}:{Action}:{Hash(NormalizedInput)}_{ConfigHash}
 */
export function buildCacheKey({ model, version, action, input, config }) {
  const configHash = config ? Buffer.from(JSON.stringify(config)).toString('base64').substring(0, 10) : 'def';
  
  // Normalize input to increase cache hit rate (trim and remove duplicate whitespaces)
  const normalizedInput = String(input || '').trim().replace(/\s+/g, ' ').toLowerCase();
  
  const inputHash = crypto.createHash('sha256').update(normalizedInput).digest('hex').substring(0, 16);

  return `${model || 'gemini'}:${version || 'v1'}:${action}:${inputHash}_${configHash}`;
}
