import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FimCircuitBreaker, classifyError, extractRetryAfter } from "../FimCircuitBreaker"

describe("FimCircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe("initial state", () => {
    it("allows requests when freshly created", () => {
      const breaker = new FimCircuitBreaker()
      expect(breaker.canRequest()).toBe(true)
      expect(breaker.blocked).toBe(false)
      expect(breaker.consecutiveFailures).toBe(0)
    })
  })

  describe("onError", () => {
    it("blocks requests after a failure", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("SSE failed: 401 Unauthorized"))
      expect(breaker.blocked).toBe(true)
      expect(breaker.canRequest()).toBe(false)
      expect(breaker.consecutiveFailures).toBe(1)
      expect(breaker.errorKind).toBe("auth")
    })

    it("classifies 429 errors as ratelimit", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("SSE failed: 429 Too Many Requests"))
      expect(breaker.errorKind).toBe("ratelimit")
    })

    it("classifies unknown errors as other", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("Network error"))
      expect(breaker.errorKind).toBe("other")
    })

    it("respects retryAfterMs parameter", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("429"), 30_000)
      expect(breaker.cooldownMs).toBeGreaterThan(25_000)
      expect(breaker.cooldownMs).toBeLessThanOrEqual(30_000)
    })
  })

  describe("backoff recovery", () => {
    it("allows probe request after backoff expires", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("SSE failed: 429 Too Many Requests"))
      expect(breaker.canRequest()).toBe(false)

      // Advance past the backoff period (min 5s for rate limit)
      vi.advanceTimersByTime(6_000)
      expect(breaker.canRequest()).toBe(true)
    })

    it("applies longer pause for auth errors", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("SSE failed: 401 Unauthorized"))

      // Auth errors get 60s pause
      vi.advanceTimersByTime(30_000)
      expect(breaker.canRequest()).toBe(false)

      vi.advanceTimersByTime(31_000)
      expect(breaker.canRequest()).toBe(true)
    })
  })

  describe("onSuccess", () => {
    it("resets the breaker to closed state", () => {
      const breaker = new FimCircuitBreaker()
      breaker.onError(new Error("429"))
      expect(breaker.blocked).toBe(true)

      // Advance past backoff and trigger probe
      vi.advanceTimersByTime(6_000)
      expect(breaker.canRequest()).toBe(true)

      // Probe succeeds
      breaker.onSuccess()
      expect(breaker.blocked).toBe(false)
      expect(breaker.consecutiveFailures).toBe(0)
      expect(breaker.canRequest()).toBe(true)
    })
  })

  describe("exponential backoff", () => {
    it("increases backoff with consecutive failures", () => {
      const breaker = new FimCircuitBreaker()

      // First failure — 5s backoff
      breaker.onError(new Error("SSE failed: 429"))
      const first = breaker.cooldownMs

      // Advance past backoff, probe, fail again
      vi.advanceTimersByTime(first + 100)
      breaker.canRequest() // triggers half_open
      breaker.onError(new Error("SSE failed: 429"))
      const second = breaker.cooldownMs

      expect(second).toBeGreaterThan(first)
    })

    it("caps backoff at 5 minutes", () => {
      const breaker = new FimCircuitBreaker()

      // Force many failures to hit the cap
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(300_001)
        breaker.canRequest()
        breaker.onError(new Error("SSE failed: 429"))
      }

      expect(breaker.cooldownMs).toBeLessThanOrEqual(5 * 60_000)
    })
  })
})

describe("classifyError", () => {
  it("classifies 401 errors", () => {
    expect(classifyError(new Error("SSE failed: 401 Unauthorized"))).toBe("auth")
    expect(classifyError(new Error("Unauthorized access"))).toBe("auth")
    expect(classifyError("401")).toBe("auth")
  })

  it("classifies 429 errors", () => {
    expect(classifyError(new Error("SSE failed: 429 Too Many Requests"))).toBe("ratelimit")
    expect(classifyError(new Error("rate limit exceeded"))).toBe("ratelimit")
    expect(classifyError(new Error("Too many requests"))).toBe("ratelimit")
  })

  it("classifies other errors", () => {
    expect(classifyError(new Error("Network error"))).toBe("other")
    expect(classifyError(new Error("ECONNREFUSED"))).toBe("other")
    expect(classifyError("something broke")).toBe("other")
  })
})

describe("extractRetryAfter", () => {
  it("extracts retry-after from error message", () => {
    expect(extractRetryAfter(new Error("retry-after: 30"))).toBe(30_000)
    expect(extractRetryAfter(new Error("retryAfter: 60"))).toBe(60_000)
    expect(extractRetryAfter(new Error('{"retry_after": 10}'))).toBe(10_000)
  })

  it("returns undefined when not present", () => {
    expect(extractRetryAfter(new Error("some error"))).toBeUndefined()
    expect(extractRetryAfter("no retry info")).toBeUndefined()
  })

  it("ignores unreasonably large values", () => {
    expect(extractRetryAfter(new Error("retry-after: 99999"))).toBeUndefined()
  })
})
