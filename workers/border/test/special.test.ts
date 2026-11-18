import { describe, expect, it } from 'vitest'
import { GRID, RANKS, interpGrid, type EventMeta, type Model, type Sample } from '../src/model.ts'
import {
  SOLO_ONLY_EVENTS,
  SPECIAL_DEFAULT_PARAMS,
  SPECIAL_MIN_PROGRESS,
  anchorAt,
  isSpecialReport,
  paramsOf,
  predictSpecial,
  specialAnchorRange,
  specialMargin,
  specialSelection,
  windowForecast,
  type SpecialModel,
} from '../src/special.ts'

const H = 3_600_000
// 226 ワンダーランズ×ショウタイム Memories: 11/20 15:00 〜 11/24 20:59:59（日本時間）・102時間
const START = Date.UTC(2026, 10, 20, 6, 0)
const AGG = START + 102 * H - 1000
const EVENT: EventMeta = { id: 226, name: 'ワンダーランズ×ショウタイム Memories', eventType: 'marathon', unit: 'wonderland_showtime', startAt: START, aggregateAt: AGG }
const SPAN = AGG + 60_000 - START
const at = (p: number) => START + p * SPAN

const linear = () => GRID.map((p) => p)

function specialOf(curves: (rank: number) => { spurt: (number | null)[]; flat: (number | null)[] }, over: Partial<SpecialModel> = {}): SpecialModel {
  return {
    algorithm: 'solo-special-v1',
    version: 'solo-special-v1@test',
    events: [226],
    params: { ...SPECIAL_DEFAULT_PARAMS },
    curves: [{ eventId: 226, startAt: START, aggregateAt: AGG, ranks: Object.fromEntries(RANKS.map((r) => [String(r), curves(r)])) }],
    ...over,
  }
}

/** 102h は標本2件（221・222）の thin。標本3件以上の長さは 150・174 */
function modelWith(special?: SpecialModel): Model {
  const rm = () => ({
    candidate: 'same_all' as const,
    minProgress: 0.04,
    tables: { '150': linear(), '174': linear(), far_short: linear(), all: linear(), 'thin:102': linear() },
    band: { lo: GRID.map(() => -0.05), hi: GRID.map(() => 0.05) },
  })
  return {
    version: 'share-median-v1@e225-test',
    createdAt: '',
    algorithm: 'share-median-v1',
    grid: [...GRID],
    ranks: Object.fromEntries(RANKS.map((r) => [String(r), rm()])),
    knownDurations: [150, 174],
    thinDurations: [{ duration: 102, samples: 2, latestEventId: 222, weight: 0.3 }],
    ...(special ? { special } : {}),
  }
}

describe('一覧（SOLO_ONLY_EVENTS）', () => {
  it('226 が入っている（正本はこの1か所）', () => {
    expect(SOLO_ONLY_EVENTS).toContain(226)
  })
})

describe('specialSelection: 特別モデルで当てるか', () => {
  const ok = specialOf(() => ({ spurt: linear(), flat: linear() }))

  it('一覧にあり、日程の一致する曲線が6順位ぶんあれば、版・値・曲線を返す', () => {
    const sel = specialSelection(modelWith(ok), EVENT)
    expect(sel?.version).toBe('solo-special-v1@test')
    expect(sel?.params).toEqual(SPECIAL_DEFAULT_PARAMS)
    expect(sel?.curves.eventId).toBe(226)
  })

  it('special の無いモデル（古い版）・一覧に無い回は null（ふだんの predict() で今と同じに出す）', () => {
    expect(specialSelection(modelWith(), EVENT)).toBeNull()
    expect(specialSelection(modelWith(ok), { ...EVENT, id: 219 })).toBeNull()
    expect(specialSelection(modelWith({ ...ok, events: [] }), EVENT)).toBeNull()
  })

  it('一覧にあっても、曲線が無い（日程がまだわからなかった）・日程が違う回は null', () => {
    expect(specialSelection(modelWith({ ...ok, curves: [] }), EVENT)).toBeNull()
    expect(specialSelection(modelWith(ok), { ...EVENT, aggregateAt: AGG + 2 * H })).toBeNull()
    expect(specialSelection(modelWith(ok), { ...EVENT, startAt: START + H })).toBeNull()
  })

  it('壊れた曲線（長さ違い・NaN・欠けた順位）や、形の違う版名なら null', () => {
    const short = specialOf(() => ({ spurt: linear().slice(1), flat: linear() }))
    const nan = specialOf((r) => ({ spurt: r === 1000 ? GRID.map(() => NaN) : linear(), flat: linear() }))
    const missing = specialOf(() => ({ spurt: linear(), flat: linear() }))
    delete missing.curves[0].ranks['2000']
    for (const sp of [short, nan, missing, { ...ok, version: 'share-median-v1@x' }, { ...ok, algorithm: 'x' as never }]) {
      expect(specialSelection(modelWith(sp), EVENT)).toBeNull()
    }
    // D1 から読んだ JSON は as Model しているだけ。中身が配列でなくても落ちない
    expect(specialSelection({ ...modelWith(), special: { events: 226 } as never }, EVENT)).toBeNull()
  })

  it('形が合っていても中身の壊れた曲線（欠け・途中で下がる・最後が 1 でない・最初が 0 でない）なら null', () => {
    const bad: (number | null)[][] = [
      GRID.map((p, i) => (i % 2 ? null : p)),
      GRID.map((p) => (p > 0.5 && p < 0.6 ? 0.1 : p)),
      GRID.map((p) => p * 0.9),
      GRID.map((p) => 0.01 + p * 0.99),
    ]
    for (const c of bad) expect(specialSelection(modelWith(specialOf(() => ({ spurt: linear(), flat: c }))), EVENT)).toBeNull()
  })

  it('焼いたときの日程との秒の丸めの違い（5分以内）では外さない', () => {
    expect(specialSelection(modelWith(ok), { ...EVENT, aggregateAt: AGG + 60_000 })).not.toBeNull()
    expect(specialSelection(modelWith(ok), { ...EVENT, aggregateAt: AGG + 6 * 60_000 })).toBeNull()
  })

  it('値（窓・m）はモデルの JSON から読み、おかしければ既定の値', () => {
    const custom = { windowHours: 12, marginBase: 0.1, marginSlope: 0.3 }
    expect(specialSelection(modelWith({ ...ok, params: custom }), EVENT)?.params).toEqual(custom)
    expect(paramsOf({ windowHours: -1, marginBase: 0.1, marginSlope: 0.3 })).toEqual(SPECIAL_DEFAULT_PARAMS)
    expect(paramsOf(null)).toEqual(SPECIAL_DEFAULT_PARAMS)
  })
})

