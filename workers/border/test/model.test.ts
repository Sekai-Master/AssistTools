import { describe, expect, it } from 'vitest'
import {
  FAR_BAND_FACTOR,
  GRID,
  MAX_GAP_MS,
  buildShape,
  candidateTable,
  chooseTable,
  confidenceOf,
  interpGrid,
  predict,
  quantile,
  rateKey,
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

  it('過去に無い長さ: 範囲の外なら近い端の表を借りて帯を広げ、範囲の中なら all', () => {
    const half = GRID.map((p) => Math.min(1, p * 1.2))
    const m: Model = {
      ...model,
      knownDurations: [150, 222],
      ranks: {
        '1000': {
          ...model.ranks['1000'],
          minProgress: 0.04,
          tables: { '150': flat, '222': flat, all: flat, far_long: half, far_short: flat },
        },
      },
    }
    const e246 = meta(12, 0, 246)
    const t = e246.startAt + 123 * H // 経過 0.5
    const p = predict(m, e246, 1000, 600, t)
    expect(p?.extrapolatedFrom).toBe(222)
    // rate:246 が無いので近い端の表をそのまま借りた（文面は「借りて」のまま。#175）
    expect(p?.referenceSource).toBe('borrow')
    expect(p?.predicted).toBeCloseTo(600 / 0.6, 0) // far_long の 0.5×1.2
    // 帯は 1.2 倍: 上側 0.02 → 0.024、下側 −0.05 → −0.06
    expect(p?.low).toBeCloseTo(1000 / 1.024, 0)
    expect(p?.high).toBeCloseTo(1000 / 0.94, 0)
    // 帯は幅 8.4 ポイントで本来は「高」だが、外挿なので「高」「中」を名乗らない（2026-10-25、221）
    expect(p?.confidence).toBe('rough')
    expect(p?.visible).toBe(true)
    const e198 = meta(13, 0, 198)
    expect(predict(m, e198, 1000, 500, e198.startAt + 99 * H)?.confidence).not.toBe(null)
    expect(predict(m, e198, 1000, 500, e198.startAt + 99 * H)?.extrapolatedFrom).toBeNull()
    expect(predict(m, e198, 1000, 500, e198.startAt + 99 * H)?.referenceSource).toBeNull()
  })

  it('標本1〜2件の長さ: 専用の表（thin:102）で割り、過去に無い長さと同じく帯を広げて確度は名乗らない', () => {
    const thinShare = GRID.map((p) => Math.min(1, p * 0.8))
    const thin = { duration: 102, samples: 1, latestEventId: 221, weight: 0.3 }
    const m: Model = {
      ...model,
      knownDurations: [150, 222],
      thinDurations: [thin],
      ranks: {
        '1000': {
          ...model.ranks['1000'],
          minProgress: 0.04,
          tables: { '150': flat, '222': flat, all: flat, far_long: flat, far_short: flat, 'thin:102': thinShare },
        },
      },
    }
    const e102 = meta(14, 0, 102)
    const p = predict(m, e102, 1000, 400, e102.startAt + 51 * H) // 経過 0.5
    expect(p?.thin).toEqual(thin)
    expect(p?.extrapolatedFrom).toBe(150)
    expect(p?.referenceSource).toBe('thin')
    expect(p?.predicted).toBeCloseTo(400 / 0.4, 0) // thin:102 の 0.5×0.8
    // 帯は 1.2 倍: 上側 0.02 → 0.024、下側 −0.05 → −0.06
    expect(p?.low).toBeCloseTo(1000 / 1.024, 0)
    expect(p?.high).toBeCloseTo(1000 / 0.94, 0)
    expect(p?.confidence).toBe('rough')
    // 同じ長さの表がある 150h は thin を使わない
    const e150 = meta(15, 0, 150)
    expect(predict(m, e150, 1000, 500, e150.startAt + 75 * H)?.thin).toBeNull()
  })

  it('過去に無い長さの帯は FAR_BAND_FACTOR（1.2）倍に広がり、完全一致の長さは広がらない', () => {
    expect(FAR_BAND_FACTOR).toBe(1.2)
    const m: Model = {
      ...model,
      knownDurations: [150],
      ranks: { '1000': { ...model.ranks['1000'], minProgress: 0.04, tables: { '150': flat, all: flat, far_long: flat, far_short: flat } } },
    }
    const exact = predict(m, e, 1000, 500, e.startAt + 75 * H)
    const e246 = meta(16, 0, 246)
    const far = predict(m, e246, 1000, 500, e246.startAt + 123 * H)
    expect(exact?.extrapolatedFrom).toBeNull()
    expect(exact?.low).toBeCloseTo(1000 / (1 + 0.02), 6)
    expect(far?.extrapolatedFrom).toBe(150)
    expect(far?.low).toBeCloseTo(1000 / (1 + 0.02 * FAR_BAND_FACTOR), 6)
    expect(far?.high).toBeCloseTo(1000 / (1 - 0.05 * FAR_BAND_FACTOR), 6)
  })

  it('rate:長さ の表は借り先の代わりに割り、帯の広げと参考値の札は借り先と同じ', () => {
    const half = GRID.map((p) => Math.min(1, p * 1.2))
    const m: Model = {
      ...model,
      knownDurations: [150, 222],
      ranks: {
        '1000': {
          ...model.ranks['1000'],
          minProgress: 0.04,
          tables: { '150': flat, '222': flat, all: flat, far_long: flat, far_short: flat, [rateKey(246)]: half },
        },
      },
    }
    const e246 = meta(17, 0, 246)
    const p = predict(m, e246, 1000, 600, e246.startAt + 123 * H) // 経過 0.5
    expect(p?.predicted).toBeCloseTo(600 / 0.6, 0) // rate:246 の 0.5×1.2（far_long の 0.5 ではない）
    expect(p?.extrapolatedFrom).toBe(222)
    expect(p?.low).toBeCloseTo(1000 / 1.024, 0)
    expect(p?.confidence).toBe('rough')
  })

  it('下側の誤差が −1 に近い帯は、上限が負や無限大になるので幅も確度も出さない', () => {
    const broken: Model = {
      ...model,
      ranks: { '1000': { ...model.ranks['1000'], minProgress: 0.04, band: { lo: GRID.map(() => -0.97), hi: GRID.map(() => -0.3) } } },
    }
    const p = predict(broken, e, 1000, 500, e.startAt + 75 * H)
    expect(p?.high).toBeNull()
    expect(p?.confidence).toBeNull()
    expect(p?.visible).toBe(false)
  })

  it('期間の表が無ければ all にフォールバックする', () => {
    const e198 = meta(11, 0, 198)
    expect(predict(model, e198, 1000, 500, e198.startAt + 99 * H)?.predicted).toBeCloseTo(1000, 0)
  })
})

