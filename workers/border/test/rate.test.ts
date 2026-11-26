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

describe('rate.ts: 休みの日の項（holiday）', () => {
  const DAY = 24 * H
  /** JST の土日か（テストの側で独立に数える。2026 年 6 月は祝日が無い） */
  const weekendJst = (ms: number) => {
    const dow = (((Math.floor((ms + 9 * H) / DAY) + 4) % 7) + 7) % 7
    return dow === 0 || dow === 6
  }
  /** 1時間あたりの伸びが平日 1・土日 k の回の形（51点）。開始 startAt・長さ hours */
  function shapeOf(id: number, startAt: number, hours: number, k: number): HistoryEvent {
    const steps = Math.round(hours / 0.05)
    const cum = [0]
    for (let i = 0; i < steps; i++) cum.push(cum[i] + (weekendJst(startAt + (i + 0.5) * 0.05 * H) ? k : 1))
    const total = cum[steps]
    const share = GRID.map((p) => cum[Math.round(p * steps)] / total)
    const meta: EventMeta = { id, name: `e${id}`, eventType: 'marathon', unit: 'none', startAt, aggregateAt: startAt + hours * H - 1000 }
    return { meta, shapes: new Map([[1000, { eventId: id, rank: 1000, final: 1_000_000, share } as Shape]]) }
  }
  /** 2026-06-01（月）15:00 JST から1日ずつずらして始まる 150h の回（開始の曜日がばらける） */
  const history = (k: number) => Array.from({ length: 8 }, (_, i) => shapeOf(i + 1, Date.UTC(2026, 5, 1, 6) + i * DAY, 150, k))

  it('既定は項なし（holiday: null）。項ありなら β を返す', () => {
    const plain = fitRate(history(1.4), 1000)
    expect(plain?.options.holiday).toBe(false)
    expect(plain?.holiday).toBeNull()
    const withTerm = fitRate(history(1.4), 1000, { holiday: true })
    expect(withTerm?.options.holiday).toBe(true)
    expect(withTerm?.holiday).toBeTypeOf('number')
  })

  it('土日の伸びが平日の 1.4 倍の合成データから、exp(β) ≈ 1.4 を取り出す。差が無いデータでは β ≈ 0', () => {
    expect(Math.exp(fitRate(history(1.4), 1000, { holiday: true })?.holiday as number)).toBeCloseTo(1.4, 1)
    expect(Math.abs(fitRate(history(1), 1000, { holiday: true })?.holiday as number)).toBeLessThan(0.02)
  })

  it('項ありの表は、その日程の土日で項なしの表より速く積み上がる（0 → 1 の単調増加のまま）', () => {
    const hist = history(1.4)
    const fh = fitRate(hist, 1000, { holiday: true })
    const f0 = fitRate(hist, 1000)
    // 土曜 15:00 JST 開始・150h（最初の 33 時間が土日）
    const startAt = Date.UTC(2026, 5, 20, 6)
    const meta = { startAt, aggregateAt: startAt + 150 * H - 1000 }
    const sh = rateShareTable(fh!, meta)
    const s0 = rateShareTable(f0!, meta)
    expect(sh[0]).toBe(0)
    expect(sh[sh.length - 1]).toBe(1)
    for (let i = 1; i < sh.length; i++) expect(sh[i] as number).toBeGreaterThan(sh[i - 1] as number)
    const sunEnd = GRID.indexOf(0.22) // 33h ÷ 150h
    expect(sh[sunEnd] as number).toBeGreaterThan((s0[sunEnd] as number) * 1.1)
  })

  it('学習の回に休みの日が1時間も無ければ β = 0 で、ほかの係数も表も項なしと1ビットも同じ', () => {
    // 月 15:00 JST 開始・102h（金 21:00 終了）の回を3つ。2026 年 6 月は祝日が無い
    const hist = [1, 8, 15].map((d, i) => shapeOf(i + 1, Date.UTC(2026, 5, d, 6), 102, 1.4))
    const fh = fitRate(hist, 1000, { holiday: true })
    const f0 = fitRate(hist, 1000)
    expect(fh?.holiday).toBe(0)
    expect(fh?.beta).toEqual(f0?.beta)
    expect(fh?.gamma).toEqual(f0?.gamma)
    expect(fh?.clock).toEqual(f0?.clock)
    const startAt = Date.UTC(2026, 5, 22, 6) // 月
    const meta = { startAt, aggregateAt: startAt + 102 * H - 1000 }
    expect(rateShareTable(fh!, meta)).toEqual(rateShareTable(f0!, meta))
  })
})
