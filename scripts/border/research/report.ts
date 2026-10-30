/**
 * eval.ts の結果を集計して、本番（prod）と比べる。
 *
 *   node scripts/border/research/report.ts results/new-*.json [--base x_prod] [--json results/summary-new.json]
 *
 * --base: 比べる相手の方法名（既定 prod）。改善を本番に入れたあとは、旧本番の写し x_prod と比べる
 *
 * 指標（どれも「回」を単位にする。同じ回の6順位・51点は互いに強く相関するので、順位で平均してから回で比べる）
 *   外れ幅   … 区間（序盤 4〜28% / 中盤 30〜58% / 終盤 60〜96%）の |誤差| の中央値。表に出したかに関係なく全点
 *   当たり率 … 表に出した点のうち、終値が下限〜上限に入った割合（経過率の6区間ごとと全体）
 *   幅       … 表に出した点の log(上限 ÷ 下限) の平均（%表記は exp−1）
 *   区間スコア … 8割の区間の interval score（log 空間、α=0.2）。幅＋外れたぶんの罰。小さいほど良い
 *   段差     … 隣り合う格子点の |log(予測の比)|。序盤の切り替え（34〜46%）と全体
 * 本番との差は、回ごとの差をブートストラップ（回を再標本化、2000回）して 90% 区間を付ける
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Row } from './eval.ts'

const GRIDP = Array.from({ length: 51 }, (_, i) => i * 0.02)
const ZONES = { early: [0.04, 0.28], mid: [0.3, 0.58], late: [0.6, 0.96] } as const
type Zone = keyof typeof ZONES
export const BUCKETS = [
  [0.04, 0.12],
  [0.14, 0.28],
  [0.3, 0.48],
  [0.5, 0.68],
  [0.7, 0.88],
  [0.9, 0.96],
] as const
const ALPHA = 0.2

const inRange = (p: number, [a, b]: readonly [number, number]) => p >= a - 1e-9 && p <= b + 1e-9
function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** 1行（回×順位）の指標 */
interface RowStat {
  abs: Record<Zone, number | null>
  cover: { b: number; hit: number }[]
  width: Record<Zone, number[]>
  is: Record<Zone, number[]>
  jumpSwitch: number[]
  jumpAll: number[]
  visible: number
  points: number
}

/** mask を渡すと、帯の指標は「mask でも表に出した点」だけで数える（表に出す点が違う方法どうしを同じ点で比べる） */
function rowStat(r: Row, mask?: Row): RowStat {
  const abs = {} as Record<Zone, number | null>
  for (const z of Object.keys(ZONES) as Zone[]) {
    abs[z] = median(GRIDP.flatMap((p, i) => (inRange(p, ZONES[z]) && r.err[i] != null ? [Math.abs(r.err[i] as number)] : [])))
  }
  const cover: RowStat['cover'] = []
  const width = { early: [], mid: [], late: [] } as Record<Zone, number[]>
  const is = { early: [], mid: [], late: [] } as Record<Zone, number[]>
  const jumpSwitch: number[] = []
  const jumpAll: number[] = []
  let visible = 0
  let points = 0
  GRIDP.forEach((p, i) => {
    if (!inRange(p, [0.04, 0.96])) return
    if (r.err[i] != null) points++
    if (r.err[i] != null && r.err[i + 1] != null && inRange(p, [0.04, 0.94])) {
      const j = Math.abs(Math.log((1 + (r.err[i + 1] as number)) / (1 + (r.err[i] as number))))
      jumpAll.push(j)
      if (inRange(p, [0.34, 0.44])) jumpSwitch.push(j)
    }
    const lo = r.lo[i]
    const hi = r.hi[i]
    if (!r.vis[i] || lo == null || hi == null) return
    visible++
    if (mask && (!mask.vis[i] || mask.lo[i] == null || mask.hi[i] == null)) return
    const b = BUCKETS.findIndex((bk) => inRange(p, bk))
    if (b >= 0) cover.push({ b, hit: lo <= 1 + 1e-9 && hi >= 1 - 1e-9 ? 1 : 0 })
    const l = Math.log(lo)
    const u = Math.log(hi)
    const z = (Object.keys(ZONES) as Zone[]).find((k) => inRange(p, ZONES[k]))
    if (z) {
      width[z].push(u - l)
      is[z].push(u - l + (2 / ALPHA) * Math.max(0, l) + (2 / ALPHA) * Math.max(0, -u))
    }
  })
  return { abs, cover, width, is, jumpSwitch, jumpAll, visible, points }
}

