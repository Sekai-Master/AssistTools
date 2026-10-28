/**
 * 30分刻みの生の推移を sekai.best から落として、解析ジョブの --series-cache と同じ形（{回}_{順位}.json = [[時刻ms, 値], ...]）で保存する。
 * 検証の環境からは sekai.best に届かないので、手元で動かして出来たフォルダを渡してもらうためのもの。
 *
 *   node scripts/border/research/fetch-series.ts --out ./series [--from 124] [--to 222]
 *
 * マラソン（Memories を含む）だけ。1回ごとに 0.5 秒あける（解析ジョブと同じ）。既にあるファイルは取り直さない
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (k: string, d: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const out = opt('--out', './series')
const from = Number(opt('--from', '124'))
const to = Number(opt('--to', '9999'))
const RANKS = [50, 100, 200, 500, 1000, 2000]
const UA = 'sekaimaster-border-research/1.0 (+https://sekaimaster.pages.dev)'

const events = (JSON.parse(fs.readFileSync(path.join(here, 'data/events-meta.json'), 'utf8')).events as { id: number; aggregateAt: number }[]).filter(
  (e) => e.id >= from && e.id <= to && e.aggregateAt < Date.now(),
)
fs.mkdirSync(out, { recursive: true })
let done = 0
for (const e of events) {
  for (const rank of RANKS) {
    const file = path.join(out, `${e.id}_${rank}.json`)
    if (fs.existsSync(file)) continue
    const res = await fetch(`https://api.sekai.best/event/${e.id}/rankings/graph?rank=${rank}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) {
      console.warn(`${e.id}/${rank}: ${res.status}`)
      continue
    }
    const rows = ((await res.json()) as { data?: { eventRankings?: { timestamp?: string; score?: number | string }[] } }).data?.eventRankings ?? []
    const samples = rows
      .map((r) => [Date.parse(r.timestamp ?? ''), Number(r.score)] as [number, number])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
      .sort((a, b) => a[0] - b[0])
    fs.writeFileSync(file, JSON.stringify(samples))
    done++
    await new Promise((r) => setTimeout(r, 500))
  }
}
console.log(`${done} 件を ${out} に保存した（${events.length} 回 × ${RANKS.length} 順位）`)
