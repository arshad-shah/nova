// formatDuration is already covered by shared-helpers.test.ts. This fills the
// rest of lib/format-time.ts: the relative-time ladder, zero-padding, and
// wall-clock formatters.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatRelativeTime, pad, formatClockTime, formatClockTimeWithMillis } from '../../src/renderer/src/lib/format-time'

afterEach(() => vi.useRealTimers())

describe('formatRelativeTime', () => {
  it('reads "just now" under a minute', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:30Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('just now')
  })

  it('reads in minutes once past 60 seconds, up to just under an hour', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:05:00Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('5m ago')
  })

  it('reads in hours once past 60 minutes, up to just under a day', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T03:00:00Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('3h ago')
  })

  it('reads in days once past 24 hours', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-05T00:00:00Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('4d ago')
  })

  it('is exactly at the 60-second boundary: still "just now" at <60s, minutes at >=60s', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:59Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('just now')
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:01:00Z'))
    expect(formatRelativeTime(new Date('2024-01-01T00:00:00Z').getTime())).toBe('1m ago')
  })
})

describe('pad', () => {
  it('pads to the default width of 2', () => {
    expect(pad(5)).toBe('05')
    expect(pad(42)).toBe('42')
  })

  it('honors a custom width', () => {
    expect(pad(7, 3)).toBe('007')
  })

  it('does not truncate a number already wider than the requested width', () => {
    expect(pad(12345, 2)).toBe('12345')
  })
})

describe('formatClockTime', () => {
  it('zero-pads hours, minutes, and seconds', () => {
    const d = new Date(2024, 0, 1, 4, 5, 6)
    expect(formatClockTime(d.getTime())).toBe('04:05:06')
  })
})

describe('formatClockTimeWithMillis', () => {
  it('appends zero-padded (3-digit) milliseconds', () => {
    const d = new Date(2024, 0, 1, 9, 7, 3, 42)
    expect(formatClockTimeWithMillis(d.getTime())).toBe('09:07:03.042')
  })

  it('pads a single-digit millisecond value to 3 digits', () => {
    const d = new Date(2024, 0, 1, 0, 0, 0, 7)
    expect(formatClockTimeWithMillis(d.getTime())).toBe('00:00:00.007')
  })
})
