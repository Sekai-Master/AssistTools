/**
 * 入れ子の前向き検証。各回を「その回の開始前に終わった回だけ」で学習し直した版で、本番と同じ predict() に通して当てる。
 * 学習の中の選択（王者・切り替え点・裾）も毎回やり直すので、調整ごと前向きになる。
 *
 *   node scripts/border/research/eval.ts --era new --method prod [--lodo] [--out results/new-prod.json]
 *
 * --lodo: 当てる回と同じ長さの回を学習から抜く（「初めての長さ」を作り出す。Worker は借り先の表＋帯1.5倍＋参考値で出す）
 * 結果は (回, 順位) ごとに、経過 2% 刻みの 誤差・下限/終値・上限/終値・表に出したか を残す（集計は report.ts）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRID, RANKS, durationHours, eventEndMs, interpGrid, predict, type EventMeta, type HistoryEvent, type Model } from '../../../workers/border/src/model.ts'
import { fitModel } from '../../../workers/border/src/fit.ts'
import { fitInputs, historyBefore, loadHistory, type Era } from './data.ts'
import { METHODS } from './methods.ts'

export interface Method {
  name: string
  fit: (train: HistoryEvent[], target: EventMeta) => Model
}

export const prodMethod: Method = {
  name: 'prod',
  fit: (train, target) => {
    const { events, shapes } = fitInputs(train)
    // 本番の解析ジョブと同じく、これから始まる回（当てる回）も日程に入れて渡す（学習には入らない）
    return fitModel([...events, target], shapes, target.startAt - 1).model
  },
}

export interface Row {
  eventId: number
  rank: number
  hours: number
  /** 予測 ÷ 終値 − 1 */
  err: (number | null)[]
  /** 下限 ÷ 終値・上限 ÷ 終値（帯が無ければ null） */
  lo: (number | null)[]
  hi: (number | null)[]
  vis: number[]
  /** 参考値（借り先の表）で出したか */
  ref: number
  /** 当てる回のその時点の share（下限を「いまの値」で切るのに使う） */
  s: (number | null)[]
  /** 版の帯（誤差の分位点、広げる前）。広げる倍率を後から振るのに使う */
  blo: (number | null)[]
  bhi: (number | null)[]
}

export const MIN_TRAIN = 10
const r5 = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5)

export function evaluate(era: Era, method: Method, lodo: boolean): Row[] {
  const all = loadHistory(era)
  const rows: Row[] = []
  for (const target of all) {
    const hours = durationHours(target.meta)
    let train = historyBefore(all, target.meta)
    if (lodo) train = train.filter((h) => durationHours(h.meta) !== hours)
    if (train.length < MIN_TRAIN) continue
    const model = method.fit(train, target.meta)
    const span = eventEndMs(target.meta) - target.meta.startAt
    for (const rank of RANKS) {
      const shape = target.shapes.get(rank)
      if (!shape) continue
      const row: Row = { eventId: target.meta.id, rank, hours, err: [], lo: [], hi: [], vis: [], ref: 0, s: [], blo: [], bhi: [] }
      const rm = model.ranks[String(rank)]
      GRID.forEach((p, i) => {
        const s = shape.share[i]
        const pr = i > 0 && s != null && s > 0 ? predict(model, target.meta, rank, s * shape.final, target.meta.startAt + p * span) : null
        row.err.push(pr ? r5(pr.predicted / shape.final - 1) : null)
        row.lo.push(pr && pr.low != null ? r5(pr.low / shape.final) : null)
        row.hi.push(pr && pr.high != null ? r5(pr.high / shape.final) : null)
        row.vis.push(pr?.visible ? 1 : 0)
        if (pr?.extrapolatedFrom != null) row.ref = 1
        row.s.push(r5(s ?? null))
        row.blo.push(rm ? r5(interpGrid(rm.band.lo, p)) : null)
        row.bhi.push(rm ? r5(interpGrid(rm.band.hi, p)) : null)
      })
      rows.push(row)
    }
  }
  return rows
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const opt = (k: string) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : undefined
  }
  const era = (opt('--era') ?? 'new') as Era
  const name = opt('--method') ?? 'prod'
  const lodo = args.includes('--lodo')
  const method = name === 'prod' ? prodMethod : METHODS[name]
  if (!method) throw new Error(`知らない方法 ${name}（${Object.keys(METHODS).join(', ')}）`)
  const t0 = Date.now()
  const rows = evaluate(era, method, lodo)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const out = opt('--out') ?? path.join(here, 'results', `${era}${lodo ? '-lodo' : ''}-${name}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ era, method: name, lodo, rows }))
  console.log(`${era}${lodo ? ' lodo' : ''} ${name}: ${rows.length} 行 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(process.cwd(), out)}`)
}
