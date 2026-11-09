import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import type { EventMeta } from '../../workers/border/src/model.ts'
import { formatMan } from '../../workers/border/src/posts.ts'
import { REPORT_CHECKPOINTS, buildReport, resultRanks, type PredictionLog, type Report } from './report.ts'

const H = 3_600_000
const SUMMARY = { ranks: [] } as unknown as ModelSummary
const EVENT: EventMeta = { id: 1, name: 'テストの回', eventType: 'marathon', unit: 'none', startAt: 0, aggregateAt: 100 * H - 1000 }

const log = (progress: number, predicted: number, over: Partial<PredictionLog> = {}): PredictionLog => ({
  event_id: 1,
  rank: 1000,
  ts: Math.round(progress * 100 * H),
  model_version: 'v',
  progress,
  current: 0,
  share: 0,
  predicted,
  low: predicted - 10,
  high: predicted + 10,
  visible: 1,
  ...over,
})
const finals = new Map([['1:1000', 1000]])
const at = (rep: Report, c: number) => rep.ranks[0].prospective.find((p) => p.checkpoint === c)

describe('答え合わせの時点の選び方（buildReport）', () => {
  it('各時点 c で「経過 c 以上の最初の予測」を使う（Worker が節目の投稿に使ったのと同じ行）', () => {
    // 0.849 は越える手前、0.851 が越えた最初、0.853 は 0.855 の幅に入る次の行（直す前はこれを選んでいた）
    const rep = buildReport(EVENT, finals, [log(0.84, 1), log(0.849, 2), log(0.851, 3), log(0.853, 4), log(0.9, 5)], SUMMARY, 0)
    expect(at(rep, 0.85)).toMatchObject({ progress: 0.851, predicted: 3 })
  })
  it('ちょうど c の予測は「越えた」に入る（Worker の snap.progress >= at と同じ）', () => {
    const rep = buildReport(EVENT, finals, [log(0.84, 1), log(0.85, 2), log(0.851, 3)], SUMMARY, 0)
    expect(at(rep, 0.85)?.predicted).toBe(2)
  })
  it('並びが ts の順でなくても、ts の順に並べてから選ぶ', () => {
    const rep = buildReport(EVENT, finals, [log(0.853, 4), log(0.851, 3), log(0.849, 2)], SUMMARY, 0)
    expect(at(rep, 0.85)?.predicted).toBe(3)
  })
  it('越えた最初の予測が c から 0.08 より後なら、その時点の予測は無い', () => {
    expect(at(buildReport(EVENT, finals, [log(0.84, 1), log(0.931, 2)], SUMMARY, 0), 0.85)).toBeUndefined()
    expect(at(buildReport(EVENT, finals, [log(0.84, 1), log(0.929, 2)], SUMMARY, 0), 0.85)?.predicted).toBe(2)
  })
  it('c を越えた予測が無ければ、その時点の予測は無い（手前の予測では代えない）', () => {
    expect(at(buildReport(EVENT, finals, [log(0.8, 1), log(0.849, 2)], SUMMARY, 0), 0.85)).toBeUndefined()
  })
  it('0.5・0.7・0.85・0.95 のすべてに同じ決まりを使う', () => {
    expect(REPORT_CHECKPOINTS).toEqual([0.5, 0.7, 0.85, 0.95])
    const rows = [0.499, 0.501, 0.503, 0.699, 0.701, 0.703, 0.849, 0.851, 0.853, 0.949, 0.951, 0.953].map((p, i) => log(p, i))
    const rep = buildReport(EVENT, finals, rows, SUMMARY, 0)
    expect(rep.ranks[0].prospective.map((p) => [p.checkpoint, p.progress])).toEqual([
      [0.5, 0.501],
      [0.7, 0.701],
      [0.85, 0.851],
      [0.95, 0.951],
    ])
  })
  it('経過が数でない行は使わない（Worker の応答は型を確かめてから使う）', () => {
    // 文字列の '0.850' は比べると 0.85 に化けて「越えた」に入ってしまう
    const bad = { ...log(0.85, 9), progress: '0.850' } as unknown as PredictionLog
    const rep = buildReport(EVENT, finals, [log(0.84, 1), bad, log(0.851, 3)], SUMMARY, 0)
    expect(at(rep, 0.85)?.predicted).toBe(3)
  })
})

describe('答え合わせの代表の値（resultRanks）', () => {
  it('経過85% の予測を使い、見せていない順位は出さない', () => {
    const rep = buildReport(
      EVENT,
      new Map([
        ['1:1000', 1000],
        ['1:2000', 500],
      ]),
      [log(0.851, 1250), log(0.95, 1200), log(0.851, 600, { rank: 2000, visible: 0 })],
      SUMMARY,
      0,
    )
    expect(resultRanks(rep)).toEqual([{ rank: 1000, final: 1000, predicted: 1250, progress: 0.851, error: 0.25, inBand: false, low: 1240, high: 1260 }])
  })
  it('経過85% の予測が無ければ、最後の時点の予測を使う', () => {
    const rep = buildReport(EVENT, finals, [log(0.5, 900), log(0.7, 950)], SUMMARY, 0)
    expect(resultRanks(rep).map((r) => [r.progress, r.predicted])).toEqual([[0.7, 950]])
  })
})

