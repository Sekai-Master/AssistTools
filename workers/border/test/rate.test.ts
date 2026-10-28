import { describe, expect, it } from 'vitest'
import { fitRate, rateShareTable } from '../src/rate.ts'
import { GRID, type EventMeta, type HistoryEvent, type Shape } from '../src/model.ts'

const H = 3_600_000

/** 長さ（時間）と形の指数を変えた回を、開始時刻（時刻の効果）もずらして時系列に並べる（1000位だけ） */
function historyOf(count: number): HistoryEvent[] {
  const hours = [150, 150, 102, 198, 150, 174, 126, 150]
  let start = Date.UTC(2026, 0, 1, 6)
  return Array.from({ length: count }, (_, i) => {
    const meta: EventMeta = { id: i + 1, name: `e${i}`, eventType: 'marathon', unit: 'none', startAt: start, aggregateAt: start + hours[i % hours.length] * H - 60_000 }
    start += (hours[i % hours.length] + 24 + i) * H
    const shape: Shape = { eventId: meta.id, rank: 1000, final: 1_000_000, share: GRID.map((p) => p ** (1.6 + i * 0.1)) }
    return { meta, shapes: new Map([[1000, shape]]) }
  })
}

describe('rate.ts', () => {
  it('どの長さ・開始時刻の表も、0 から 1 へ単調に増える', () => {
    const fit = fitRate(historyOf(8), 1000)
    expect(fit).not.toBeNull()
    for (const [hours, startAt] of [
      [150, Date.UTC(2026, 5, 1, 6)],
      [102, Date.UTC(2026, 5, 1, 6)],
      [246, Date.UTC(2026, 5, 1, 6)],
      [150, Date.UTC(2026, 5, 1, 17, 30)],
    ] as const) {
      const table = rateShareTable(fit!, { startAt, aggregateAt: startAt + hours * H - 1000 })
      expect(table).toHaveLength(GRID.length)
      expect(table[0]).toBe(0)
      expect(table[table.length - 1]).toBe(1)
      for (let i = 1; i < table.length; i++) expect(table[i] as number).toBeGreaterThan(table[i - 1] as number)
    }
  })

  it('前例の無い長さ（246h）の表も作れる（他の長さの履歴を借りる）', () => {
    const fit = fitRate(historyOf(8), 1000)
    const startAt = Date.UTC(2026, 5, 1, 6)
    const table = rateShareTable(fit!, { startAt, aggregateAt: startAt + 246 * H - 1000 })
    expect(table.every((v) => v != null && v >= 0 && v <= 1)).toBe(true)
  })

  it('回が3件未満なら null（形の無い順位も）', () => {
    expect(fitRate(historyOf(2), 1000)).toBeNull()
    expect(fitRate(historyOf(0), 1000)).toBeNull()
    expect(fitRate(historyOf(3), 1000)).not.toBeNull()
    expect(fitRate(historyOf(8), 50)).toBeNull()
  })

  it('当てはめに使った回の数と、回ごとの切片を返す', () => {
    const fit = fitRate(historyOf(5), 1000)
    expect(fit?.nEvents).toBe(5)
    expect(fit?.alphas.map((a) => a.eventId)).toEqual([1, 2, 3, 4, 5])
  })
})
