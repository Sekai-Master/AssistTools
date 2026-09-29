import { describe, expect, it } from 'vitest'
import {
  GRID,
  MAX_GAP_MS,
  buildShape,
  candidateTable,
  confidenceOf,
  interpGrid,
  predict,
  quantile,
  valueAt,
  walkForward,
  type EventMeta,
  type HistoryEvent,
  type Model,
  type Sample,
  type Shape,
} from '../src/model.ts'

const H = 3_600_000

function meta(id: number, startAt: number, hours = 150): EventMeta {
  return { id, name: `e${id}`, eventType: 'marathon', unit: 'none', startAt, aggregateAt: startAt + hours * H - 60_000 }
}

/** 終値 final まで、形 f(p) で積み上がる30分刻みの系列 */
function series(e: EventMeta, final: number, f: (p: number) => number): Sample[] {
  const end = e.aggregateAt + 60_000
  const out: Sample[] = []
  for (let t = e.startAt + 1800_000; t <= end; t += 1800_000) out.push([t, Math.round(final * f((t - e.startAt) / (end - e.startAt)))])
  out.push([e.aggregateAt + 16 * 60_000, final])
  return out
}

describe('valueAt', () => {
  it('開始時刻を 0 として線形補間する', () => {
    const s: Sample[] = [[1000 + H, 100]]
    expect(valueAt(s, 1000, 1000 + H / 2)).toBe(50)
  })

  it('長い空白をまたぐ補間は信用せず null を返す（216 の 23時間欠測）', () => {
    const s: Sample[] = [
      [H, 100],
      [H + MAX_GAP_MS + 1, 300],
    ]
    expect(valueAt(s, 0, H + 1000)).toBeNull()
  })
})

describe('buildShape', () => {
  it('確定前（最後のサンプルが集計前）のイベントは形を作らない', () => {
    const e = meta(1, 0)
    const s = series(e, 1000, (p) => p).filter(([t]) => t < e.aggregateAt)
    expect(buildShape(e, 1000, s)).toBeNull()
  })

  it('終値に対するシェアを格子上に並べる', () => {
    const e = meta(1, 0)
    const shape = buildShape(e, 1000, series(e, 1_000_000, (p) => p * p)) as Shape
    expect(shape.final).toBe(1_000_000)
    expect(shape.share[GRID.indexOf(0.5)]).toBeCloseTo(0.25, 2)
    expect(shape.share[GRID.length - 1]).toBeCloseTo(1, 3)
  })
})

describe('quantile / interpGrid', () => {
  it('分位点は線形補間', () => {
    expect(quantile([0, 10], 0.5)).toBe(5)
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4)
  })

  it('格子の間を線形補間し、欠けがあれば null', () => {
    const t = GRID.map((p) => p)
    expect(interpGrid(t, 0.51)).toBeCloseTo(0.51)
    const holes = GRID.map((p) => (p === 0.52 ? null : p))
    expect(interpGrid(holes, 0.51)).toBeNull()
  })
})

describe('walkForward', () => {
  it('対象より後に終わったイベントを学習に混ぜない（リーク防止）', () => {
    // 前半3件は p^2、後半3件は sqrt(p)。後半の採点に後半自身が混ざると中央値が寄って誤差が縮む
    const hist: HistoryEvent[] = []
    for (let i = 0; i < 6; i++) {
      const e = meta(i + 1, i * 200 * H)
      const f = i < 3 ? (p: number) => p * p : (p: number) => Math.sqrt(p)
      const shape = buildShape(e, 1000, series(e, 1_000_000, f)) as Shape
      hist.push({ meta: e, shapes: new Map([[1000, shape]]) })
    }
    const walk = walkForward(hist, 1000)
    // 学習に使える過去が3件そろう4件目から採点が始まる
    expect(walk.evals[0].eventId).toBe(4)
    // 4件目は前半3件（p^2）だけで当てる: p=0.5 で sqrt(0.5)/0.25 − 1 ≈ +183%
    expect(walk.evals[0].errors.same_all[GRID.indexOf(0.5)]).toBeGreaterThan(1.5)
  })

  it('同じ期間が3件未満なら全マラソンにフォールバックする', () => {
    const hist: HistoryEvent[] = [0, 1, 2].map((i) => {
      const e = meta(i + 1, i * 200 * H, 198)
      return { meta: e, shapes: new Map([[1000, buildShape(e, 1000, series(e, 100, (p) => p)) as Shape]]) }
    })
    const table = candidateTable('same_all', 150, hist, 1000)
    expect(table[GRID.indexOf(0.5)]).toBeCloseTo(0.5, 2)
  })
})

describe('confidenceOf', () => {
  it('帯の幅で 高（10pt以内）・中（30pt以内）・目安（80pt以内）。それより広ければ出さない', () => {
    expect(confidenceOf(-0.04, 0.05)).toBe('high')
    expect(confidenceOf(-0.1, 0.15)).toBe('mid')
    expect(confidenceOf(-0.2, 0.4)).toBe('rough')
    expect(confidenceOf(-0.4, 0.5)).toBeNull()
    expect(confidenceOf(null, 0.1)).toBeNull()
  })
})

describe('predict', () => {
  const e = meta(10, 0)
  const flat = GRID.map((p) => p)
  const model: Model = {
    version: 't',
    createdAt: '',
    algorithm: 'share-median-v1',
    grid: [...GRID],
    ranks: {
      '1000': {
        candidate: 'same_all',
        minProgress: 0.6,
        tables: { '150': flat, all: flat },
        band: { lo: GRID.map(() => -0.05), hi: GRID.map(() => 0.02) },
      },
    },
  }

  it('終値 = 現在値 ÷ シェア', () => {
    const p = predict(model, e, 1000, 500, e.startAt + 75 * H)
    expect(p?.predicted).toBeCloseTo(1000, 0)
  })

  it('帯の向き: 上側の誤差（過大に出やすい）が下限を、下側の誤差が上限を決める', () => {
    const p = predict(model, e, 1000, 500, e.startAt + 75 * H)
    // final = pred / (1 + err)
    expect(p?.low).toBeCloseTo(1000 / 1.02, 0)
    expect(p?.high).toBeCloseTo(1000 / 0.95, 0)
  })

  it('minProgress より前は記録用に出すが visible = false', () => {
    expect(predict(model, e, 1000, 300, e.startAt + 45 * H)?.visible).toBe(false)
    expect(predict(model, e, 1000, 700, e.startAt + 105 * H)?.visible).toBe(true)
  })

  it('確度は帯の幅から付き、帯が広すぎる予測は記録だけして出さない', () => {
    expect(predict(model, e, 1000, 500, e.startAt + 75 * H)?.confidence).toBe('high')
    const wide: Model = {
      ...model,
      ranks: { '1000': { ...model.ranks['1000'], minProgress: 0.04, band: { lo: GRID.map(() => -0.5), hi: GRID.map(() => 0.5) } } },
    }
    const p = predict(wide, e, 1000, 500, e.startAt + 75 * H)
    expect(p?.predicted).toBeCloseTo(1000, 0)
    expect(p?.confidence).toBeNull()
    expect(p?.visible).toBe(false)
  })

  it('期間の表が無ければ all にフォールバックする', () => {
    const e198 = meta(11, 0, 198)
    expect(predict(model, e198, 1000, 500, e198.startAt + 99 * H)?.predicted).toBeCloseTo(1000, 0)
  })
})
