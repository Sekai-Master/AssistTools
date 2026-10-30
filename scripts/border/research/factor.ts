/**
 * 前例の無い長さで帯を広げる倍率（model.ts の FAR_BAND_FACTOR。この検証で 1.5 → 1.2 にした）を振る。
 * eval.ts --lodo の結果（学習から同じ長さを抜いて「初めての長さ」にした回）の、広げる前の帯（blo・bhi）から作り直す。
 *
 *   node scripts/border/research/factor.ts results/new-lodo-prod.json [...]
 *
 * 帯は predict() と同じ式: 下限 = 予測 ÷ (1 + f·上側) を「いまの値」で切る、上限 = 予測 ÷ (1 + f·下側)。
 * 表に出すかは、f を掛けた幅が 0.8 以内で、経過 4% 以上のとき（参考値なので確度は目安まで）
 */
import fs from 'node:fs'
import type { Row } from './eval.ts'

const FACTORS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0]
const ALPHA = 0.2

for (const file of process.argv.slice(2)) {
  const { rows, era, method } = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Row[]; era: string; method: string }
  console.log(`\n${era} ${method}（参考値で出した ${new Set(rows.filter((r) => r.ref).map((r) => r.eventId)).size} 回）`)
  console.log('| 倍率 | 当たり率 | 区間スコア | 幅 | 表に出せた点 |')
  console.log('|---|---|---|---|---|')
  for (const f of FACTORS) {
    // 回ごとに平均してから回で平均（report.ts と同じ重み）
    const byEvent = new Map<number, { hit: number[]; is: number[]; w: number[]; shown: number; all: number }>()
    for (const r of rows) {
      if (!r.ref) continue
      const ev = byEvent.get(r.eventId) ?? { hit: [], is: [], w: [], shown: 0, all: 0 }
      r.err.forEach((e, i) => {
        const p = i * 0.02
        if (p < 0.04 - 1e-9 || p > 0.96 + 1e-9 || e == null) return
        ev.all++
        const lo = r.blo[i]
        const hi = r.bhi[i]
        const s = r.s[i]
        if (lo == null || hi == null || s == null || hi * f - lo * f > 0.8 || 1 + lo * f <= 0.05) return
        ev.shown++
        const low = Math.max((1 + e) / (1 + hi * f), s)
        const high = (1 + e) / (1 + lo * f)
        ev.hit.push(low <= 1 && high >= 1 ? 1 : 0)
        const l = Math.log(low)
        const u = Math.log(high)
        ev.is.push(u - l + (2 / ALPHA) * Math.max(0, l) + (2 / ALPHA) * Math.max(0, -u))
        ev.w.push(u - l)
      })
      byEvent.set(r.eventId, ev)
    }
    const evs = [...byEvent.values()].filter((v) => v.hit.length > 0)
    const m = (g: (v: (typeof evs)[number]) => number) => evs.reduce((a, v) => a + g(v), 0) / evs.length
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    console.log(
      `| ${f.toFixed(2)} | ${(m((v) => avg(v.hit)) * 100).toFixed(1)}% | ${(m((v) => avg(v.is)) * 100).toFixed(2)} | ${(m((v) => avg(v.w)) * 100).toFixed(1)} | ${(m((v) => v.shown / v.all) * 100).toFixed(0)}% |`,
    )
  }
}