/**
 * 公開の推移から切り出した 219〜223 の実データ（scripts/border/testdata/checkpoint-history.json）。
 * 2026-11-09 に、X の経過85% の予測と答え合わせの値が 5 回中 3 回でずれていた（219・220・223）。経過50% も同じ 3 回でずれていた
 */
interface FixtureEvent {
  id: number
  name: string
  startAt: number
  aggregateAt: number
  finals: Record<string, number>
  rows: [number, number, [number, number, number | null, number | null, number | null, number][]][]
}
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'testdata', 'checkpoint-history.json'), 'utf8')) as { events: FixtureEvent[] }

/** 推移の行を予測ログの行にする（値は予測ログと同じ。順位ごとの ts の違いは無いものとする） */
const logsOf = (e: FixtureEvent): PredictionLog[] =>
  e.rows.flatMap(([ts, progress, ranks]) =>
    ranks.flatMap(([rank, current, predicted, low, high, visible]) =>
      predicted == null ? [] : [{ event_id: e.id, rank, ts, model_version: 'history', progress, current, share: 0, predicted, low, high, visible }],
    ),
  )

/** Worker が節目の投稿に使う行（collect.ts: 前の行の経過 < c ≤ この行の経過、の最初） */
const postedRow = (e: FixtureEvent, c: number) => e.rows.find((r, i) => r[1] >= c && (i === 0 || e.rows[i - 1][1] < c))

/**
 * 実際に出した投稿の値。経過85% の 3 回は X の投稿の数字（万に丸めた値。2026-11-09 に指揮が投稿と照合）、
 * 経過・1000位の値は投稿に使った行（collect.ts の決まり）。経過50% は投稿の時刻とも合う（219 は 10/5 18:16 に投稿、使った行は 18:03 ごろ）
 */
const POSTED: Record<number, Record<number, { progress: number; r1000: number; man?: Record<number, string> }>> = {
  219: {
    0.5: { progress: 0.50017, r1000: 15_947_439 },
    0.85: { progress: 0.85177, r1000: 15_584_894, man: { 1000: '1,558万', 2000: '904万', 500: '2,038万' } },
  },
  220: {
    0.5: { progress: 0.50024, r1000: 8_160_737 },
    0.85: { progress: 0.85078, r1000: 8_112_225, man: { 1000: '811万', 2000: '457万', 500: '1,037万' } },
  },
  221: { 0.5: { progress: 0.50041, r1000: 17_779_011 }, 0.85: { progress: 0.8533, r1000: 20_747_574 } },
  222: { 0.5: { progress: 0.50041, r1000: 13_079_551 }, 0.85: { progress: 0.8533, r1000: 13_866_555 } },
  223: {
    0.5: { progress: 0.50021, r1000: 21_776_341 },
    0.85: { progress: 0.85119, r1000: 21_229_404, man: { 1000: '2,123万', 2000: '856万', 500: '2,933万' } },
  },
}

describe('過去の実データ（219〜223）で、答え合わせが投稿した予測と同じ値になる', () => {
  it('フィクスチャに 5 回がそろっている', () => {
    expect(fixture.events.map((e) => e.id)).toEqual([219, 220, 221, 222, 223])
  })
  for (const e of fixture.events) {
    const meta: EventMeta = { id: e.id, name: e.name, eventType: 'marathon', unit: 'none', startAt: e.startAt, aggregateAt: e.aggregateAt }
    const report = buildReport(meta, new Map(Object.entries(e.finals).map(([r, v]) => [`${e.id}:${r}`, v])), logsOf(e), SUMMARY, 0)
    for (const c of [0.5, 0.85]) {
      it(`${e.id} ${e.name}: 経過${c * 100}% の全順位が、投稿に使った行の予測`, () => {
        const want = POSTED[e.id][c]
        const row = postedRow(e, c)
        expect(row?.[1]).toBeCloseTo(want.progress, 5)
        for (const r of report.ranks) {
          const p = r.prospective.find((x) => x.checkpoint === c)
          const posted = row?.[2].find((x) => x[0] === r.rank)
          expect(p?.progress, `${r.rank}位`).toBeCloseTo(want.progress, 5)
          expect(p?.predicted, `${r.rank}位`).toBe(posted?.[2])
        }
        const r1000 = report.ranks.find((r) => r.rank === 1000)?.prospective.find((x) => x.checkpoint === c)
        expect(r1000?.predicted).toBe(want.r1000)
        for (const [rank, man] of Object.entries(want.man ?? {})) {
          const p = report.ranks.find((r) => r.rank === Number(rank))?.prospective.find((x) => x.checkpoint === c)
          expect(formatMan(p?.predicted ?? NaN), `${rank}位`).toBe(man)
        }
      })
    }
    it(`${e.id}: X とサイトの答え合わせの予測（resultRanks）が、経過85% の投稿と同じ`, () => {
      const row = postedRow(e, 0.85)
      for (const r of resultRanks(report)) expect(r.predicted, `${r.rank}位`).toBe(row?.[2].find((x) => x[0] === r.rank)?.[2])
      expect(resultRanks(report)).toHaveLength(6)
    })
  }
})
