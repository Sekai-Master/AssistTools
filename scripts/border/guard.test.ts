import { describe, expect, it } from 'vitest'
import type { ModelSummary, RankSummary } from '../../workers/border/src/fit.ts'
import { GRID, RANKS, type Model, type RankModel } from '../../workers/border/src/model.ts'
import { checkModel, scoreboard, scoreboardLines } from './guard.ts'
import type { ProspectiveScore, Report } from './report.ts'

// ---- 模型の部品（正常な値）-------------------------------------------------

/** 正常なシェア表: 経過率の 0.9 乗（0 は欠測）。単調に増え、最後は 1 */
const healthyTable = (): (number | null)[] => GRID.map((p) => (p === 0 ? null : p ** 0.9))

/** 経過 4〜96% に幅 0.2 の帯を持つ（それ以外は null） */
const healthyBand = () => ({
  lo: GRID.map((p) => (p >= 0.04 && p <= 0.96 ? -0.1 : null)),
  hi: GRID.map((p) => (p >= 0.04 && p <= 0.96 ? 0.1 : null)),
})

function rankModel(): RankModel {
  return { candidate: 'same_all', minProgress: 0.04, tables: { '150': healthyTable(), '174': healthyTable(), all: healthyTable() }, band: healthyBand() }
}

function makeModel(edit?: (ranks: Record<string, RankModel>) => void): Model {
  const ranks: Record<string, RankModel> = {}
  for (const r of RANKS) ranks[String(r)] = rankModel()
  edit?.(ranks)
  return { version: 'share-median-v1@e300-new', createdAt: '2026-10-28T00:00:00Z', algorithm: 'share-median-v1', grid: [...GRID], ranks, knownDurations: [150, 174] }
}

/** 当たり率 85%（17/20）・|誤差|中央 mae の要約 */
function rankSummary(rank: number, mae = 0.05, covered = 17, total = 20): RankSummary {
  return {
    rank,
    champion: 'same_all',
    rolling: { same_all: null, same_recent8: null, all_recent12: null, same_all_debias5: null },
    evaluated: 30,
    minProgress: 0.04,
    medianAbsError: [0.5, 0.6, 0.7, 0.8, 0.9, 0.96].map((p) => ({ p, value: mae })),
    band: [],
    bandTail: 0.1,
    coverage: [{ p: 0.5, covered, total }],
    medianAbsErrorEarly: [],
    bandEarly: [],
    bandTailEarly: 0.1,
    coverageEarly: [{ p: 0.08, covered, total }],
    replay: [],
  }
}

function makeSummary(version: string, maeByRank: Record<number, number> = {}): ModelSummary {
  return {
    version,
    algorithm: 'share-median-v1',
    createdAt: '2026-10-28T00:00:00Z',
    trainedThrough: 300,
    poolSize: 100,
    durations: [150, 174],
    targetCoverage: 0.8,
    ranks: RANKS.map((r) => rankSummary(r, maeByRank[r] ?? 0.05)),
  }
}

const active = makeSummary('share-median-v1@e299-old')
/** 指定した順位だけ |誤差| を k 倍にした新しい版の要約 */
const scaled = (k: number, ranks: number[]) => makeSummary('share-median-v1@e300-new', Object.fromEntries(ranks.map((r) => [r, 0.05 * k])))

