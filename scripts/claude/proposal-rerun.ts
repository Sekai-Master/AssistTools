/**
 * ④ モデルの改善案を、答え合わせ済みのイベントについて作り直す（.github/workflows/border-proposal.yml から手で起動）。
 *
 *   node scripts/claude/proposal-rerun.ts <イベントの id>
 *
 * 解析ジョブは答え合わせ済みのイベントを二度と扱わないので、改善案だけ失敗したとき（2026-10-10、219 で
 * thinking が上限を使い切って本文が空だった）にここで取り直す。答え合わせと一言解説は積み直さない（posted: false）。
 * 材料はサイトに出している答え合わせの実績（/v1/border/track-record の report と model）。
 * 環境変数: BORDER_API・ANTHROPIC_API_KEY・GH_TOKEN・GITHUB_REPOSITORY
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import type { Report } from '../border/report.ts'
import { addInsights } from './border-insight-run.ts'

const eventId = Number(process.argv[2])
const api = process.env.BORDER_API

async function main() {
  if (!Number.isInteger(eventId) || eventId <= 0) throw new Error('イベントの id を渡す')
  if (!api) throw new Error('BORDER_API が要る')
  const res = await fetch(`${api}/v1/border/track-record`)
  if (!res.ok) throw new Error(`track-record → ${res.status}`)
  const body = (await res.json()) as { model?: ModelSummary; reports?: Report[] }
  const report = body.reports?.find((r) => r.eventId === eventId)
  if (!report || !body.model) throw new Error(`イベント ${eventId} の答え合わせかモデルの要約が無い`)
  await addInsights({
    report,
    summary: body.model,
    posted: false,
    queue: async () => {
      throw new Error('積み直しはしない')
    },
    say: (line) => console.log(line),
  })
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
