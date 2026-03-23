/**
 * Circuit breaker for FIM/autocomplete requests.
 *
 * Prevents the extension from hammering the server when receiving persistent
 * auth failures (401) or rate limit responses (429). Without this, every
 * keystroke would fire a new request that immediately fails — generating
 * thousands of wasted requests per hour.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through.
 * - OPEN: Requests are blocked. Entered after consecutive errors.
 *         Transitions to HALF_OPEN after the backoff period expires.
 * - HALF_OPEN: A single probe request is allowed through. If it succeeds,
 *              state returns to CLOSED. If it fails, state returns to OPEN
 *              with an increased backoff.
 */

/** Error category extracted from SSE error messages */
export type FimErrorKind = "auth" | "ratelimit" | "other"

type State = "closed" | "open" | "half_open"

const MIN_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000 // 5 minutes
const AUTH_PAUSE_MS = 60_000 // 1 minute pause on auth errors before probe

export class FimCircuitBreaker {
  private state: State = "closed"
  private failures = 0
  private backoff = MIN_BACKOFF_MS
  private blockedUntil = 0
  private lastKind: FimErrorKind = "other"

  /**
   * Check whether a request should be allowed through.
   * Returns true if the request may proceed, false if it should be skipped.
   */
  canRequest(): boolean {
    if (this.state === "closed") return true

    const now = Date.now()
    if (now >= this.blockedUntil) {
      // Backoff period expired — allow a single probe request
      this.state = "half_open"
      return true
    }

    return false
  }

  /** Call when a FIM request completes successfully. */
  onSuccess(): void {
    this.state = "closed"
    this.failures = 0
    this.backoff = MIN_BACKOFF_MS
    this.lastKind = "other"
  }

  /**
   * Call when a FIM request fails.
   * @param error The error from the SSE/fetch layer.
   * @param retryAfterMs Optional server-specified retry delay (from Retry-After header or error body).
   */
  onError(error: unknown, retryAfterMs?: number): void {
    const kind = classifyError(error)
    this.lastKind = kind
    this.failures++

    const delay = this.computeDelay(kind, retryAfterMs)
    this.backoff = Math.min(delay * 2, MAX_BACKOFF_MS)
    this.blockedUntil = Date.now() + delay
    this.state = "open"
  }

  /** Current error kind (useful for logging/telemetry). */
  get errorKind(): FimErrorKind {
    return this.lastKind
  }

  /** Remaining cooldown in ms (0 when not blocked). */
  get cooldownMs(): number {
    return Math.max(0, this.blockedUntil - Date.now())
  }

  /** Number of consecutive failures. */
  get consecutiveFailures(): number {
    return this.failures
  }

  /** Whether the circuit is currently blocking requests. */
  get blocked(): boolean {
    return this.state === "open" && Date.now() < this.blockedUntil
  }

  private computeDelay(kind: FimErrorKind, retryAfterMs?: number): number {
    // If the server told us how long to wait, respect that
    if (retryAfterMs && retryAfterMs > 0) {
      return Math.min(retryAfterMs, MAX_BACKOFF_MS)
    }

    // Auth failures get a longer pause — re-auth won't happen automatically
    if (kind === "auth") {
      return AUTH_PAUSE_MS
    }

    // Exponential backoff for rate limits and other transient errors
    return Math.min(this.backoff, MAX_BACKOFF_MS)
  }
}

/**
 * Classify an error from the SSE/fetch layer.
 * The SDK throws `Error("SSE failed: <status> <statusText>")` for non-OK responses.
 */
export function classifyError(error: unknown): FimErrorKind {
  const msg = error instanceof Error ? error.message : String(error)

  // Match "SSE failed: 401" or status code in JSON error bodies
  if (/\b401\b/.test(msg) || /unauthorized/i.test(msg)) {
    return "auth"
  }

  if (/\b429\b/.test(msg) || /rate.?limit/i.test(msg) || /too many requests/i.test(msg)) {
    return "ratelimit"
  }

  return "other"
}

/**
 * Try to extract a retry-after value (in ms) from an error.
 * Looks for patterns like "retry-after: 30" or "retryAfter":30 in the message.
 */
export function extractRetryAfter(error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error)
  const match = msg.match(/retry[_-]?after[:\s"]*(\d+)/i)
  if (match) {
    const seconds = parseInt(match[1], 10)
    if (seconds > 0 && seconds < 3600) {
      return seconds * 1000
    }
  }
  return undefined
}