describe('関所 checkModel', () => {
  it('正常な版は通る（有効な版との比べもある）', () => {
    const res = checkModel(makeModel(), makeSummary('share-median-v1@e300-new', { 50: 0.055, 100: 0.045 }), active)
    expect(res.problems).toEqual([])
    expect(res.ok).toBe(true)
    expect(res.notes.join('\n')).toContain('1.10')
  })

  it('順位や長さの表が欠けていれば止める', () => {
    expect(checkModel(makeModel((r) => delete r['500']), makeSummary('x'), null).problems.join()).toContain('500位')
    const noTable = makeModel((r) => delete r['100'].tables['174'])
    expect(checkModel(noTable, makeSummary('x'), null).problems.join()).toContain('174h')
  })

  it('表に NaN や 1.05 超があれば止める', () => {
    const nan = makeModel((r) => (r['50'].tables['150'][20] = NaN))
    expect(checkModel(nan, makeSummary('x'), null).ok).toBe(false)
    const big = makeModel((r) => (r['200'].tables.all[30] = 1.06))
    const res = checkModel(big, makeSummary('x'), null)
    expect(res.ok).toBe(false)
    expect(res.problems.join()).toContain('200位')
    // 1.05 ちょうどは通る
    expect(checkModel(makeModel((r) => (r['200'].tables.all[50] = 1.05)), makeSummary('x'), null).ok).toBe(true)
    // 経過 0% の 0 は正常（率モデルを混ぜた表がそう焼く）。ほかの点の 0 や負は壊れ
    expect(checkModel(makeModel((r) => (r['50'].tables['150'][0] = 0)), makeSummary('x'), null).ok).toBe(true)
    expect(checkModel(makeModel((r) => (r['50'].tables['150'][5] = 0)), makeSummary('x'), null).ok).toBe(false)
    expect(checkModel(makeModel((r) => (r['50'].tables['150'][0] = -0.01)), makeSummary('x'), null).ok).toBe(false)
  })

  it('隣との段差は -0.06 で止め、-0.03 は通す', () => {
    const drop = (d: number) =>
      makeModel((r) => {
        const t = r['1000'].tables['150']
        t[30] = (t[29] as number) + d
      })
    // 29→30 の段差を d にする（そのあとの 30→31 は元の傾きより上がるので問題にならない）
    expect(checkModel(drop(-0.06), makeSummary('x'), null).ok).toBe(false)
    expect(checkModel(drop(-0.03), makeSummary('x'), null).ok).toBe(true)
  })

  it('帯の下が上より大きければ止める', () => {
    const inverted = makeModel((r) => {
      r['500'].band.lo[25] = 0.2
      r['500'].band.hi[25] = 0.1
    })
    const res = checkModel(inverted, makeSummary('x'), null)
    expect(res.ok).toBe(false)
    expect(res.problems.join()).toContain('逆')
  })

  it('帯が少ない・広すぎる順位は止める', () => {
    const wide = makeModel((r) => {
      r['2000'].band.lo = GRID.map(() => -0.5)
      r['2000'].band.hi = GRID.map(() => 0.5)
    })
    expect(checkModel(wide, makeSummary('x'), null).ok).toBe(false)
    const none = makeModel((r) => {
      r['50'].band.lo = GRID.map(() => null)
      r['50'].band.hi = GRID.map(() => null)
    })
    expect(checkModel(none, makeSummary('x'), null).ok).toBe(false)
  })

  it('全体の当たり率が 0.6 なら止める（標本が少なければ見ない）', () => {
    const low = makeSummary('x')
    low.ranks[2] = rankSummary(200, 0.05, 12, 20) // 前後合わせて 24/40 = 0.6
    const res = checkModel(makeModel(), low, null)
    expect(res.ok).toBe(false)
    expect(res.problems.join()).toContain('200位')
    const few = makeSummary('x')
    few.ranks[2] = rankSummary(200, 0.05, 6, 10) // 12/20 は標本が 30 未満
    expect(checkModel(makeModel(), few, null).ok).toBe(true)
    const high = makeSummary('x')
    high.ranks[0] = rankSummary(50, 0.05, 20, 20) // 100%
    expect(checkModel(makeModel(), high, null).ok).toBe(false)
  })

  it('|誤差|中央が経過 50% で 0.2、90% で 0.1 を超えれば止める', () => {
    const s = makeSummary('x')
    s.ranks[1].medianAbsError = s.ranks[1].medianAbsError.map((x) => (x.p === 0.5 ? { ...x, value: 0.25 } : x))
    expect(checkModel(makeModel(), s, null).ok).toBe(false)
    const t = makeSummary('x')
    t.ranks[1].medianAbsError = t.ranks[1].medianAbsError.map((x) => (x.p === 0.9 ? { ...x, value: 0.11 } : x))
    expect(checkModel(makeModel(), t, null).ok).toBe(false)
  })

  it('1順位でも有効な版の 1.7 倍悪ければ止める', () => {
    const res = checkModel(makeModel(), scaled(1.7, [100]), active)
    expect(res.ok).toBe(false)
    expect(res.problems.join()).toContain('100位')
  })

  it('2順位が 1.35 倍なら通る（比は補足に出る）。3順位なら止める', () => {
    const two = checkModel(makeModel(), scaled(1.35, [50, 100]), active)
    expect(two.ok).toBe(true)
    expect(two.notes.join()).toContain('1.35')
    const three = checkModel(makeModel(), scaled(1.35, [50, 100, 200]), active)
    expect(three.ok).toBe(false)
    expect(three.problems.join()).toContain('3 順位')
  })

  it('有効な版が無い・同じ版なら比べず、補足だけ残す', () => {
    // 比べれば止まる悪化（1.9 倍）。比べなければ、要約の絶対値（経過 90% で 0.095 ≤ 0.1）は通る
    const bad = scaled(1.9, [50, 100, 200])
    expect(checkModel(makeModel(), bad, active).ok).toBe(false)
    const none = checkModel(makeModel(), bad, null)
    expect(none.ok).toBe(true)
    expect(none.notes.length).toBe(1)
    const same = checkModel(makeModel(), bad, { ...active, version: bad.version })
    expect(same.ok).toBe(true)
    expect(same.notes.length).toBe(1)
  })
})

