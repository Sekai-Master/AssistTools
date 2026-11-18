/**
 * みんなでライブ停止中の回の特別モデル（workers/border/src/special.ts）を、過去の回で当て直す（壊れていないかの確かめだけ。2026-11-19）。
 *
 *   node scripts/border/research/special-backtest.ts --series <dir> [--master <events.json>] [--targets 221,222,223,225]
 *
 * - 当てる回ごとに「その回の開始前に終わった回だけ」で、ふだんのモデル（本番の fitModel）と特別モデルの曲線（同じ fitModel が焼く model.special）を作る
 * - 30分刻みの実測（--series の {回}_{順位}.json = [[時刻ms, 値], ...]。解析ジョブの --series-cache と同じ形）を1点ずつ当てる。
 *   特別モデルの窓の始まり（24時間前）も同じ実測から引く（Worker が D1 の samples から引くのと同じ）
 * - 形（51点）は pace-seed.json（〜221回）を使い、無い回は --series から作る。日程は events-meta.json、無い回は --master（マスタの events.json）
 * - 比べるもの: ふだんのモデル（prod）と、特別モデルの点の重み w（点 = F_spurt^w × F_flat^(1−w)）が 0.5（既定・幾何平均）・0.75・1.0（追い込みありの水準そのもの）の3通り。
 *   帯は w で変わらないので、当たり率は特別モデルで1つ。
 *   区間（序盤 4〜28%・中盤 30〜58%・終盤 60〜96%）ごとに、表に出した点の |誤差| の中央値・誤差の平均（符号つき）・帯の当たり率。順位で平均してから回で並べる
 * ★ 過去の回はどれもみんなでライブのある回。ここで分かるのは「壊れていない」「帯がふだんより狭くない」ことだけで、
 *   ひとりでライブだけの回の当たり外れは確かめようがない。数字に合わせて窓や m を調整しない（指示書 2026-11-19）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fitModel } from '../../../workers/border/src/fit.ts'
import { RANKS, buildShape, eventEndMs, median, predict, progressAt, type EventMeta, type HistoryEvent, type Model, type Prediction, type Sample, type Shape } from '../../../workers/border/src/model.ts'
import { predictSpecial, specialAnchorRange, specialSelection } from '../../../workers/border/src/special.ts'
import { fitInputs, historyBefore, loadHistory, META } from './data.ts'

const args = process.argv.slice(2)
const opt = (k: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : undefined
}
const seriesDir = opt('--series')
if (!seriesDir) throw new Error('--series <dir> が要る')
const master = opt('--master')
const targets = (opt('--targets') ?? '221,222,223,225').split(',').map(Number)

const masterMeta = new Map<number, EventMeta>()
if (master) {
  for (const e of JSON.parse(fs.readFileSync(master, 'utf8')) as Record<string, unknown>[]) {
    if (typeof e.id !== 'number' || e.eventType !== 'marathon') continue
    masterMeta.set(e.id, { id: e.id, name: String(e.name), eventType: 'marathon', unit: String(e.unit ?? 'none'), startAt: e.startAt as number, aggregateAt: e.aggregateAt as number })
  }
}
const metaOf = (id: number) => META.get(id) ?? masterMeta.get(id) ?? null
const seriesOf = (id: number, rank: number): Sample[] | null => {
  const f = path.join(seriesDir, `${id}_${rank}.json`)
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Sample[]) : null
}

// 形: pace-seed（〜221）に、--series から作った回（222 以降など）を足す
const all: HistoryEvent[] = loadHistory('new')
const have = new Set(all.map((h) => h.meta.id))
for (const id of [...masterMeta.keys()].filter((x) => x > 124 && !have.has(x)).sort((a, b) => a - b)) {
  const meta = metaOf(id)
  if (!meta) continue
  const shapes = new Map<number, Shape>()
  for (const rank of RANKS) {
    const s = seriesOf(id, rank)
    const shape = s ? buildShape(meta, rank, s) : null
    if (shape) shapes.set(rank, shape)
  }
  if (shapes.size > 0) all.push({ meta, shapes })
}
all.sort((a, b) => a.meta.startAt - b.meta.startAt)

/** 特別モデルの点の重み w の候補（2026-11-19 指揮。決めるのは指揮） */
const WEIGHTS = [0.5, 0.75, 1] as const
const METHODS = ['prod', 'w0.5', 'w0.75', 'w1'] as const
type Method = (typeof METHODS)[number]
const REGIONS = [
  { name: '序盤', from: 0.04, to: 0.28 },
  { name: '中盤', from: 0.3, to: 0.58 },
  { name: '終盤', from: 0.6, to: 0.96 },
] as const
interface Pt {
  p: number
  err: number
  inBand: boolean | null
}

const H = 3_600_000
const rows: { id: number; hours: number; method: Method; region: string; mae: number | null; bias: number | null; cov: number | null; n: number }[] = []

