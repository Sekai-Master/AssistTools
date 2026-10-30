import { describe, expect, it } from 'vitest'
import {
  BAND_EVENTS,
  BAND_MIN_EVENTS,
  BLEND_MIN_EVENTS,
  BLEND_SWITCH_POINTS,
  BUCKETS,
  CHECKPOINTS,
  EARLY_CHECKPOINTS,
  TARGET_COVERAGE,
  WIDE_TAILS,
  bandSamples,
  blendErrors,
  blendTable,
  chooseTail,
  coverageOf,
  earlyBlended,
  fitModel,
  fnv1a,
  rateMixed,
  tailCurve,
  thinTable,
  walkEarlyBlend,
} from '../src/fit.ts'
import { fitRate, rateShareTable } from '../src/rate.ts'
import {
  CANDIDATES,
  GRID,
  RANKS,
  THIN_WEIGHT,
  candidateTable,
  chooseTable,
  durationHours,
  median,
  quantile,
  rateKey,
  walkForward,
  type CandidateId,
  type EventEval,
  type EventMeta,
  type HistoryEvent,
  type Shape,
} from '../src/model.ts'

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
  it('ばらつきの無い誤差なら、いちばん狭い裾（15〜85%）で目標を満たす', () => {
    const r = chooseTail(evalsFrom(Array(40).fill(0.01)))
    expect(r.tail).toBe(WIDE_TAILS[0])
    expect(WIDE_TAILS[0]).toBe(0.15)
  })

  it('選んだ裾は、前向きの当たり率が目標以上（満たせなければいちばん広い裾）', () => {
    const evals = evalsFrom(uniform(60))
    const r = chooseTail(evals)
    const covered = r.coverage.reduce((a, c) => a + c.covered, 0)
    const total = r.coverage.reduce((a, c) => a + c.total, 0)
    expect(covered / total >= TARGET_COVERAGE || r.tail === WIDE_TAILS[WIDE_TAILS.length - 1]).toBe(true)
  })

  it('区間（BUCKETS）の格子点で選ぶ。標本が足りない区間でも、広い裾が返る（当たり率が数えられない）', () => {
    const r = chooseTail(evalsFrom(uniform(8)), BUCKETS[3].points)
    expect(r.coverage.every((c) => c.total === 0)).toBe(true)
    expect(r.tail).toBe(WIDE_TAILS[WIDE_TAILS.length - 1])
  })

  it('裾を広げるほど当たり率は下がらない', () => {
    const evals = evalsFrom(uniform(60, 11))
    const rate = (tail: number) => {
      const c = coverageOf(evals, tail)
      return c.reduce((a, x) => a + x.covered, 0) / c.reduce((a, x) => a + x.total, 0)
    }
    const rates = WIDE_TAILS.map(rate)
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1])
  })
})

describe('bandSamples', () => {
  it('1回につき1標本: 経過 ±0.04 の格子点（5点）の誤差の平均。直近 BAND_EVENTS 回だけ', () => {
    // 格子 j の誤差を j/1000 にすると、p=0.5（j=25）の ±0.04 は j=23〜27 で平均 0.025
    const errs = GRID.map((_, j) => j / 1000)
    const errors = Object.fromEntries(CANDIDATES.map((c) => [c, errs])) as Record<CandidateId, (number | null)[]>
    const evals = Array.from({ length: BAND_EVENTS + 10 }, (_, i) => ({ ...evalsFrom([0])[0], eventId: i + 1, errors }))
    const xs = bandSamples(evals, 'same_all', 0.5)
    expect(xs).toHaveLength(BAND_EVENTS)
    expect(BAND_EVENTS).toBe(40)
    for (const x of xs) expect(x).toBeCloseTo(0.025, 12)
  })

  it('窓の中に誤差が1点も無い回は標本にしない。欠けた点は平均から外す', () => {
    // evalsFrom は p が 0.3〜0.98 の外では誤差が null。p=0.1 の窓には何も無い
    expect(bandSamples(evalsFrom([0.01, 0.02]), 'same_all', 0.1)).toEqual([])
    // p=0.3 の窓（0.26〜0.34）には 0.3, 0.32, 0.34 の3点だけある
    expect(bandSamples(evalsFrom([0.01, 0.03]), 'same_all', 0.3)).toEqual([0.01, 0.03])
    expect(BAND_MIN_EVENTS).toBe(10)
  })
})