describe('仮の値', () => {
  it('窓 24 時間・m = 0.06 + 0.20 × (1 − p)（経過 4% で約 0.25、50% で 0.16、90% で 0.08）', () => {
    expect(SPECIAL_DEFAULT_PARAMS.windowHours).toBe(24)
    expect(specialMargin(SPECIAL_DEFAULT_PARAMS, 0.04)).toBeCloseTo(0.252, 6)
    expect(specialMargin(SPECIAL_DEFAULT_PARAMS, 0.5)).toBeCloseTo(0.16, 6)
    expect(specialMargin(SPECIAL_DEFAULT_PARAMS, 0.9)).toBeCloseTo(0.08, 6)
    expect(specialMargin(SPECIAL_DEFAULT_PARAMS, 1.2)).toBeCloseTo(0.06, 6)
  })

  it('開始から24時間は実測を引かない（窓を開始から取る）。それより後は24時間前の前後を引く', () => {
    expect(specialAnchorRange(EVENT, SPECIAL_DEFAULT_PARAMS, START + 23 * H)).toBeNull()
    const r = specialAnchorRange(EVENT, SPECIAL_DEFAULT_PARAMS, START + 40 * H)
    expect(r && r[0] < START + 16 * H && r[1] > START + 16 * H).toBe(true)
  })
})

describe('anchorAt: 窓の始まりの実測', () => {
  it('前後の2点で線形補間する', () => {
    expect(anchorAt([[0, 100], [1800_000, 200]], 900_000)).toEqual({ ts: 900_000, value: 150 })
  })
  it('前後がそろわなければ、1時間以内の最も近い1点をその時刻のまま使う。無ければ null', () => {
    expect(anchorAt([[1000, 100]], 30 * 60_000)).toEqual({ ts: 1000, value: 100 })
    expect(anchorAt([[0, 100], [5 * H, 200]], 2.5 * H)).toBeNull()
    expect(anchorAt([], 0)).toBeNull()
  })
})

describe('windowForecast', () => {
  it('F = B + (B − B0) ÷ (S − S0) × (1 − S)', () => {
    expect(windowForecast(600, 300, 0.6, 0.3)).toBeCloseTo(600 + (300 / 0.3) * 0.4, 9)
    expect(windowForecast(500, 0, 0.5, 0)).toBeCloseTo(1000, 9)
  })
  it('窓の中の積み上がりが小さすぎる・値がおかしいときは null', () => {
    expect(windowForecast(600, 590, 0.6, 0.59)).toBeNull()
    expect(windowForecast(600, 700, 0.6, 0.3)).toBeNull()
    expect(windowForecast(0, 0, 0.6, 0.3)).toBeNull()
  })
})