/** 回ごとの指標（6順位の平均）。キーは指標名 */
type EventMetrics = Record<string, number>

function eventMetrics(rows: Row[], base?: Row[]): Map<number, EventMetrics> {
  const baseOf = new Map((base ?? []).map((b) => [`${b.eventId}:${b.rank}`, b]))
  const byEvent = new Map<number, RowStat[]>()
  for (const r of rows) {
    const list = byEvent.get(r.eventId) ?? []
    list.push(rowStat(r, baseOf.get(`${r.eventId}:${r.rank}`)))
    byEvent.set(r.eventId, list)
  }
  const out = new Map<number, EventMetrics>()
  for (const [id, stats] of byEvent) {
    const m: EventMetrics = {}
    for (const z of Object.keys(ZONES) as Zone[]) {
      const xs = stats.map((s) => s.abs[z]).filter((v): v is number => v != null)
      if (xs.length) m[`abs_${z}`] = mean(xs)
      const w = stats.flatMap((s) => s.width[z])
      if (w.length) m[`width_${z}`] = mean(w)
      const is = stats.flatMap((s) => s.is[z])
      if (is.length) m[`is_${z}`] = mean(is)
    }
    const cov = stats.flatMap((s) => s.cover)
    if (cov.length) m.cover = mean(cov.map((c) => c.hit))
    BUCKETS.forEach((_, b) => {
      const c = cov.filter((x) => x.b === b)
      if (c.length) m[`cover_b${b}`] = mean(c.map((x) => x.hit))
    })
    const js = stats.flatMap((s) => s.jumpSwitch)
    if (js.length) m.jump_switch = mean(js)
    m.jump_switch_max = Math.max(0, ...js)
    const ja = stats.flatMap((s) => s.jumpAll)
    if (ja.length) m.jump_all = mean(ja)
    m.visible = stats.reduce((a, s) => a + s.visible, 0) / Math.max(1, stats.reduce((a, s) => a + s.points, 0))
    out.set(id, m)
  }
  return out
}

function boot(xs: number[], B = 2000): [number, number] {
  let seed = 12345
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const ms: number[] = []
  for (let b = 0; b < B; b++) {
    let s = 0
    for (let k = 0; k < xs.length; k++) s += xs[Math.floor(rnd() * xs.length)]
    ms.push(s / xs.length)
  }
  ms.sort((a, b) => a - b)
  return [ms[Math.floor(B * 0.05)], ms[Math.floor(B * 0.95)]]
}

export interface MetricSummary {
  value: number
  n: number
  /** 本番との差（この方法 − 本番）と 90% 区間。本番自身は 0 */
  diff?: number
  ci?: [number, number]
  /** 本番より良かった回の割合（小さいほど良い指標のとき、差が負の回） */
  better?: number
}