describe('tailCurve', () => {
  it('区間の中心どうしを線形補間し、端の外は端の裾', () => {
    const ts = [0.15, 0.1, 0.05, 0.05, 0.025, 0.015]
    const curve = tailCurve(ts)
    const at = (p: number) => curve[GRID.indexOf(p)]
    expect(BUCKETS.map((b) => b.center)).toEqual([0.08, 0.22, 0.4, 0.6, 0.8, 0.93])
    expect(at(0.04)).toBe(0.15)
    expect(at(0.08)).toBe(0.15)
    // 中心の点はその区間で選んだ裾そのもの
    expect(at(0.22)).toBeCloseTo(0.1, 12)
    expect(at(0.4)).toBeCloseTo(0.05, 12)
    expect(at(0.6)).toBeCloseTo(0.05, 12)
    expect(at(0.8)).toBeCloseTo(0.025, 12)
    // 0.08 → 0.22 の間
    expect(at(0.14)).toBeCloseTo(0.15 + ((0.1 - 0.15) * (0.14 - 0.08)) / (0.22 - 0.08), 12)
    // 0.4 → 0.6 の間
    expect(at(0.5)).toBeCloseTo(0.05, 12)
    // 0.6 → 0.8 の間
    expect(at(0.7)).toBeCloseTo((0.05 + 0.025) / 2, 12)
    // 0.8 → 0.93 の間、最後の中心（0.93）より後
    expect(at(0.92)).toBeCloseTo(0.025 + ((0.015 - 0.025) * (0.92 - 0.8)) / (0.93 - 0.8), 12)
    expect(at(0.94)).toBe(0.015)
    expect(at(1)).toBe(0.015)
  })
})