// ---- 見張り ----------------------------------------------------------------

const DAY = 86_400_000

interface Opts {
  /** 帯に入った数（4つのチェックポイント × 順位数のうち） */
  hit?: number
  /** 本番の |誤差| */
  served?: number
  /** 再現の |誤差| */
  replay?: number
  ranks?: number
}

/** 6順位 × 4時点 = 24 点の回。hit 点が帯に入る */
function report(id: number, o: Opts = {}): Report {
  const { hit = 20, served = 0.04, replay = 0.04, ranks = 6 } = o
  let n = 0
  return {
    eventId: id,
    name: `イベント${id}`,
    unit: 'none',
    durationHours: 150,
    startAt: id * DAY,
    aggregateAt: id * DAY + 6 * DAY,
    generatedAt: '2026-10-28T00:00:00Z',
    modelVersions: ['share-median-v1@e1-aaaa'],
    ranks: RANKS.slice(0, ranks).map((rank) => ({
      rank,
      final: 1_000_000,
      prospective: ([0.5, 0.7, 0.85, 0.95] as const).map((c): ProspectiveScore => {
        const inBand = n++ < hit
        return { checkpoint: c, progress: c, modelVersion: 'share-median-v1@e1-aaaa', predicted: 1_000_000 * (1 + served), low: null, high: null, error: served, inBand, visible: true }
      }),
      replay: [0.5, 0.6, 0.7, 0.8, 0.9, 0.96].map((p) => ({ p, error: replay })),
    })),
  }
}

/** 同じ成績の回を id 昇順に n 回 */
const events = (n: number, o: Opts = {}) => Array.from({ length: n }, (_, i) => report(100 + i, o))

