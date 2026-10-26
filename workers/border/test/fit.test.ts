import { describe, expect, it } from 'vitest'
import { BAND_TAILS, TARGET_COVERAGE, chooseTail, coverageOf, fitModel, fnv1a } from '../src/fit.ts'
import { CANDIDATES, GRID, RANKS, chooseTable, type CandidateId, type EventEval, type EventMeta, type Shape } from '../src/model.ts'

/** 全格子で同じ誤差を持つ評価を並べる（王者は same_all） */
function evalsFrom(errors: readonly number[]): EventEval[] {
  return errors.map((e, i) => {
    const errs = GRID.map((p) => (p >= 0.3 && p <= 0.98 ? e : null))
    return {
      eventId: i + 1,
      duration: 150,
      errors: Object.fromEntries(CANDIDATES.map((c) => [c, errs])) as Record<CandidateId, (number | null)[]>,
      scores: Object.fromEntries(CANDIDATES.map((c) => [c, Math.abs(e)])) as Record<CandidateId, number | null>,
      champion: 'same_all',
    }
  })
}

/** 決まった種から作る一様乱数（テストを毎回同じにする） */
function uniform(n: number, seed = 7): number[] {
  let x = seed
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x / 2 ** 31) * 0.2 - 0.1
  })
}

describe('chooseTail', () => {
  it('ばらつきの無い誤差なら、いちばん狭い裾で目標を満たす', () => {
    const r = chooseTail(evalsFrom(Array(40).fill(0.01)))
    expect(r.tail).toBe(BAND_TAILS[0])
  })

  it('選んだ裾は、前向きの当たり率が目標以上（満たせなければいちばん広い裾）', () => {
    const evals = evalsFrom(uniform(60))
    const r = chooseTail(evals)
    const covered = r.coverage.reduce((a, c) => a + c.covered, 0)
    const total = r.coverage.reduce((a, c) => a + c.total, 0)
    expect(covered / total >= TARGET_COVERAGE || r.tail === BAND_TAILS[BAND_TAILS.length - 1]).toBe(true)
  })

  it('裾を広げるほど当たり率は下がらない', () => {
    const evals = evalsFrom(uniform(60, 11))
    const rate = (tail: number) => {
      const c = coverageOf(evals, tail)
      return c.reduce((a, x) => a + x.covered, 0) / c.reduce((a, x) => a + x.total, 0)
    }
    const rates = BAND_TAILS.map(rate)
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1])
  })
})

describe('fnv1a', () => {
  it('同じ入力なら同じ8桁、違えば別', () => {
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

describe('fitModel の「同じ長さ」の表', () => {
  const H = 3_600_000
  /** 150h の回を8件、最後に 102h の回を1件（221 のような学習に1件しかない長さ） */
  function fixture() {
    const lengths = [150, 150, 150, 150, 150, 150, 150, 150, 102]
    const events: EventMeta[] = lengths.map((h, i) => ({
      id: 200 + i, name: `e${i}`, eventType: 'marathon', unit: 'none',
      startAt: Date.UTC(2026, 0, 1) + i * 10 * 24 * H, aggregateAt: Date.UTC(2026, 0, 1) + i * 10 * 24 * H + h * H,
    }))
    const shapes: Shape[] = events.flatMap((e, i) =>
      RANKS.map((rank) => ({ eventId: e.id, rank, final: 1e7 * (1 + i / 20), share: GRID.map((p) => p ** (1 + i / 50)) })),
    )
    return { events, shapes, now: events[events.length - 1].aggregateAt + 24 * H }
  }

  it('標本が3件未満の長さには表を作らず、Worker は過去に無い長さとして参考値にする', () => {
    const { events, shapes, now } = fixture()
    const { model } = fitModel(events, shapes, now)
    expect(model.knownDurations).toEqual([150])
    const rm = model.ranks['1000']
    expect(rm.tables['150']).toBeDefined()
    expect(rm.tables['102']).toBeUndefined()
    expect(chooseTable(model, rm, 102)?.extrapolatedFrom).toBe(150)
    expect(chooseTable(model, rm, 150)?.extrapolatedFrom).toBeNull()
  })
})