describe('fnv1a', () => {
  it('同じ入力なら同じ8桁、違えば別', () => {
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

// ---------------------------------------------------------------------------
// 序盤の差し替え（blend）
// ---------------------------------------------------------------------------

const H = 3_600_000

function metaOf(id: number, startAt: number, hours: number): EventMeta {
  return { id, name: `e${id}`, eventType: 'marathon', unit: 'none', startAt, aggregateAt: startAt + hours * H - 60_000 }
}

/** 長さ hours の回を、形 f(p) で時系列順に並べる（1000位だけ） */
function historyOf(list: readonly { hours: number; f: (p: number) => number }[]): HistoryEvent[] {
  let start = 0
  return list.map(({ hours, f }, i) => {
    const meta = metaOf(i + 1, start, hours)
    start += (hours + 24) * H
    const shape: Shape = { eventId: meta.id, rank: 1000, final: 1_000_000, share: GRID.map(f) }
    return { meta, shapes: new Map([[1000, shape]]) }
  })
}

/** 序盤（0.02〜0.38）の誤差が early、それ以降が 0.02 の評価を n 件（王者は same_all） */
function earlyEvals(n: number, early: number): EventEval[] {
  return Array.from({ length: n }, (_, i) => {
    const errs = GRID.map((p) => (p < 0.02 ? null : p < 0.4 ? early : 0.02))
    return {
      eventId: i + 1,
      duration: 150,
      errors: Object.fromEntries(CANDIDATES.map((c) => [c, errs])) as Record<CandidateId, (number | null)[]>,
      scores: Object.fromEntries(CANDIDATES.map((c) => [c, 0.02])) as Record<CandidateId, number | null>,
      champion: 'same_all',
    }
  })
}

/** blend の誤差列を n 件（序盤だけ値がある） */
function blendOf(n: number, early: number): (number | null)[][] {
  return Array.from({ length: n }, () => GRID.map((p) => (p >= 0.02 && p < 0.4 ? early : null)))
}

describe('blendTable', () => {
  it('同じ長さの回だけなら、経過時間でも残り時間でもそろえ方は経過の割合と同じになり、現行の表と一致する', () => {
    const hist = historyOf([0, 1, 2].map((i) => ({ hours: 150, f: (p: number) => p ** (1.5 + i * 0.5) })))
    const blend = blendTable(150, hist, 1000)
    const base = candidateTable('same_all', 150, hist, 1000)
    for (const i of [2, 10, 25, 40, 48]) expect(blend[i]).toBeCloseTo(base[i] as number, 3)
  })

  it('長さの違う回は、経過時間と残り時間でそろえた値を経過率で重み付けして混ぜる', () => {
    // 200h の回（形 p^2）で 100h の回を当てる。p=0.5: 経過時間 → q=0.25 で 0.0625、残り時間 → q=0.75 で 0.5625
    const hist = historyOf([0, 1, 2].map(() => ({ hours: 200, f: (p: number) => p * p })))
    const blend = blendTable(100, hist, 1000)
    expect(blend[GRID.indexOf(0.5)]).toBeCloseTo(0.5 * 0.0625 + 0.5 * 0.5625, 3)
    // 重みが対称でない点でも確かめる。p=0.2: 経過時間 → q=0.1 で 0.01（重み 0.8）、残り時間 → q=0.6 で 0.36（重み 0.2）
    expect(blend[GRID.indexOf(0.2)]).toBeCloseTo(0.8 * 0.01 + 0.2 * 0.36, 3)
  })

  it('そろえた先が 0〜1 の外になる回は使わず、3件そろわない点は null', () => {
    // 100h の回で 300h の回を当てると、p=0.5 の経過時間は q=1.5、残り時間は q=−0.5 でどちらも外
    const hist = historyOf([0, 1, 2].map(() => ({ hours: 100, f: (p: number) => p })))
    expect(blendTable(300, hist, 1000)[GRID.indexOf(0.5)]).toBeNull()
  })
})

describe('blendErrors', () => {
  it('対象より後に終わった回を表に混ぜない（リーク防止）', () => {
    const list = [80, 150, 220, 100, 190, 60].map((hours) => ({ hours, f: (p: number) => p * p }))
    const hist = historyOf(list)
    const evals = walkForward(hist, 1000).evals
    const before = blendErrors(hist, 1000, evals)
    // 最後の回の形だけを変えても、それより前の回の誤差は変わらない
    const changed = historyOf([...list.slice(0, -1), { hours: 60, f: (p: number) => Math.sqrt(p) }])
    const after = blendErrors(changed, 1000, walkForward(changed, 1000).evals)
    for (let i = 0; i < evals.length - 1; i++) expect(after[i]).toEqual(before[i])
    expect(after[evals.length - 1]).not.toEqual(before[evals.length - 1])
  })
})

describe('earlyBlended', () => {
  it('切り替え点より前だけ blend にし、blend が無い点は元のまま', () => {
    const base = GRID.map(() => 1)
    const blend = GRID.map((p) => (p === 0.1 ? null : 2))
    const out = earlyBlended(base, blend, 0.3)
    expect(out[GRID.indexOf(0.08)]).toBe(2)
    expect(out[GRID.indexOf(0.1)]).toBe(1)
    expect(out[GRID.indexOf(0.28)]).toBe(2)
    expect(out[GRID.indexOf(0.3)]).toBe(1)
    expect(earlyBlended(base, blend, null)).toEqual(base)
  })
})

describe('walkEarlyBlend', () => {
  it('序盤で blend が現行より十分に当たれば、切り替え点の候補のどれかで差し替える', () => {
    const r = walkEarlyBlend(earlyEvals(20, 0.1), blendOf(20, 0.05))
    expect(BLEND_SWITCH_POINTS).toContain(r.switchAt)
    // その時点までの回で選ぶので、採点できた回が10件そろうまでは現行のまま
    expect(BLEND_MIN_EVENTS).toBe(10)
    expect(r.atTime.slice(0, 10)).toEqual(Array(10).fill(null))
    expect(r.atTime[10]).toBe(r.switchAt)
  })

  it('blend が現行に負ければ差し替えない（現行のまま）', () => {
    const r = walkEarlyBlend(earlyEvals(20, 0.05), blendOf(20, 0.1))
    expect(r.switchAt).toBeNull()
    expect(r.atTime.every((s) => s == null)).toBe(true)
  })

  it('勝ち幅が 5% に届かなければ差し替えない（王者の入れ替えと同じヒステリシス）', () => {
    const r = walkEarlyBlend(earlyEvals(20, 0.1), blendOf(20, 0.098))
    expect(r.switchAt).toBeNull()
  })
})

/** 長さ d の標準の日程（15:00 JST 開始・終了の1秒前）。fit.ts が期間ごとの表に混ぜる率モデルの表の日程 */
const standardMeta = (d: number) => {
  const startAt = Date.UTC(2026, 0, 1, 6)
  return { startAt, aggregateAt: startAt + d * H - 1000 }
}

/** 幾何平均（どちらかが欠けた点はもう片方）。fit.ts の geoTables と同じ */
const geoMean = (a: readonly (number | null)[], b: readonly (number | null)[]) =>
  a.map((v, i) => (v != null && b[i] != null && v > 0 && (b[i] as number) > 0 ? Math.sqrt(v * (b[i] as number)) : (v ?? b[i])))

const round5 = (t: readonly (number | null)[]) => t.map((v) => (v == null ? null : Math.round(v * 1e5) / 1e5))

/** hist で学習した率モデルの、meta の日程での表 */
function rateTableOf(hist: readonly HistoryEvent[], rank: number, meta: Pick<EventMeta, 'startAt' | 'aggregateAt'>): (number | null)[] {
  const fit = fitRate(hist, rank)
  if (!fit) throw new Error('率モデルが当てはまらない')
  return rateShareTable(fit, meta)
}

describe('fitModel の序盤の差し替え', () => {
  // 開始からの時間で決まる伸び（1 − e^(−t/20h)）の回を、長さを変えて並べる。経過の割合でそろえると序盤がずれる
  // 150h は3件（「同じ長さ」の表は標本3件以上の長さだけ作る）
  const DURATIONS = [150, 80, 220, 100, 190, 60, 250, 120, 170, 90, 210, 140, 70, 230, 110, 200, 130, 240, 160, 180, 85, 150, 95, 150, 115]
  const byElapsed = (hours: number) => (p: number) => (1 - Math.exp((-p * hours) / 20)) / (1 - Math.exp(-hours / 20))

  function fitFrom(hist: readonly HistoryEvent[]) {
    const events = hist.map((h) => h.meta)
    const shapes = hist.map((h) => h.shapes.get(1000) as Shape)
    const last = events[events.length - 1]
    return { ...fitModel(events, shapes, last.aggregateAt + 2 * H), hist }
  }

  it('前向き検証で勝った順位は、期間ごとの表の切り替え点より前を blend で焼き込み、それ以降は現行の表のまま', () => {
    const { model, summary, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: byElapsed(hours) }))))
    const rm = model.ranks['1000']
    const switchAt = summary.ranks.find((r) => r.rank === 1000)?.earlyBlend?.switchAt
    expect(switchAt).toBeTypeOf('number')
    expect(rm.earlyBlendUntil).toBe(switchAt)
    // 現行の表 = 王者の表と、標準の日程（150h）の率モデルの表の幾何平均
    const base = geoMean(candidateTable(rm.candidate, 150, hist, 1000), rateTableOf(hist, 1000, standardMeta(150)))
    const blend = blendTable(150, hist, 1000)
    const i = GRID.indexOf(0.1)
    const j = GRID.indexOf(0.6)
    expect(rm.tables['150'][i]).toBeCloseTo(blend[i] as number, 4)
    expect(rm.tables['150'][i]).not.toBeCloseTo(base[i] as number, 3)
    expect(rm.tables['150'][j]).toBeCloseTo(base[j] as number, 4)
    // 学習に無い長さ用の表は、当てる回の長さがわからないので blend にも率モデルにも差し替えない
    expect(rm.tables.all).toEqual(round5(candidateTable(rm.candidate, -1, hist, 1000)))
  })

  it('序盤の誤差の要約は、各回をその時点の切り替え点で差し替えた誤差で作る（最後の切り替え点を過去に遡って当てない）', () => {
    const { summary, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: byElapsed(hours) }))))
    const r = summary.ranks.find((x) => x.rank === 1000)
    const walk = walkForward(hist, 1000)
    // 誤差は率モデルと混ぜた表のもの
    const evals = rateMixed(hist, 1000, walk.evals)
    const blend = blendErrors(hist, 1000, evals)
    const early = walkEarlyBlend(evals, blend)
    const i = GRID.indexOf(0.08)
    const errsAt = (at: (k: number) => number | null) =>
      evals
        .map((ev, k) => earlyBlended(ev.errors[ev.champion], blend[k], at(k))[i])
        .slice(-20)
        .filter((v): v is number => v != null)
        .map(Math.abs)
    // 王者が全期間 same_all のままの合成データなので、各回の王者の誤差列と要約の王者の誤差列は同じもの
    expect(walk.evals.every((ev) => ev.champion === walk.champion)).toBe(true)
    const served = median(errsAt((k) => early.atTime[k]))
    const latest = median(errsAt(() => early.switchAt))
    const none = median(errsAt(() => null))
    // 前提: 差し替えで序盤が当たるようになり、遡って当てた値とは区別できる
    expect(served as number).toBeLessThan(none as number)
    expect(latest).not.toBeCloseTo(served as number, 6)
    const value = r?.medianAbsErrorEarly.find((x) => Math.abs(x.p - 0.08) < 1e-9)?.value
    expect(value).toBeCloseTo(served as number, 9)
  })

  it('帯の裾は経過率の6区間ごとに前向きの当たり率で選び、中心どうしを補間してつなぐ。要約の当たり率は各 p の裾で数える', () => {
    const { model, summary, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: byElapsed(hours) }))))
    const r = summary.ranks.find((x) => x.rank === 1000) as (typeof summary.ranks)[number]
    const walk = walkForward(hist, 1000)
    const evals = rateMixed(hist, 1000, walk.evals)
    const blend = blendErrors(hist, 1000, evals)
    const early = walkEarlyBlend(evals, blend)
    const blended = (at: (i: number) => number | null): EventEval[] =>
      evals.map((ev, i) => ({
        ...ev,
        errors: Object.fromEntries(CANDIDATES.map((c) => [c, earlyBlended(ev.errors[c], blend[i], at(i))])) as EventEval['errors'],
      }))
    const served = blended((i) => early.atTime[i])
    const latest = blended(() => early.switchAt)

    // 区間ごとの裾（当たり率は served で数える）
    const tails = BUCKETS.map((b) => chooseTail(served, b.points).tail)
    for (const t of tails) expect(WIDE_TAILS as readonly number[]).toContain(t)
    expect(r.bandTails).toEqual(BUCKETS.map((b, k) => ({ p: b.center, tail: tails[k] })))
    const curve = tailCurve(tails)
    expect(r.bandTail).toBe(tails[3]) // 経過率 0.6 は区間の中心
    expect(r.bandTailEarly).toBe(tails[0]) // 経過率 0.08 も
    CHECKPOINTS.forEach((p) => expect(r.coverage.find((c) => c.p === p)).toEqual(coverageOf(served, curve[GRID.indexOf(p)], [p])[0]))
    EARLY_CHECKPOINTS.forEach((p) => expect(r.coverageEarly.find((c) => c.p === p)).toEqual(coverageOf(served, curve[GRID.indexOf(p)], [p])[0]))
    expect(r.coverage.every((c) => c.total > 0 && c.covered <= c.total)).toBe(true)

    // 帯は latest（最後の切り替え点で差し替えた誤差）の1回1標本の分位点。裾は経過率ごとの補間
    const rm = model.ranks['1000']
    for (const p of [0.1, 0.3, 0.5, 0.9]) {
      const i = GRID.indexOf(p)
      const xs = bandSamples(latest, walk.champion, p)
      expect(xs.length).toBeGreaterThanOrEqual(BAND_MIN_EVENTS)
      expect(rm.band.lo[i]).toBeCloseTo(quantile(xs, curve[i]) as number, 4)
      expect(rm.band.hi[i]).toBeCloseTo(quantile(xs, 1 - curve[i]) as number, 4)
    }
  })

  it('標本1〜2件の長さの表（thin）も、借り先の切り替え点より前を blend に差し替えてから直近の回を混ぜる', () => {
    const { model, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: byElapsed(hours) }))))
    const rm = model.ranks['1000']
    const switchAt = rm.earlyBlendUntil
    expect(switchAt).toBeTypeOf('number')
    // 80h は1件だけ（最短の 150h より短いので借り先は far_short = 150h の全履歴）
    const latest = hist.find((h) => durationHours(h.meta) === 80)?.shapes.get(1000) as Shape
    const base = candidateTable('same_all', 150, hist, 1000)
    const early = earlyBlended(base, blendTable(80, hist, 1000), switchAt as number)
    const round = (t: (number | null)[]) => t.map((v) => (v == null ? null : Math.round(v * 1e5) / 1e5))
    expect(rm.tables['thin:80']).toEqual(round(thinTable(latest.share, early)))
    // 差し替えが本当に効いている: 序盤の点は blend 抜きで混ぜた値と違い、切り替え点より後は同じ
    const i = GRID.indexOf(0.1)
    const j = GRID.indexOf(0.6)
    expect(rm.tables['thin:80'][i]).not.toBeCloseTo(thinTable(latest.share, base)[i] as number, 3)
    expect(rm.tables['thin:80'][j]).toBeCloseTo(thinTable(latest.share, base)[j] as number, 4)
  })

  it('勝てない順位は表を現行のまま焼き込み、earlyBlendUntil を付けない', () => {
    // 形が経過の割合だけで決まる（p²）なら、経過時間・残り時間でそろえる blend は長さの違う回で外れ、現行（王者の表×率モデル）に勝てない
    const { model, summary, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: (p: number) => p * p }))))
    const rm = model.ranks['1000']
    expect(summary.ranks.find((r) => r.rank === 1000)?.earlyBlend?.switchAt).toBeNull()
    expect(rm.earlyBlendUntil).toBeUndefined()
    const base = geoMean(candidateTable(rm.candidate, 150, hist, 1000), rateTableOf(hist, 1000, standardMeta(150)))
    expect(rm.tables['150']).toEqual(round5(base))
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

  it('標本が3件未満の長さには「同じ長さ」の表を作らず、Worker は参考値にする', () => {
    const { events, shapes, now } = fixture()
    const { model } = fitModel(events, shapes, now)
    expect(model.knownDurations).toEqual([150])
    const rm = model.ranks['1000']
    expect(rm.tables['150']).toBeDefined()
    expect(rm.tables['102']).toBeUndefined()
    expect(chooseTable(model, rm, 102)?.extrapolatedFrom).toBe(150)
    expect(chooseTable(model, rm, 150)?.extrapolatedFrom).toBeNull()
    expect(chooseTable(model, rm, 150)?.thin).toBeNull()
  })
})