for (const id of targets) {
  const target = all.find((h) => h.meta.id === id)
  if (!target) {
    console.warn(`${id}: 形が無い`)
    continue
  }
  const meta = target.meta
  const train = historyBefore(all, meta)
  const { events, shapes } = fitInputs(train)
  // 本番の解析ジョブと同じく、当てる回も日程に入れて渡す（学習には入らない）。特別モデルの一覧にこの回だけを入れて曲線を焼く
  const prod = fitModel([...events, meta], shapes, meta.startAt - 1, { specialEvents: [] }).model
  const withSpecial: Model = { ...prod, special: fitModel([...events, meta], shapes, meta.startAt - 1, { specialEvents: [meta.id] }).model.special }
  const sel = specialSelection(withSpecial, meta)
  if (!sel) throw new Error(`${id}: 特別モデルの曲線が焼けない`)
  const byWeight = WEIGHTS.map((w) => ({ ...sel, params: { ...sel.params, spurtWeight: w } }))
  const perMethod = Object.fromEntries(METHODS.map((m) => [m, new Map<string, number[][]>()])) as Record<Method, Map<string, number[][]>>
  for (const rank of RANKS) {
    const series = seriesOf(id, rank)
    const final = target.shapes.get(rank)?.final
    if (!series || !final) continue
    const pts = Object.fromEntries(METHODS.map((m) => [m, [] as Pt[]])) as Record<Method, Pt[]>
    for (const [ts, v] of series) {
      if (ts > meta.aggregateAt) continue
      const p = progressAt(meta, ts)
      if (p < 0.04 || p > 0.96 || !(v > 0)) continue
      const range = specialAnchorRange(meta, sel.params, ts)
      const nearby = range ? series.filter(([t]) => t >= range[0] && t <= range[1] && t < ts) : []
      const preds: Record<Method, Prediction | null> = {
        prod: predict(prod, meta, rank, v, ts),
        'w0.5': predictSpecial(withSpecial, byWeight[0], meta, rank, v, ts, nearby),
        'w0.75': predictSpecial(withSpecial, byWeight[1], meta, rank, v, ts, nearby),
        w1: predictSpecial(withSpecial, byWeight[2], meta, rank, v, ts, nearby),
      }
      for (const m of METHODS) {
        const pr = preds[m]
        if (!pr || !pr.visible) continue
        pts[m].push({ p, err: pr.predicted / final - 1, inBand: pr.low == null || pr.high == null ? null : final >= pr.low && final <= pr.high })
      }
    }
    for (const m of METHODS) {
      for (const r of REGIONS) {
        const xs = pts[m].filter((x) => x.p >= r.from - 1e-9 && x.p <= r.to + 1e-9)
        if (xs.length === 0) continue
        const banded = xs.filter((x) => x.inBand != null)
        const stat = [
          median(xs.map((x) => Math.abs(x.err))) as number,
          xs.reduce((a, x) => a + x.err, 0) / xs.length,
          banded.length > 0 ? banded.filter((x) => x.inBand).length / banded.length : NaN,
          xs.length,
        ]
        perMethod[m].set(r.name, [...(perMethod[m].get(r.name) ?? []), stat])
      }
    }
  }
  const hours = Math.round((eventEndMs(meta) - meta.startAt) / H)
  for (const m of METHODS) {
    for (const r of REGIONS) {
      const st = perMethod[m].get(r.name) ?? []
      const mean = (k: number) => {
        const xs = st.map((s) => s[k]).filter((x) => Number.isFinite(x))
        return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
      }
      rows.push({ id, hours, method: m, region: r.name, mae: mean(0), bias: mean(1), cov: mean(2), n: st.reduce((a, s) => a + s[3], 0) })
    }
  }
}

const pct = (v: number | null) => (v == null ? '-' : `${(v * 100).toFixed(1)}`)
const sgn = (v: number | null) => (v == null ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}`)
const cells = (f: (m: Method) => string, ms: readonly Method[] = METHODS) => ms.map(f).join(' / ')
console.log('| 回 | 長さ | 区間 | |誤差| 中央 ふだん / w0.5 / w0.75 / w1（%） | 誤差の平均 ふだん / w0.5 / w0.75 / w1（%） | 当たり率 ふだん / 特別（%） |')
console.log('|---|---:|---|---|---|---|')
for (const id of targets) {
  for (const r of REGIONS) {
    const get = (m: Method) => rows.find((x) => x.id === id && x.method === m && x.region === r.name)
    if (METHODS.some((m) => !get(m))) continue
    const hours = get('prod')?.hours
    console.log(
      `| ${id} | ${hours}h | ${r.name} | ${cells((m) => pct(get(m)?.mae ?? null))} | ${cells((m) => sgn(get(m)?.bias ?? null))} | ${cells((m) => pct(get(m)?.cov ?? null), ['prod', 'w0.5'])} |`,
    )
  }
}
// 全体（回の平均）
for (const r of REGIONS) {
  const avg = (m: Method, k: 'mae' | 'bias' | 'cov') => {
    const xs = rows.filter((x) => x.method === m && x.region === r.name && x[k] != null).map((x) => x[k] as number)
    return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  console.log(`| 平均 | | ${r.name} | ${cells((m) => pct(avg(m, 'mae')))} | ${cells((m) => sgn(avg(m, 'bias')))} | ${cells((m) => pct(avg(m, 'cov')), ['prod', 'w0.5'])} |`)
}
