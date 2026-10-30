/**
 * 率モデル（rate.ts）の目視確認。
 *
 *   node scripts/border/research/rate-check.ts
 *
 * 新時代（124回〜）の全履歴で当てはめ、期間ごとの表を「同じ期間の過去の中央値」と並べて見る。
 * あわせて当てはめの残差・時刻効果と、回ごとの |実測/表 − 1| の中央値（in-sample と leave-one-out）を出す。
 */
import { GRID, durationHours, median, type EventMeta, type HistoryEvent, type Shape } from '../../../workers/border/src/model.ts'
import { loadHistory } from './data.ts'
import { fitRate, rateComponents, rateShareTable, type RateFit } from '../../../workers/border/src/rate.ts'

const RANKS_CHECKED = [1000, 50]
const DURATIONS = [102, 150, 174, 198, 246]
const PS = [0.04, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]
/** 評価に使う経過率の範囲（SCORE_FROM〜SCORE_TO に近い、序盤を少し足した帯） */
const EVAL_P = [0.1, 0.96]

const HOUR_MS = 3_600_000
/** 表の比較に使う仮の日程: 15:00 JST 開始、終了は 21:00 の直前（実イベントと同じ作り） */
const BASE_START = Date.UTC(2026, 0, 5, 6, 0, 0)

function metaOf(duration: number, startAt = BASE_START): Pick<EventMeta, 'startAt' | 'aggregateAt'> {
  return { startAt, aggregateAt: startAt + duration * HOUR_MS - 2000 }
}

const f3 = (x: number | null) => (x == null ? '   -  ' : x.toFixed(3).padStart(6))
const f1 = (x: number) => (x * 100).toFixed(1) + '%'
const sgn = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(3)

/** 格子ごとの中央値の表（標本のない点は null） */
function medianTable(shapes: readonly Shape[]): (number | null)[] {
  return GRID.map((_, i) => median(shapes.flatMap((s) => (s.share[i] == null ? [] : [s.share[i] as number]))))
}

/** 評価帯での |実測/表 − 1| の中央値 */
function medAbsDev(shape: Shape, table: readonly (number | null)[]): number | null {
  const xs: number[] = []
  GRID.forEach((p, i) => {
    if (p < EVAL_P[0] - 1e-9 || p > EVAL_P[1] + 1e-9) return
    const s = shape.share[i]
    const t = table[i]
    if (s == null || t == null || !(t > 0)) return
    xs.push(Math.abs(s / t - 1))
  })
  return median(xs)
}

function isMonotone(table: readonly (number | null)[]): boolean {
  if (table[0] !== 0 || table[table.length - 1] !== 1) return false
  for (let i = 1; i < table.length; i++) if (!((table[i] as number) > (table[i - 1] as number))) return false
  return true
}

function printFit(fit: RateFit): void {
  console.log(`当てはめ: 回数=${fit.nEvents} 区間数=${fit.nRows} 残差SD=${fit.sigma.toFixed(3)}（log 比率）`)
  const bins = fit.clock.length
  const mean = fit.clock.reduce((a, b) => a + b, 0) / bins
  const w = 24 / bins
  const cells = fit.clock.map((v, b) => {
    const lo = b * w
    return `${String(Math.floor(lo)).padStart(2, '0')}時台〜${sgn(v - mean)}`
  })
  console.log('時刻効果 h（JST, 平均を引いた対数。+0.1 ≒ 1.1倍の速さ）')
  console.log('  ' + cells.join('  '))
  const hours = [0, 2, 4, 8, 16, 32, 64, 128, 256]
  const fs = hours.map((h) => rateComponents(fit, h, 0, 0).f)
  const gs = hours.map((h) => rateComponents(fit, 0, h, 0).g)
  const fm = fs.reduce((a, b) => a + b, 0) / fs.length
  const gm = gs.reduce((a, b) => a + b, 0) / gs.length
  console.log('結び目(h)    ' + hours.map((h) => String(h).padStart(7)).join(''))
  console.log('f(経過) 平均差' + fs.map((v) => sgn(v - fm).padStart(7)).join(''))
  console.log('g(残り) 平均差' + gs.map((v) => sgn(v - gm).padStart(7)).join(''))
}