describe('見張り scoreboard', () => {
  it('健全な成績は警告なし。表は新しい順', () => {
    const sb = scoreboard(events(8, { hit: 20 }))
    expect(sb.alarms).toEqual([])
    expect(sb.rows.length).toBe(8)
    expect(sb.rows[0].eventId).toBe(107)
    expect(sb.points).toBe(8 * 24)
    expect(sb.coverage).toBeCloseTo(20 / 24, 6)
    expect(sb.overfitPairs).toBe(8 * 6 * 2)
    expect(sb.overfitRatio).toBeCloseTo(1, 6)
    expect(sb.notes.join()).toContain('1.00')
    const lines = scoreboardLines(sb)
    expect(lines.some((l) => l.startsWith('| 回 | 長さ | 版 | 点 | 当たり率 | 外れ幅の中央値 |'))).toBe(true)
    expect(lines.filter((l) => l.startsWith('| 107 ')).length).toBe(1)
    expect(lines.some((l) => l.startsWith('- 直近 8 回の当たり率: 83.3%'))).toBe(true)
  })

  it('直近の回数だけを見る。点が無い回・帯の無い点は数えない', () => {
    const none: Report = { ...report(500), ranks: report(500).ranks.map((r) => ({ ...r, prospective: r.prospective.map((e) => ({ ...e, inBand: null })) })) }
    const hidden: Report = { ...report(501), ranks: report(501).ranks.map((r) => ({ ...r, prospective: r.prospective.map((e) => ({ ...e, visible: false })) })) }
    const sb = scoreboard([...events(10), none, hidden], 8)
    expect(sb.rows.map((r) => r.eventId)).toEqual([109, 108, 107, 106, 105, 104, 103, 102])
  })

  it('全体の当たり率が 0.65 未満（60 点以上）なら警告。点が少なければ出さない', () => {
    // 24 点 × 3 回 = 72 点、当たり 14/24 = 58%。回ごとは 50% 以上なので「続けて低い」は出ない
    const sb = scoreboard(events(3, { hit: 14 }))
    expect(sb.coverage).toBeCloseTo(14 / 24, 6)
    expect(sb.alarms.length).toBe(1)
    expect(sb.alarms[0]).toContain('当たり率')
    // 12 点 × 4 回 = 48 点 < 60 は出さない（当たり 8/12 = 67% で、回ごとも低くない）
    expect(scoreboard(events(4, { hit: 8, ranks: 3 })).alarms).toEqual([])
  })

  it('直近3回が続けて当たり率 5割未満（各6点以上）なら警告', () => {
    const old = events(5, { hit: 22 })
    const low = [report(200, { hit: 8 }), report(201, { hit: 8 }), report(202, { hit: 8 })]
    const sb = scoreboard([...old, ...low])
    // 全体は (5×22 + 3×8) / (8×24) = 134/192 = 70% で、全体の警告は出ない
    expect(sb.alarms.length).toBe(1)
    expect(sb.alarms[0]).toContain('202・201・200')
    // 3回目が高ければ出ない
    expect(scoreboard([...old, report(200, { hit: 8 }), report(201, { hit: 8 }), report(202, { hit: 20 })]).alarms).toEqual([])
    // 点が 6 未満の回（1順位 × 4時点 = 4 点）が続いても、当たり率を信じないので出ない
    expect(scoreboard([...old, report(200, { hit: 1, ranks: 1 }), report(201, { hit: 1, ranks: 1 }), report(202, { hit: 1, ranks: 1 })]).alarms).toEqual([])
  })

  it('本番の外れ幅が再現の 1.5 倍超（30 組以上）なら過学習の警告', () => {
    const sb = scoreboard(events(3, { served: 0.09, replay: 0.04 })) // 3 × 6 × 2 = 36 組、比 2.25
    expect(sb.overfitPairs).toBe(36)
    expect(sb.overfitRatio).toBeCloseTo(2.25, 6)
    expect(sb.alarms.length).toBe(1)
    expect(sb.alarms[0]).toContain('過学習')
    expect(sb.alarms[0]).toContain('2.25')
    // 組が 30 未満なら比は出るが警告は出ない
    const few = scoreboard(events(2, { served: 0.09, replay: 0.04 })) // 24 組
    expect(few.overfitRatio).toBeCloseTo(2.25, 6)
    expect(few.alarms).toEqual([])
    // 組が 10 未満なら比も出さない
    const tiny = scoreboard([report(100, { served: 0.09, replay: 0.04, ranks: 1 })]) // 2 組
    expect(tiny.overfitRatio).toBeNull()
    expect(tiny.notes.join()).toContain('足りない')
    // 再現が 0 なら比は出さない
    expect(scoreboard(events(3, { served: 0.09, replay: 0 })).overfitRatio).toBeNull()
  })

  it('レポートが無ければ空の表と補足だけ', () => {
    const sb = scoreboard([])
    expect(sb.rows).toEqual([])
    expect(sb.coverage).toBeNull()
    expect(sb.alarms).toEqual([])
    expect(scoreboardLines(sb).some((l) => l.includes('-（0 点）'))).toBe(true)
  })
})
