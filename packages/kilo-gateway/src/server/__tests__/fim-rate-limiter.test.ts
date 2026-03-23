import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FimRateLimiter, tokenKey } from "../fim-rate-limiter.js"

describe("FimRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows requests under the limit", () => {
    const limiter = new FimRateLimiter(5, 60_000)

    for (let i = 0; i < 5; i++) {
      expect(limiter.check("user1")).toEqual({ allowed: true })
    }
  })

  it("blocks requests over the limit", () => {
    const limiter = new FimRateLimiter(3, 60_000)

    limiter.check("user1")
    limiter.check("user1")
    limiter.check("user1")

    const result = limiter.check("user1")
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfter).toBeGreaterThanOrEqual(1)
    }
  })

  it("tracks users independently", () => {
    const limiter = new FimRateLimiter(2, 60_000)

    limiter.check("user1")
    limiter.check("user1")

    // user1 is exhausted
    expect(limiter.check("user1").allowed).toBe(false)

    // user2 still has tokens
    expect(limiter.check("user2")).toEqual({ allowed: true })
  })

  it("refills tokens over time", () => {
    const limiter = new FimRateLimiter(2, 60_000)

    limiter.check("user1")
    limiter.check("user1")
    expect(limiter.check("user1").allowed).toBe(false)

    // Advance 60 seconds — full refill
    vi.advanceTimersByTime(60_000)
    expect(limiter.check("user1")).toEqual({ allowed: true })
  })

  it("partially refills tokens", () => {
    const limiter = new FimRateLimiter(10, 60_000)

    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      limiter.check("user1")
    }
    expect(limiter.check("user1").allowed).toBe(false)

    // Advance 6 seconds — refills 1 token (10 per 60s = 1 per 6s)
    vi.advanceTimersByTime(6_000)
    expect(limiter.check("user1")).toEqual({ allowed: true })
    // But immediately asking again should fail
    expect(limiter.check("user1").allowed).toBe(false)
  })

  it("dispose cleans up resources", () => {
    const limiter = new FimRateLimiter()
    limiter.check("user1")
    limiter.dispose()
    // After dispose, new checks should still work (just empty map)
    expect(limiter.check("user2")).toEqual({ allowed: true })
  })
})

describe("tokenKey", () => {
  it("creates a prefixed key from token", () => {
    const key = tokenKey("abcdefghijklmnopqrstuvwxyz")
    expect(key).toBe("fim:abcdefghijklmnop")
  })

  it("handles short tokens", () => {
    const key = tokenKey("abc")
    expect(key).toBe("fim:abc")
  })
})