describe('chooseTable と rate:長さ の表', () => {
  const flat = GRID.map((p) => p)
  const far = GRID.map((p) => Math.min(1, p * 1.1))
  const rate = GRID.map((p) => Math.min(1, p * 1.3))
  const thin = { duration: 102, samples: 1, latestEventId: 221, weight: 0.3 }
  const base: Model = {
    version: 't',
    createdAt: '',
    algorithm: 'share-median-v1',
    grid: [...GRID],
    knownDurations: [150, 222],
    ranks: {},
  }
  const rm = (tables: Record<string, (number | null)[]>) => ({
    candidate: 'same_all' as const,
    minProgress: 0.04,
    tables: { '150': flat, '222': flat, all: flat, far_long: far, far_short: far, ...tables },
    band: { lo: GRID.map(() => -0.05), hi: GRID.map(() => 0.02) },
  })

  it('鍵は数字だけ・thin: と区別できる', () => {
    expect(rateKey(246)).toBe('rate:246')
    expect(/^[0-9]+$/.test(rateKey(246))).toBe(false)
  })

  it('いちばん長い期間より長い回: rate の表を使い、借り先（far_long）と同じ札の数字（最長の期間）を返す', () => {
    const r = rm({ [rateKey(246)]: rate })
    const c = chooseTable(base, r, 246)
    expect(c?.table).toBe(rate)
    expect(c?.extrapolatedFrom).toBe(222)
    expect(c?.thin).toBeNull()
  })

  it('いちばん短い期間より短い回: rate の表を使い、札の数字は最短の期間', () => {
    const r = rm({ [rateKey(102)]: rate })
    const c = chooseTable(base, r, 102)
    expect(c?.table).toBe(rate)
    expect(c?.extrapolatedFrom).toBe(150)
  })

  it('範囲の内側で表の無い長さ: rate の表を使い、札は付かない（all と同じ）', () => {
    const r = rm({ [rateKey(174)]: rate })
    const c = chooseTable(base, r, 174)
    expect(c?.table).toBe(rate)
    expect(c?.extrapolatedFrom).toBeNull()
  })

  it('rate の表が無ければ借り先のまま（古い版のモデルと同じ）', () => {
    const r = rm({})
    expect(chooseTable(base, r, 246)?.table).toBe(far)
    expect(chooseTable(base, r, 102)?.table).toBe(far)
    expect(chooseTable(base, r, 174)?.table).toBe(flat)
  })

  it('他の長さの rate の表は使わない', () => {
    const r = rm({ [rateKey(246)]: rate })
    expect(chooseTable(base, r, 240)?.table).toBe(far)
  })

  it('同じ長さの表（完全一致）があれば rate の表は無視する', () => {
    const r = rm({ [rateKey(150)]: rate })
    const c = chooseTable(base, r, 150)
    expect(c?.table).toBe(flat)
    expect(c?.extrapolatedFrom).toBeNull()
  })

  it('標本1〜2件の長さの専用の表（thin:）があれば、rate の表より優先する（thin の経路は変えない）', () => {
    const thinTable = GRID.map((p) => Math.min(1, p * 0.8))
    const r = rm({ 'thin:102': thinTable, [rateKey(102)]: rate })
    const c = chooseTable({ ...base, thinDurations: [thin] }, r, 102)
    expect(c?.table).toBe(thinTable)
    expect(c?.thin).toEqual(thin)
    expect(c?.extrapolatedFrom).toBe(150)
  })
})
