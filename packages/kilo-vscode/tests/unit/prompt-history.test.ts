import { describe, it, expect, beforeEach } from "bun:test"
import { canNavigate, appendEntry, seedEntries, MAX } from "../../webview-ui/src/hooks/usePromptHistory"

describe("canNavigate", () => {
  it("allows up when cursor is at start and not browsing", () => {
    expect(canNavigate("up", "hello", 0, false)).toBe(true)
  })

  it("blocks up when cursor is mid-text and not browsing", () => {
    expect(canNavigate("up", "hello", 3, false)).toBe(false)
  })

  it("allows down when cursor is at end and not browsing", () => {
    expect(canNavigate("down", "hello", 5, false)).toBe(true)
  })

  it("blocks down when cursor is mid-text and not browsing", () => {
    expect(canNavigate("down", "hello", 2, false)).toBe(false)
  })

  it("allows up at either boundary when browsing", () => {
    expect(canNavigate("up", "hello", 0, true)).toBe(true)
    expect(canNavigate("up", "hello", 5, true)).toBe(true)
  })

  it("allows down at either boundary when browsing", () => {
    expect(canNavigate("down", "hello", 0, true)).toBe(true)
    expect(canNavigate("down", "hello", 5, true)).toBe(true)
  })

  it("blocks browsing navigation when cursor is mid-text", () => {
    expect(canNavigate("up", "hello", 3, true)).toBe(false)
    expect(canNavigate("down", "hello", 3, true)).toBe(false)
  })

  it("allows both directions on empty input", () => {
    expect(canNavigate("up", "", 0, false)).toBe(true)
    expect(canNavigate("down", "", 0, false)).toBe(true)
  })

  it("clamps cursor to text bounds", () => {
    expect(canNavigate("up", "hi", -1, false)).toBe(true)
    expect(canNavigate("down", "hi", 999, false)).toBe(true)
  })
})

describe("appendEntry", () => {
  let entries: string[]

  beforeEach(() => {
    entries = []
  })

  it("prepends a trimmed entry", () => {
    appendEntry(entries, "hello", MAX)
    expect(entries).toEqual(["hello"])
  })

  it("trims whitespace", () => {
    appendEntry(entries, "  hello  ", MAX)
    expect(entries).toEqual(["hello"])
  })

  it("skips empty or whitespace-only text", () => {
    expect(appendEntry(entries, "", MAX)).toBe(false)
    expect(appendEntry(entries, "   ", MAX)).toBe(false)
    expect(entries).toEqual([])
  })

  it("deduplicates consecutive identical entries", () => {
    appendEntry(entries, "hello", MAX)
    expect(appendEntry(entries, "hello", MAX)).toBe(false)
    expect(entries).toEqual(["hello"])
  })

  it("allows non-consecutive duplicates", () => {
    appendEntry(entries, "first", MAX)
    appendEntry(entries, "second", MAX)
    appendEntry(entries, "first", MAX)
    expect(entries).toEqual(["first", "second", "first"])
  })

  it("enforces max size", () => {
    for (let i = 0; i < 5; i++) entries.push(`old-${i}`)
    appendEntry(entries, "new", 3)
    expect(entries).toHaveLength(3)
    expect(entries[0]).toBe("new")
  })

  it("returns true when entry was added", () => {
    expect(appendEntry(entries, "hello", MAX)).toBe(true)
  })

  it("returns false when entry was skipped", () => {
    entries.push("hello")
    expect(appendEntry(entries, "hello", MAX)).toBe(false)
  })
})

describe("seedEntries", () => {
  let entries: string[]

  beforeEach(() => {
    entries = []
  })

  it("seeds in reverse chronological order (newest first)", () => {
    seedEntries(entries, ["first", "second", "third"], MAX)
    expect(entries).toEqual(["third", "second", "first"])
  })

  it("skips empty and whitespace-only texts", () => {
    seedEntries(entries, ["", "  ", "valid"], MAX)
    expect(entries).toEqual(["valid"])
  })

  it("deduplicates against existing entries", () => {
    entries.push("existing")
    seedEntries(entries, ["existing", "new"], MAX)
    expect(entries).toEqual(["existing", "new"])
  })

  it("deduplicates within the input array", () => {
    seedEntries(entries, ["dup", "dup", "dup"], MAX)
    expect(entries).toEqual(["dup"])
  })

  it("enforces max size", () => {
    const texts = Array.from({ length: 150 }, (_, i) => `msg-${i}`)
    seedEntries(entries, texts, MAX)
    expect(entries).toHaveLength(MAX)
  })

  it("returns true when entries were added", () => {
    expect(seedEntries(entries, ["hello"], MAX)).toBe(true)
  })

  it("returns false when no entries were added", () => {
    entries.push("hello")
    expect(seedEntries(entries, ["hello"], MAX)).toBe(false)
  })

  it("returns false for all-empty input", () => {
    expect(seedEntries(entries, ["", "  "], MAX)).toBe(false)
  })

  it("preserves existing entries when seeding", () => {
    appendEntry(entries, "recent", MAX)
    seedEntries(entries, ["old1", "old2"], MAX)
    expect(entries[0]).toBe("recent")
    expect(entries).toEqual(["recent", "old2", "old1"])
  })
})
