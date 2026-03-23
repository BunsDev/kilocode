/**
 * Per-user sliding window rate limiter for FIM/autocomplete requests.
 *
 * Uses a simple in-memory token bucket approach. Each user (identified by their
 * auth token hash) gets a bucket that refills at a fixed rate. This prevents any
 * single user from overwhelming the upstream FIM API while allowing normal typing
 * patterns through.
 *
 * Default: 30 requests per 60 seconds (0.5 req/s) per user.
 * Normal autocomplete with debouncing generates ~1-3 req/s during active typing,
 * but with pauses between bursts. 30/60s is generous enough for normal use but
 * catches runaway retry loops.
 */

interface Bucket {
  tokens: number
  last: number
}

const DEFAULT_MAX = 30
const DEFAULT_WINDOW_MS = 60_000
const CLEANUP_INTERVAL_MS = 5 * 60_000 // 5 minutes
const STALE_MS = 10 * 60_000 // 10 minutes

export class FimRateLimiter {
  private buckets = new Map<string, Bucket>()
  private max: number
  private window: number
  private cleanup: ReturnType<typeof setInterval> | null = null

  constructor(max = DEFAULT_MAX, window = DEFAULT_WINDOW_MS) {
    this.max = max
    this.window = window

    // Periodically evict stale entries to prevent memory leaks
    this.cleanup = setInterval(() => this.evict(), CLEANUP_INTERVAL_MS)
    // Unref so it doesn't keep the process alive
    if (typeof this.cleanup === "object" && "unref" in this.cleanup) {
      this.cleanup.unref()
    }
  }

  /**
   * Check if a request is allowed for the given user key.
   * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
   */
  check(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
    const now = Date.now()
    const bucket = this.buckets.get(key)

    if (!bucket) {
      // First request — create bucket with one token consumed
      this.buckets.set(key, { tokens: this.max - 1, last: now })
      return { allowed: true }
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.last
    const refill = (elapsed / this.window) * this.max
    bucket.tokens = Math.min(this.max, bucket.tokens + refill)
    bucket.last = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return { allowed: true }
    }

    // Calculate how long until one token is available
    const deficit = 1 - bucket.tokens
    const waitMs = (deficit / this.max) * this.window
    const retryAfter = Math.ceil(waitMs / 1000)
    return { allowed: false, retryAfter: Math.max(1, retryAfter) }
  }

  /** Remove stale entries that haven't been accessed recently. */
  private evict(): void {
    const cutoff = Date.now() - STALE_MS
    for (const [key, bucket] of this.buckets) {
      if (bucket.last < cutoff) {
        this.buckets.delete(key)
      }
    }
  }

  dispose(): void {
    if (this.cleanup) {
      clearInterval(this.cleanup)
      this.cleanup = null
    }
    this.buckets.clear()
  }
}

/**
 * Create a stable hash key from a token.
 * We don't store the raw token — just enough to identify the user.
 */
export function tokenKey(token: string): string {
  // Use first 16 chars as a prefix key — sufficient for deduplication
  // without storing the full secret in memory
  return "fim:" + token.slice(0, 16)
}
