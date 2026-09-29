import { describe, expect, it } from 'vitest'
import { BAND_TAILS, TARGET_COVERAGE, chooseTail, coverageOf, fnv1a } from '../src/fit.ts'
import { CANDIDATES, GRID, type CandidateId, type EventEval } from '../src/model.ts'

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