function printTables(history: readonly HistoryEvent[], fit: RateFit): void {
  for (const dur of DURATIONS) {
    const table = rateShareTable(fit, metaOf(dur))
    const same = history.filter((h) => durationHours(h.meta) === dur && h.shapes.has(fit.rank))
    const med = medianTable(same.map((h) => h.shapes.get(fit.rank) as Shape))
    console.log(`\n-- ${dur}h  同じ期間の過去 ${same.length} 件  単調・0→1: ${isMonotone(table) ? 'OK' : 'NG'}`)
    console.log('  p       ' + PS.map((p) => p.toFixed(2).padStart(7)).join(''))
    console.log('  率モデル ' + PS.map((p) => f3(table[Math.round(p / 0.02)]).padStart(7)).join(''))
    if (same.length > 0) {
      console.log('  同期間中央' + PS.map((p) => f3(med[Math.round(p / 0.02)]).padStart(7)).join(''))
      console.log(
        '  率/中央−1' +
          PS.map((p) => {
            const i = Math.round(p / 0.02)
            const m = med[i]
            return (m == null ? '-' : ((table[i] as number) / m - 1 > 0 ? '+' : '') + (((table[i] as number) / m - 1) * 100).toFixed(1) + '%').padStart(7)
          }).join(''),
      )
    }
  }
}

interface EvRow {
  id: number
  dur: number
  rate: number | null
  rateLoo: number | null
  same: number | null
  sameLoo: number | null
}

function sanity(history: readonly HistoryEvent[], fit: RateFit, rank: number): void {
  const rows: EvRow[] = []
  for (const h of history) {
    const shape = h.shapes.get(rank)
    if (!shape) continue
    const dur = durationHours(h.meta)
    const mates = history.filter((o) => durationHours(o.meta) === dur && o.shapes.has(rank))
    const others = mates.filter((o) => o !== h).map((o) => o.shapes.get(rank) as Shape)
    const looFit = fitRate(history.filter((o) => o !== h), rank, fit.options)
    rows.push({
      id: h.meta.id,
      dur,
      rate: medAbsDev(shape, rateShareTable(fit, h.meta)),
      rateLoo: looFit ? medAbsDev(shape, rateShareTable(looFit, h.meta)) : null,
      same: medAbsDev(shape, medianTable(mates.map((o) => o.shapes.get(rank) as Shape))),
      // 比べる相手が薄すぎる（本番の MIN_POOL=3 未満）ときは LOO を出さない
      sameLoo: others.length >= 3 ? medAbsDev(shape, medianTable(others)) : null,
    })
  }
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const show = (x: number | null) => (x == null ? '   -  ' : f1(x).padStart(6))
  console.log(`\n== in-sample 健全性: 回ごとの |実測/表−1| 中央値（p=${EVAL_P[0]}〜${EVAL_P[1]}）の回平均 ==`)
  console.log(`  全${rows.length}回  率モデル(in-sample) ${show(mean(rows.map((r) => r.rate)))}   同期間中央値(自分を含む) ${show(mean(rows.map((r) => r.same)))}`)
  const loo = rows.filter((r) => r.sameLoo != null)
  console.log(`  同期間が他に3件以上ある ${loo.length}回: 率(in-sample) ${show(mean(loo.map((r) => r.rate)))}  率(LOO) ${show(mean(loo.map((r) => r.rateLoo)))}  同期間(LOO) ${show(mean(loo.map((r) => r.sameLoo)))}`)
  console.log(`  全${rows.length}回の率(LOO) ${show(mean(rows.map((r) => r.rateLoo)))}   （LOO＝その回を除いて再当てはめ）`)
  console.log('  期間別（回数: 率in / 率LOO / 同期間LOO）')
  for (const dur of [...new Set(rows.map((r) => r.dur))].sort((a, b) => a - b)) {
    const g = rows.filter((r) => r.dur === dur)
    console.log(`    ${String(dur).padStart(3)}h ${String(g.length).padStart(2)}回: ${show(mean(g.map((r) => r.rate)))} / ${show(mean(g.map((r) => r.rateLoo)))} / ${show(mean(g.map((r) => r.sameLoo)))}`)
  }
}

const t0 = Date.now()
const history = loadHistory('new')
console.log(`新時代 ${history.length} 回（${history[0].meta.id}〜${history[history.length - 1].meta.id}）`)
for (const rank of RANKS_CHECKED) {
  console.log(`\n==================== 順位 ${rank} ====================`)
  const fit = fitRate(history, rank)
  if (!fit) {
    console.log('当てはめ不能（回数不足）')
    continue
  }
  printFit(fit)
  printTables(history, fit)
  sanity(history, fit, rank)
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`)
