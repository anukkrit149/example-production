import { describe, expect, it } from 'vitest'
import { kolkataDate, kolkataDayStart, projectFinish, resolvePeriod } from './overview'

// 2026-09-05T20:30:00Z is 02:00 on 6 Sep in Kolkata.
const now = new Date('2026-09-05T20:30:00Z')

describe('kolkata helpers', () => {
  it('day start and date follow the Kolkata calendar, not UTC', () => {
    expect(kolkataDate(now)).toBe('2026-09-06')
    expect(kolkataDayStart(now).toISOString()).toBe('2026-09-05T18:30:00.000Z')
  })
})

describe('resolvePeriod', () => {
  it('today runs from Kolkata midnight to now in hourly buckets', () => {
    const p = resolvePeriod({ period: 'today' }, now)
    expect(p.kind).toBe('today')
    expect(p.from).toBe('2026-09-05T18:30:00.000Z')
    expect(p.to).toBe(now.toISOString())
    expect(p.buckets.map((b) => b.label)).toEqual(['00:00', '01:00', '02:00'])
  })

  it('the current hour is the last bucket, on the Kolkata grid and not the UTC one', () => {
    // 21:10Z is 02:40 IST. +05:30 is not a whole number of hours, so a ceil on
    // the UTC grid lands at 22:00Z = 03:30 IST and invents a phantom 03:00
    // bucket for a Kolkata hour that has not started yet.
    const p = resolvePeriod({ period: 'today' }, new Date('2026-09-05T21:10:00Z'))
    expect(p.buckets.map((b) => b.label)).toEqual(['00:00', '01:00', '02:00'])
    expect(p.buckets.at(-1)!.end).toBe('2026-09-05T21:30:00.000Z') // 03:00 IST
  })

  it('every hour of a day sees itself as the last bucket and no hour beyond', () => {
    // Sweep the half-hour boundary in both directions, at ten-minute steps.
    for (let m = 0; m < 24 * 60; m += 10) {
      const t = new Date(Date.parse('2026-09-05T18:30:00.000Z') + m * 60_000)
      const p = resolvePeriod({ period: 'today' }, t)
      expect(p.buckets).toHaveLength(Math.floor(m / 60) + 1)
      expect(p.buckets.at(-1)!.label).toBe(new Date(t.getTime() + 330 * 60_000).toISOString().slice(11, 14) + '00')
    }
  })

  it('week starts on Monday in Kolkata with daily buckets', () => {
    const p = resolvePeriod({ period: 'week' }, now) // 6 Sep 2026 is a Sunday
    expect(p.from).toBe('2026-08-30T18:30:00.000Z') // Mon 31 Aug 00:00 IST
    expect(p.to).toBe(now.toISOString())
    expect(p.buckets).toHaveLength(7)
    expect(p.buckets[0]!.label).toBe('Mon 31 Aug')
    expect(p.buckets[6]!.label).toBe('Sun 6 Sep')
  })

  it('7d is seven Kolkata days ending today', () => {
    const p = resolvePeriod({ period: '7d' }, now)
    expect(p.buckets).toHaveLength(7)
    expect(p.buckets[6]!.label).toBe('Sun 6 Sep')
    expect(p.from).toBe('2026-08-30T18:30:00.000Z')
    expect(p.to).toBe(now.toISOString())
  })

  it('day takes a date and covers its 24 Kolkata hours', () => {
    const p = resolvePeriod({ period: 'day', date: '2026-09-01' }, now)
    expect(p.from).toBe('2026-08-31T18:30:00.000Z')
    expect(p.to).toBe('2026-09-01T18:30:00.000Z')
    expect(p.buckets).toHaveLength(24)
    expect(p.date).toBe('2026-09-01')
    expect(p.buckets[0]!.label).toBe('00:00')
    expect(p.buckets[23]!.label).toBe('23:00')
  })

  it('falls back to today on garbage', () => {
    expect(resolvePeriod({ period: 'nope', date: 'x' }, now).kind).toBe('today')
    expect(resolvePeriod({ period: 'day', date: '2026-13-40' }, now).kind).toBe('today')
    expect(resolvePeriod({ period: 'day' }, now).kind).toBe('today')
    expect(resolvePeriod({}, now).kind).toBe('today')
  })

  it('every bucket is contiguous and covers the window a reader sees', () => {
    for (const kind of ['today', 'week', '7d'] as const) {
      const p = resolvePeriod({ period: kind }, now)
      expect(p.buckets[0]!.start).toBe(p.from)
      for (let i = 1; i < p.buckets.length; i++) expect(p.buckets[i]!.start).toBe(p.buckets[i - 1]!.end)
      // The last bucket strictly contains `now`, so every event the window can
      // hold has a bucket. The counting window is half-open — the query is
      // `gte: from, lt: to` with `to === now` — so an event at exactly the last
      // bucket's `end` is not fetched in the first place and can never fall off
      // the series.
      expect(Date.parse(p.buckets.at(-1)!.start)).toBeLessThanOrEqual(now.getTime())
      expect(Date.parse(p.buckets.at(-1)!.end)).toBeGreaterThan(now.getTime())
      expect(Date.parse(p.to)).toBeLessThanOrEqual(Date.parse(p.buckets.at(-1)!.end))
    }
  })
})

describe('rangeLabel', () => {
  // `now` is 02:00 on Sunday 6 Sep in Kolkata, so "today" is Sun 6 Sep — not
  // the 5th its UTC instant reads as. Every caption below is the Kolkata one.
  it('names a live period and the days it spans', () => {
    expect(resolvePeriod({ period: 'today' }, now).rangeLabel).toBe('Today · Sun 6 Sep')
    expect(resolvePeriod({ period: 'week' }, now).rangeLabel).toBe('This week · Mon 31 Aug – Sun 6 Sep')
    expect(resolvePeriod({ period: '7d' }, now).rangeLabel).toBe('Last 7 days · Mon 31 Aug – Sun 6 Sep')
  })

  it('a chosen day is its own caption, with no period name to repeat', () => {
    const p = resolvePeriod({ period: 'day', date: '2026-09-03' }, now)
    expect(p.label).toBe('Thu 3 Sep')
    expect(p.rangeLabel).toBe('Thu 3 Sep')
  })

  it('a week that has only just begun still reads as a range of one day', () => {
    const monday = new Date('2026-08-31T04:00:00Z') // 09:30 Mon 31 Aug in Kolkata
    expect(resolvePeriod({ period: 'week' }, monday).rangeLabel).toBe('This week · Mon 31 Aug – Mon 31 Aug')
  })

  it('carries the Kolkata today the day picker bounds itself by', () => {
    expect(resolvePeriod({ period: 'today' }, now).today).toBe('2026-09-06')
    expect(resolvePeriod({ period: 'day', date: '2026-09-03' }, now).today).toBe('2026-09-06')
  })
})

describe('projectFinish', () => {
  it('divides remaining by the daily rate and rounds up to a Kolkata date', () => {
    expect(projectFinish(10, 4, now)).toBe('2026-09-09') // 3 days from 6 Sep
    expect(projectFinish(0, 4, now)).toBe('2026-09-06')
    expect(projectFinish(10, 0, now)).toBeNull()
  })

  it('a negative rate or an already-met remainder never projects backwards', () => {
    expect(projectFinish(5, -1, now)).toBeNull()
    expect(projectFinish(-3, 4, now)).toBe('2026-09-06')
  })
})
