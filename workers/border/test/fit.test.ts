import { describe, expect, it } from 'vitest'
import {
  BAND_TAILS,
  BLEND_MIN_EVENTS,
  BLEND_SWITCH_POINTS,
  TARGET_COVERAGE,
  blendErrors,
  blendTable,
  chooseTail,
  coverageOf,
  earlyBlended,
  fitModel,
  fnv1a,
  thinTable,
  walkEarlyBlend,
} from '../src/fit.ts'
import {
  CANDIDATES,
  GRID,
  RANKS,
  THIN_WEIGHT,
  candidateTable,
  chooseTable,
  durationHours,
  median,
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
    const base = candidateTable(rm.candidate, 150, hist, 1000)
    const blend = blendTable(150, hist, 1000)
    const i = GRID.indexOf(0.1)
    const j = GRID.indexOf(0.6)
    expect(rm.tables['150'][i]).toBeCloseTo(blend[i] as number, 4)
    expect(rm.tables['150'][i]).not.toBeCloseTo(base[i] as number, 3)
    expect(rm.tables['150'][j]).toBeCloseTo(base[j] as number, 4)
    // 学習に無い長さ用の表は、当てる回の長さがわからないので差し替えない
    const round = (t: (number | null)[]) => t.map((v) => (v == null ? null : Math.round(v * 1e5) / 1e5))
    expect(rm.tables.all).toEqual(round(candidateTable(rm.candidate, -1, hist, 1000)))
  })

  it('序盤の誤差の要約は、各回をその時点の切り替え点で差し替えた誤差で作る（最後の切り替え点を過去に遡って当てない）', () => {
    const { summary, hist } = fitFrom(historyOf(DURATIONS.map((hours) => ({ hours, f: byElapsed(hours) }))))
    const r = summary.ranks.find((x) => x.rank === 1000)
    const walk = walkForward(hist, 1000)
    const blend = blendErrors(hist, 1000, walk.evals)
    const early = walkEarlyBlend(walk.evals, blend)
    const i = GRID.indexOf(0.08)
    const errsAt = (at: (k: number) => number | null) =>
      walk.evals
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
    // 全部同じ長さ・同じ形なら blend と現行は同じ値になり、5% 以上の差がつかない
    const { model, summary, hist } = fitFrom(historyOf(DURATIONS.map(() => ({ hours: 150, f: byElapsed(150) }))))
    const rm = model.ranks['1000']
    expect(summary.ranks.find((r) => r.rank === 1000)?.earlyBlend?.switchAt).toBeNull()
    expect(rm.earlyBlendUntil).toBeUndefined()
    const base = candidateTable(rm.candidate, 150, hist, 1000)
    expect(rm.tables['150']).toEqual(base.map((v) => (v == null ? null : Math.round(v * 1e5) / 1e5)))
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