describe('標本1〜2件の長さの表（thin）', () => {
  const round = (t: readonly (number | null)[]) => t.map((v) => (v == null ? null : Math.round(v * 1e5) / 1e5))

  it('thinTable: 直近の回を weight、借り先を 1 − weight で混ぜる。借り先が無い点は出さず、直近の回の欠測は借り先のまま', () => {
    const t = thinTable([0.2, 0.2, null, 0, 0.5], [0.4, null, 0.3, 0.3, 0.5], 0.3)
    expect(t[0]).toBeCloseTo(0.2 * 0.3 + 0.4 * 0.7, 12)
    expect(t.slice(1)).toEqual([null, 0.3, 0.3, 0.5])
    expect(THIN_WEIGHT).toBe(0.3)
  })

  /** 150h の回を5件、198h の回を3件、その間の 171h の回を1件、最後に 102h の回を1件（221 のように学習に1件しかない長さ）。102h は 150h と形が違う */
  function fixture() {
    const lengths = [150, 198, 171, 150, 198, 150, 198, 150, 150, 102]
    const events: EventMeta[] = lengths.map((h, i) => ({
      id: 200 + i, name: `e${i}`, eventType: 'marathon', unit: 'none',
      startAt: Date.UTC(2026, 0, 1) + i * 10 * 24 * H, aggregateAt: Date.UTC(2026, 0, 1) + i * 10 * 24 * H + h * H,
    }))
    const shapes: Shape[] = events.flatMap((e, i) =>
      RANKS.map((rank) => ({
        eventId: e.id, rank, final: 1e7 * (1 + i / 20),
        share: GRID.map((p) => (durationHours(e) === 102 ? p ** 1.6 : p ** (1 + i / 50))),
      })),
    )
    const hist: HistoryEvent[] = events.map((meta) => ({
      meta, shapes: new Map(shapes.filter((s) => s.eventId === meta.id).map((s) => [s.rank, s])),
    }))
    return { events, shapes, hist, now: events[events.length - 1].aggregateAt + 24 * H }
  }

  it('102h（最短より短い）は far_short に直近の 102h の回を3割混ぜた表を焼き、Worker は参考値として使う', () => {
    const { events, shapes, hist, now } = fixture()
    const { model, summary } = fitModel(events, shapes, now)
    expect(model.thinDurations).toEqual([
      { duration: 102, samples: 1, latestEventId: 209, weight: THIN_WEIGHT },
      { duration: 171, samples: 1, latestEventId: 202, weight: THIN_WEIGHT },
    ])
    expect(summary.thinDurations).toEqual(model.thinDurations)
    for (const rank of RANKS) {
      const rm = model.ranks[String(rank)]
      const latest = hist[9].shapes.get(rank) as Shape
      const base = candidateTable('same_all', 150, hist, rank)
      const early = rm.earlyBlendUntil == null ? base : earlyBlended(base, blendTable(102, hist, rank), rm.earlyBlendUntil)
      expect(rm.tables['thin:102']).toEqual(round(thinTable(latest.share, early)))
      // 借り先そのもの（far_short）とは違う表になっている
      const j = GRID.indexOf(0.5)
      expect(rm.tables['thin:102'][j]).not.toBeCloseTo(rm.tables.far_short[j] as number, 3)
      const choice = chooseTable(model, rm, 102)
      expect(choice?.table).toBe(rm.tables['thin:102'])
      expect(choice?.extrapolatedFrom).toBe(150)
      expect(choice?.thin).toEqual({ duration: 102, samples: 1, latestEventId: 209, weight: THIN_WEIGHT })
    }
  })

  it('範囲の内側の長さ（171h）は all を借り先にし、札の数字はいちばん近い長さ', () => {
    const { events, shapes, hist, now } = fixture()
    const { model } = fitModel(events, shapes, now)
    const rm = model.ranks['1000']
    const latest = hist[2].shapes.get(1000) as Shape
    const j = GRID.indexOf(0.6)
    // 0.6 は切り替え点（最大 0.4）より後なので、blend の差し替えがあっても入らない
    expect(rm.tables['thin:171'][j]).toBeCloseTo(THIN_WEIGHT * (latest.share[j] as number) + (1 - THIN_WEIGHT) * (rm.tables.all[j] as number), 4)
    const choice = chooseTable(model, rm, 171)
    expect(choice?.extrapolatedFrom).toBe(150)
    expect(choice?.thin?.duration).toBe(171)
  })

  it('直近の回にその順位の形が無ければ表を作らず、借り先のまま（参考値の札は残る）', () => {
    const { events, shapes, now } = fixture()
    const { model } = fitModel(events, shapes.filter((s) => !(s.eventId === 209 && s.rank === 2000)), now)
    const rm = model.ranks['2000']
    expect(rm.tables['thin:102']).toBeUndefined()
    const choice = chooseTable(model, rm, 102)
    expect(choice?.table).toBe(rm.tables.far_short)
    expect(choice?.extrapolatedFrom).toBe(150)
    expect(choice?.thin).toBeNull()
    // thin の表が無いので「同じ長さの回が少ない」とは書かず、借り先の文面（#175）
    expect(choice?.source).toBe('borrow')
  })

  it('thin の鍵は完全一致（数字だけの鍵）にならず、thinDurations の無い古い版のモデルでは借り先のまま', () => {
    const { events, shapes, now } = fixture()
    const { model } = fitModel(events, shapes, now)
    const rm = model.ranks['1000']
    expect(Object.keys(rm.tables).filter((k) => /^[0-9]+$/.test(k))).toEqual(['150', '198'])
    const old = { ...model, thinDurations: undefined }
    expect(chooseTable(old, rm, 102)?.table).toBe(rm.tables.far_short)
  })
})