export function summarize(files: string[], baseName = 'prod', fromId = 0): { key: string; era: string; lodo: boolean; method: string; metrics: Record<string, MetricSummary> }[] {
  // fromId: この id 以降の回だけを数える（学習の窓を絞る案は、学習データが窓より多い後半の回でしか違いが出ない）
  const loaded = files
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as { era: string; method: string; lodo: boolean; rows: Row[] })
    .map((L) => ({ ...L, rows: L.rows.filter((r) => r.eventId >= fromId) }))
  const out: ReturnType<typeof summarize> = []
  for (const L of loaded) {
    const base = loaded.find((b) => b.era === L.era && b.lodo === L.lodo && b.method === baseName)
    // 帯の指標は、本番とこの方法の両方で表に出した点だけで比べる（本番の側もこの方法の点で絞る）
    const em = eventMetrics(L.rows, base?.rows)
    const bm = base ? eventMetrics(base.rows, L.rows) : null
    const keys = [...new Set([...em.values()].flatMap((m) => Object.keys(m)))]
    const metrics: Record<string, MetricSummary> = {}
    for (const k of keys) {
      const ids = [...em.keys()].filter((id) => em.get(id)?.[k] != null && Number.isFinite(em.get(id)?.[k]))
      const vals = ids.map((id) => em.get(id)?.[k] as number)
      const ms: MetricSummary = { value: mean(vals), n: vals.length }
      if (bm) {
        const paired = ids.filter((id) => bm.get(id)?.[k] != null).map((id) => (em.get(id)?.[k] as number) - (bm.get(id)?.[k] as number))
        if (paired.length) {
          ms.diff = mean(paired)
          ms.ci = L.method === baseName ? [0, 0] : boot(paired)
          ms.better = paired.filter((d) => d < -1e-12).length / paired.length
        }
      }
      metrics[k] = ms
    }
    out.push({ key: `${L.era}${L.lodo ? '-lodo' : ''}-${L.method}`, era: L.era, lodo: L.lodo, method: L.method, metrics })
  }
  return out
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
  const args = process.argv.slice(2)
  const ji = args.indexOf('--json')
  const jsonOut = ji >= 0 ? args[ji + 1] : null
  const bi = args.indexOf('--base')
  const baseName = bi >= 0 ? args[bi + 1] : 'prod'
  const fi = args.indexOf('--from')
  const fromId = fi >= 0 ? Number(args[fi + 1]) : 0
  const files = args.filter((a, i) => a.endsWith('.json') && !(ji >= 0 && i === ji + 1))
  const sum = summarize(files, baseName, fromId)
  const pct = (v: number | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(d))
  const cell = (m: MetricSummary | undefined, d = 2) => {
    if (!m) return '–'
    if (m.diff == null || m.ci == null || (m.ci[0] === 0 && m.ci[1] === 0)) return pct(m.value, d)
    const sig = m.ci[1] < 0 ? '▼' : m.ci[0] > 0 ? '▲' : ''
    return `${pct(m.value, d)} (${m.diff >= 0 ? '+' : ''}${pct(m.diff, d)} [${pct(m.ci[0], d)}, ${pct(m.ci[1], d)}])${sig}`
  }
  for (const group of [...new Set(sum.map((s) => `${s.era}${s.lodo ? '-lodo' : ''}`))]) {
    const g = sum.filter((s) => `${s.era}${s.lodo ? '-lodo' : ''}` === group).sort((a, b) => (a.method === baseName ? -1 : b.method === baseName ? 1 : a.method.localeCompare(b.method)))
    console.log(`\n### ${group}（回の数 ${g[0]?.metrics.abs_mid?.n ?? '?'}）  比べる相手 ${baseName}。▼=小さい（90%区間が0をまたがない） ▲=大きい`)
    console.log('| 方法 | 外れ幅 序盤 | 中盤 | 終盤 | 当たり率 | 区間スコア 中盤 | 終盤 | 幅 中盤 | 段差(34〜46%) | 段差(全体) |')
    console.log('|---|---|---|---|---|---|---|---|---|---|')
    for (const s of g) {
      const m = s.metrics
      console.log(`| ${s.method} | ${cell(m.abs_early)} | ${cell(m.abs_mid)} | ${cell(m.abs_late)} | ${cell(m.cover, 1)} | ${cell(m.is_mid)} | ${cell(m.is_late)} | ${cell(m.width_mid)} | ${cell(m.jump_switch)} | ${cell(m.jump_all)} |`)
    }
    console.log('\n当たり率（経過率の区間ごと、%）')
    console.log(`| 方法 | ${BUCKETS.map((b) => `${Math.round(b[0] * 100)}〜${Math.round(b[1] * 100)}%`).join(' | ')} | 表に出した点 |`)
    console.log(`|---|${BUCKETS.map(() => '---').join('|')}|---|`)
    for (const s of g) console.log(`| ${s.method} | ${BUCKETS.map((_, b) => pct(s.metrics[`cover_b${b}`]?.value, 0)).join(' | ')} | ${pct(s.metrics.visible?.value, 0)} |`)
  }
  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true })
    fs.writeFileSync(jsonOut, JSON.stringify(sum))
  }
}
