/**
 * 次の検証に使うデータを1つのフォルダにまとめる。手元（wrangler にログイン済み・sekai.best に届く環境）で動かす。
 *
 *   node scripts/border/research/export-data.ts [--out ./border-data] [--skip-series]
 *
 * 出来るもの:
 *   d1-predictions.json … 本番の予測ログ（実際に出した予測。答え合わせを本番の版で採点し直す）
 *   d1-shapes.json      … 本番の学習データ（pace-seed.json と同じものかを確かめる）
 *   d1-model.json       … 有効な版の本体と要約（検証での再現と同じ版かを確かめる）
 *   d1-models.json      … 版の一覧（いつ切り替わったか）
 *   d1-samples.json     … Worker が30分ごとに取った実測（219回以降。開催中の回も入る）
 *   series/{回}_{順位}.json … sekai.best の30分刻みの推移（124回以降。fetch-series.ts と同じ）
 * D1 の読み取りは全部で数万行（無料枠 500万行/日のごく一部）
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const args = process.argv.slice(2)
const oi = args.indexOf('--out')
const out = path.resolve(oi >= 0 ? args[oi + 1] : './border-data')
fs.mkdirSync(out, { recursive: true })

const QUERIES: [string, string][] = [
  ['d1-predictions.json', 'SELECT event_id, rank, ts, model_version, progress, current, share, predicted, low, high, visible FROM predictions'],
  ['d1-shapes.json', 'SELECT event_id, rank, final, share FROM shapes'],
  ['d1-model.json', 'SELECT version, created_at, body, summary FROM models WHERE active = 1'],
  ['d1-models.json', 'SELECT version, created_at, active FROM models ORDER BY created_at'],
  ['d1-samples.json', 'SELECT event_id, rank, ts, score FROM samples WHERE event_id >= 219'],
]
for (const [file, sql] of QUERIES) {
  // Windows でも npx を見つけられるように shell 経由で呼ぶ
  const text = execFileSync('npx', ['wrangler', 'd1', 'execute', 'sekaimaster-border', '--remote', '--json', '--command', JSON.stringify(sql)], {
    cwd: path.join(root, 'workers/border'),
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    shell: true,
  })
  fs.writeFileSync(path.join(out, file), text)
  console.log(`${file}: ${(text.length / 1024).toFixed(0)} KB`)
}

if (!args.includes('--skip-series')) {
  execFileSync(process.execPath, [path.join(here, 'fetch-series.ts'), '--out', path.join(out, 'series'), '--from', '124'], { stdio: 'inherit' })
}
console.log(`→ ${out}（フォルダごと zip にして渡す）`)