// ---------------------------------------------------------------------------
// 予定の回（まだ終わっていないマラソン）の長さに前例が足りないときの率モデルの表
// ---------------------------------------------------------------------------

describe('fitModel の予定の回（rate:長さ）', () => {
  const DAY = 24 * H
  /** 150h を5件、198h を3件、その間に 171h を1件、最後に 102h を1件（標本1件）。150h と 198h が標本3件以上の長さ */
  const LENGTHS = [150, 198, 171, 150, 198, 150, 198, 150, 150, 102]
  const marathon = (id: number, startAt: number, hours: number, type = 'marathon'): EventMeta => ({
    id, name: `e${id}`, eventType: type, unit: 'none', startAt, aggregateAt: startAt + hours * H - 60_000,
  })

  function fixture() {
    const past = LENGTHS.map((h, i) => marathon(200 + i, Date.UTC(2026, 0, 1) + i * 10 * DAY, h))
    const shapes: Shape[] = past.flatMap((e, i) =>
      RANKS.map((rank) => ({
        eventId: e.id, rank, final: 1e7 * (1 + i / 20),
        share: GRID.map((p) => (durationHours(e) === 102 ? p ** 1.6 : p ** (1 + i / 50))),
      })),
    )
    const hist: HistoryEvent[] = past.map((meta) => ({ meta, shapes: new Map(shapes.filter((s) => s.eventId === meta.id).map((s) => [s.rank, s])) }))
    const now = past[past.length - 1].aggregateAt + DAY
    return { past, shapes, hist, now }
  }
  /** 当てる回: now より後に始まるマラソン */
  const upcoming = (id: number, hours: number, afterNow: number, now: number, type = 'marathon') => marathon(id, now + afterNow * DAY, hours, type)
  const keys = (m: { ranks: Record<string, { tables: Record<string, unknown> }> }) => Object.keys(m.ranks['1000'].tables).filter((k) => k.startsWith('rate:'))

  it('予定の回が無ければ rate: の表は焼かない（これまでの版と同じ）', () => {
    const { past, shapes, now } = fixture()
    const { model } = fitModel(past, shapes, now)
    expect(keys(model)).toEqual([])
  })

  it('標本の無い長さの予定の回: 借り先（far_long / far_short / all）を、その日程の率モデルの表と幾何平均して rate:長さ に焼く', () => {
    const { past, shapes, hist, now } = fixture()
    const u246 = upcoming(300, 246, 5, now)
    const u80 = upcoming(301, 80, 20, now)
    const u174 = upcoming(302, 174, 40, now)
    const { model } = fitModel([...past, u246, u80, u174], shapes, now)
    const plain = fitModel(past, shapes, now).model
    expect(model.knownDurations).toEqual([150, 198])
    expect(keys(model).sort()).toEqual(['rate:174', 'rate:246', 'rate:80'])
    for (const rank of RANKS) {
      const rm = model.ranks[String(rank)]
      const farLong = candidateTable('same_all', 198, hist, rank)
      const farShort = candidateTable('same_all', 150, hist, rank)
      expect(rm.tables[rateKey(246)]).toEqual(round5(geoMean(farLong, rateTableOf(hist, rank, u246))))
      expect(rm.tables[rateKey(80)]).toEqual(round5(geoMean(farShort, rateTableOf(hist, rank, u80))))
      // all は偏りの補正（debias）の入る王者の表で、補正に使う過去の誤差まで再現しないので、焼いた all（5桁）を借り先にして比べる
      const viaAll = geoMean(plain.ranks[String(rank)].tables.all, rateTableOf(hist, rank, u174))
      rm.tables[rateKey(174)].forEach((v, i) => expect(v as number).toBeCloseTo(viaAll[i] as number, 4))
      // 借り先そのものは上書きしない（日程のわからない回のために、そのまま残す）
      for (const key of ['far_long', 'far_short', 'all', '150', '198', 'thin:102', 'thin:171']) expect(rm.tables[key]).toEqual(plain.ranks[String(rank)].tables[key])
      // 率モデルの表を混ぜたので、借り先とは違う表になっている
      const j = GRID.indexOf(0.5)
      expect(rm.tables[rateKey(246)][j]).not.toBeCloseTo(rm.tables.far_long[j] as number, 3)
    }
    // Worker は rate:長さ を借り先の代わりに使い、札の数字は借り先のまま
    const rm = model.ranks['1000']
    const long = chooseTable(model, rm, 246)
    expect(long?.table).toBe(rm.tables[rateKey(246)])
    expect(long?.extrapolatedFrom).toBe(198)
    // 出どころは率モデルを混ぜた表（文面は「借りて」でなく「全イベントの伸び方から作った形を混ぜて」。#175）
    expect(long?.source).toBe('rate')
    expect(chooseTable(model, rm, 80)?.extrapolatedFrom).toBe(150)
    expect(chooseTable(model, rm, 80)?.source).toBe('rate')
    expect(chooseTable(model, rm, 174)?.table).toBe(rm.tables[rateKey(174)])
    expect(chooseTable(model, rm, 174)?.extrapolatedFrom).toBeNull()
    // 範囲の内側（all の回）は参考値でないので、出どころも付けない
    expect(chooseTable(model, rm, 174)?.source).toBeNull()
    // 別の長さの予定は混ざらない
    expect(chooseTable(model, rm, 240)?.table).toBe(rm.tables.far_long)
    expect(chooseTable(model, rm, 240)?.source).toBe('borrow')
  })

  it('同じ長さの表がある長さ（150h）の予定の回には焼かない', () => {
    const { past, shapes, now } = fixture()
    const { model } = fitModel([...past, upcoming(300, 150, 5, now), upcoming(301, 198, 12, now)], shapes, now)
    expect(keys(model)).toEqual([])
    expect(chooseTable(model, model.ranks['1000'], 150)?.extrapolatedFrom).toBeNull()
  })

  it('標本1〜2件の長さ（102h）の予定の回: thin の表を、率モデルの表に直近の回を混ぜたものと幾何平均する。rate:102 は焼かない', () => {
    const { past, shapes, hist, now } = fixture()
    const u102 = upcoming(300, 102, 5, now)
    const { model } = fitModel([...past, u102], shapes, now)
    const plain = fitModel(past, shapes, now).model
    expect(keys(model)).toEqual([])
    for (const rank of RANKS) {
      const latest = hist[9].shapes.get(rank) as Shape
      // 予定の回を渡さない版の thin（5桁に丸め済み。丸め誤差は 1e-5 未満）
      const thinBefore = plain.ranks[String(rank)].tables['thin:102']
      const expected = geoMean(thinBefore, thinTable(latest.share, rateTableOf(hist, rank, u102), THIN_WEIGHT))
      const got = model.ranks[String(rank)].tables['thin:102']
      got.forEach((v, i) => expect(v as number).toBeCloseTo(expected[i] as number, 4))
      // 率モデルの表が混ざって、混ぜる前とは違う表になっている
      expect(got).not.toEqual(thinBefore)
      // 範囲の内側の thin（171h）は予定が無いので変わらない
      expect(model.ranks[String(rank)].tables['thin:171']).toEqual(plain.ranks[String(rank)].tables['thin:171'])
    }
    const choice = chooseTable(model, model.ranks['1000'], 102)
    expect(choice?.table).toBe(model.ranks['1000'].tables['thin:102'])
    expect(choice?.thin?.duration).toBe(102)
    // 率モデルが混ざっても、文面は「同じ長さの回が少ない」（#175）
    expect(choice?.source).toBe('thin')
  })

  it('同じ長さの予定の回が複数あれば、いちばん早く始まる回の日程を使う', () => {
    const { past, shapes, hist, now } = fixture()
    // 開始時刻の時刻（JST の時）が違う2つ。後に始まる回を先に並べても、早い回が使われる
    const late = upcoming(301, 246, 30, now)
    const earlyMeta = marathon(300, now + 5 * DAY + 2 * H, 246)
    const { model } = fitModel([...past, late, earlyMeta], shapes, now)
    const rank = 1000
    const farLong = candidateTable('same_all', 198, hist, rank)
    expect(model.ranks['1000'].tables[rateKey(246)]).toEqual(round5(geoMean(farLong, rateTableOf(hist, rank, earlyMeta))))
    expect(model.ranks['1000'].tables[rateKey(246)]).not.toEqual(round5(geoMean(farLong, rateTableOf(hist, rank, late))))
  })

  it('終わった回（形が無くても）やマラソン以外のイベントは、予定の回として扱わない', () => {
    const { past, shapes, now } = fixture()
    // 形の無い終わった 126h のマラソン、これから始まる 77h のイベント（マラソンではない）
    const noShape = marathon(299, Date.UTC(2025, 11, 1), 126)
    const other = upcoming(300, 77, 5, now, 'cheerful_carnival')
    const { model } = fitModel([...past, noShape, other], shapes, now)
    expect(keys(model)).toEqual([])
  })

  it('予定の回の長さ・日程が変われば版名も変わる（rate: の表が版のハッシュに入る）', () => {
    const { past, shapes, now } = fixture()
    const a = fitModel(past, shapes, now).model.version
    const b = fitModel([...past, upcoming(300, 246, 5, now)], shapes, now).model.version
    const c = fitModel([...past, upcoming(300, 246, 5, now)], shapes, now).model.version
    expect(b).not.toBe(a)
    expect(c).toBe(b)
  })
})
