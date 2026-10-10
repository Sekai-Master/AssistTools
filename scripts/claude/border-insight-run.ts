/**
 * ③ 一言解説 と ④ 改善案 を、答え合わせを書いた直後に動かす（scripts/border/analyze.ts から呼ぶ）。
 *
 * - ANTHROPIC_API_KEY が無ければ何もしない
 * - ここでの失敗は解析ジョブ全体を落とさない（呼ぶ側で受け止めてログに出すだけ）
 * - ③ は答え合わせの投稿を積んだイベントにだけ（終了から3日以内）。Discord と X の両方へ
 * - ④ は GitHub の Issue（ラベル model-proposal）。GH_TOKEN・GITHUB_REPOSITORY が要る
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import type { Report } from '../border/report.ts'
import { askClaude, hasKey, MODEL } from './client.ts'
import { sanitizeForIssue } from './diagnose.ts'
import { upsertIssue } from './github.ts'
import { INSIGHT_SYSTEM, PROPOSAL_SYSTEM, checkInsight, insightPost, insightUser, proposalUser } from './insight.ts'

export interface InsightDeps {
  report: Report
  summary: ModelSummary
  /** 答え合わせの投稿を積んだか（積んでいなければ一言解説も積まない） */
  posted: boolean
  queue: (post: { id: string; eventId: number; kind: string; text: string }) => Promise<unknown>
  say: (line: string) => void
}

export async function addInsights(d: InsightDeps): Promise<void> {
  if (!hasKey()) {
    d.say('- Claude の補足: 鍵が無いので飛ばす')
    return
  }
  const { report } = d
  if (d.posted) {
    const facts = insightUser(report)
    const text = await askClaude({ label: `一言解説 ${report.eventId}`, system: INSIGHT_SYSTEM, user: facts, maxTokens: 4_000 })
    const bad = checkInsight(text, facts)
    const post = bad ? null : insightPost(report.name, text)
    if (post) {
      await d.queue({ id: `${report.eventId}:insight`, eventId: report.eventId, kind: 'insight', text: post })
      d.say(`- 一言解説: 積んだ（${[...text].length}字）`)
    } else {
      d.say(`- 一言解説: 型に合わないので積まない（${bad ?? '長すぎる'}）`)
    }
  }
  if (process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY) {
    const body = await askClaude({ label: `改善案 ${report.eventId}`, system: PROPOSAL_SYSTEM, user: proposalUser(report, d.summary), maxTokens: 16_000 })
    const url = await upsertIssue({
      title: `[モデル改善案] ${report.eventId} ${report.name}`,
      dedupePrefix: `[モデル改善案] ${report.eventId} `,
      label: 'model-proposal',
      body: [
        sanitizeForIssue(body),
        '',
        '---',
        `Claude（${MODEL}）による改善案です。採るかどうかは前向き検証（workers/border/src/fit.ts）で決めます。試すときは候補として足し、解析ジョブの採点を見てください。`,
      ].join('\n'),
    })
    d.say(`- 改善案: ${url}`)
  }
}