describe('predictSpecial', () => {
  const FINAL = 10_000_000

  it('曲線の形どおりに伸びる回なら、窓の水準からちょうど終値を当てる（追い込みあり・なしが同じなら点も同じ）', () => {
    const sp = specialOf(() => ({ spurt: linear(), flat: linear() }))
    const model = modelWith(sp)
    const sel = specialSelection(model, EVENT)!
    const t = at(0.6)
    const t0 = t - 24 * H
    const nearby: Sample[] = [[t0 - 10 * 60_000, FINAL * ((t0 - 10 * 60_000 - START) / SPAN)], [t0 + 20 * 60_000, FINAL * ((t0 + 20 * 60_000 - START) / SPAN)]]
    const p = predictSpecial(model, sel, EVENT, 1000, FINAL * 0.6, t, nearby)!
    expect(p.predicted).toBeCloseTo(FINAL, -1)
    expect(p.special).toBe('solo')
    expect(p.confidence).toBe('rough')
    expect(p.share).toBeCloseTo(0.6, 6)
    // 帯: 下 = F × (1 − m)、上 = F × (1 + m)。m = 0.06 + 0.2 × 0.4
    expect(p.low).toBeCloseTo(FINAL * (1 - 0.14), -1)
    expect(p.high).toBeCloseTo(FINAL * (1 + 0.14), -1)
  })

  it('点は F_spurt と F_flat の幾何平均。帯の下は小さいほう × (1 − m)、上は大きいほう × (1 + m)', () => {
    // 追い込みありは後ろに積む形（p²）、なしは線形
    const sp = specialOf(() => ({ spurt: GRID.map((p) => p * p), flat: linear() }))
    const model = modelWith(sp)
    const sel = specialSelection(model, EVENT)!
    const t = at(0.7)
    const p0 = (t - 24 * H - START) / SPAN
    const b = 7_000_000
    const b0 = 5_000_000
    const p = predictSpecial(model, sel, EVENT, 1000, b, t, [[t - 24 * H, b0]])!
    const sS = interpGrid(sp.curves[0].ranks['1000'].spurt, 0.7)!
    const sS0 = interpGrid(sp.curves[0].ranks['1000'].spurt, p0)!
    const fS = b + ((b - b0) / (sS - sS0)) * (1 - sS)
    const fF = b + ((b - b0) / (0.7 - p0)) * (1 - 0.7)
    const m = 0.06 + 0.2 * 0.3
    expect(p.predicted).toBeCloseTo(Math.sqrt(fS * fF), 0)
    expect(p.low).toBeCloseTo(Math.max(b, Math.min(fS, fF) * (1 - m)), 0)
    expect(p.high).toBeCloseTo(Math.max(fS, fF) * (1 + m), 0)
  })

  it('開始から24時間までは窓を開始から取る（F = B ÷ S）', () => {
    const sp = specialOf(() => ({ spurt: linear(), flat: linear() }))
    const model = modelWith(sp)
    const p = predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 1_000_000, START + 20 * H, [])!
    expect(p.predicted).toBeCloseTo(1_000_000 / ((20 * H) / SPAN), 0)
  })

  it('24時間前の実測が無いときも、窓を開始から取って出す（止めない）', () => {
    const sp = specialOf(() => ({ spurt: linear(), flat: linear() }))
    const model = modelWith(sp)
    const t = at(0.5)
    const p = predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 5_000_000, t, [])!
    expect(p.predicted).toBeCloseTo(5_000_000 / 0.5, -1)
  })

  it('帯が80ポイントを超えても隠さない（確度は常に目安・表に出す）', () => {
    // 序盤（経過5%）で、追い込みあり・なしが大きく違う → 帯がとても広い
    const sp = specialOf(() => ({ spurt: GRID.map((p) => p ** 3), flat: linear() }))
    const model = modelWith(sp)
    const p = predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 100_000, at(0.05), [])!
    expect(p.high! / p.low! - 1).toBeGreaterThan(0.8)
    expect(p.visible).toBe(true)
    expect(p.confidence).toBe('rough')
    expect(p.low).not.toBeNull()
    expect(p.high).not.toBeNull()
    // 出し始めはふだんと同じ経過 4%
    expect(predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 100_000, at(SPECIAL_MIN_PROGRESS - 0.01), [])!.visible).toBe(false)
  })

  it('下限はいまの値を割らない', () => {
    const sp = specialOf(() => ({ spurt: linear(), flat: linear() }))
    const model = modelWith(sp)
    const p = predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 9_900_000, at(0.99), [])!
    expect(p.low).toBeGreaterThanOrEqual(9_900_000)
  })

  it('古い Bot に「参考値」と出させる欄は、ふだんのモデルがこの長さで選ぶ表の出どころを写す（102h は thin・同じ長さの回 2 回）', () => {
    const sp = specialOf(() => ({ spurt: linear(), flat: linear() }))
    const model = modelWith(sp)
    const p = predictSpecial(model, specialSelection(model, EVENT)!, EVENT, 1000, 5_000_000, at(0.5), [])!
    expect(p.extrapolatedFrom).toBe(150)
    expect(p.referenceSource).toBe('thin')
    expect(p.thin).toEqual({ duration: 102, samples: 2, latestEventId: 222, weight: 0.3 })
  })
})

describe('isSpecialReport', () => {
  it('一覧の回か、特別モデルの版の予測を含む回', () => {
    expect(isSpecialReport({ eventId: 226, modelVersions: ['share-median-v1@e225-x'] })).toBe(true)
    expect(isSpecialReport({ eventId: 227, modelVersions: ['solo-special-v1@abc'] })).toBe(true)
    expect(isSpecialReport({ eventId: 225, modelVersions: ['share-median-v1@e223-x'] })).toBe(false)
    expect(isSpecialReport({ eventId: 225 })).toBe(false)
  })
})
