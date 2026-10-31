/**
 * GitHub Actions を Worker から起動する（workflow_dispatch）。5分ごとの見回り（finals.ts などと同じ Cron）から呼ぶ。
 *
 * 2026-10-31（Nori「進めよう」・AssistTools #183）:
 * - Actions の schedule は毎回6時間前後遅れる（9/29〜10/10 の実測で中央値 約6時間）。手で起動した実行（workflow_dispatch）はすぐ始まる
 * - マスタの末尾を Range で読む道（旧 masterTail.ts）は Workers の上で動かなかった。Workers の fetch は Accept-Encoding を上書きし、
 *   GitHub は gzip の版の末尾を Content-Encoding なしで返す（`Content-Range: …/151091`＝圧縮後の大きさ）。そのため event 223 が events に入らず、
 *   開始の告知と収集が止まった。events.json（2.9MB）は Actions 側で全部読む
 *
 * 起動するもの:
 * 1. 解析ジョブ（border-analysis.yml）: 毎日 22:45・10:45（日本時間）から15分のうちに1回。起動できたら kv `dispatch:analysis` に時刻を残す
 *    （1日2行。失敗したら次の見回りでもう一度）
 * 2. 日程の取り込み（border-schedule.yml。analyze.ts --schedule-only）: これから始まる回が events に無いあいだ、毎時0〜4分の見回りで1回。
 *    開催中は終了まで24時間を切ってから（次の回がマスタに載るのは前の回の終了の前後）。入ったら止まる。状態を持たないので書き込みは0
 * - 鍵（GITHUB_DISPATCH_TOKEN）が無ければ起動しない（入れる前にデプロイしても何も壊れない）
 * ★ CPU 10ms の枠: ふだんの見回りは時刻の計算だけで終わる（D1 も読まない）
 */
import { USER_AGENT } from './collect.ts'
import { activeEvent, kvGet, kvSet } from './db.ts'
import type { Env } from './env.ts'

const M = 60_000
const H = 60 * M

export const GITHUB_REPO = 'Sekai-Master/AssistTools'
export const ANALYSIS_WORKFLOW = 'border-analysis.yml'
export const SCHEDULE_WORKFLOW = 'border-schedule.yml'
/** 解析ジョブを起動する時刻（UTC の 時・分）。22:45・10:45 JST。マラソンは 20:59 終了で、sekai.best の最終サンプルは 21:15 ごろ */
export const ANALYSIS_SLOTS_UTC: readonly (readonly [number, number])[] = [
  [13, 45],
  [1, 45],
]
/** 起動の時刻からこの時間のうちに起動できなければ、その回は諦める（次の回か Actions の schedule が拾う） */
const ANALYSIS_WINDOW_MS = 15 * M
/** 日程の取り込みは毎時この分より前の見回りでだけ（5分ごとの Cron で1時間に1回） */
const SCHEDULE_RUN_MINUTES = 5
/** 開催中の回の終了までこの時間を切ったら、次の回を探し始める */
const SCHEDULE_BEFORE_END_MS = 24 * H

export type DispatchResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'dispatched'; workflow: string }

type Fetcher = typeof fetch

/** いまが解析ジョブの起動の時間帯なら、その時間帯の始まり（ミリ秒）。外なら null */
export function analysisSlotStart(now: number): number | null {
  const d = new Date(now)
  for (const [h, m] of ANALYSIS_SLOTS_UTC) {
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m)
    if (now >= start && now < start + ANALYSIS_WINDOW_MS) return start
  }
  return null
}

/** workflow_dispatch を投げる。成功なら null、失敗ならその理由 */
export async function dispatchWorkflow(token: string, workflow: string, fetcher: Fetcher = fetch): Promise<string | null> {
  let res: Response
  try {
    res = await fetcher(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ ref: 'main' }),
    })
  } catch (err) {
    return `${workflow} を起動できなかった（${err instanceof Error ? err.message : String(err)}）`
  }
  if (res.ok) {
    await res.body?.cancel().catch(() => undefined)
    return null
  }
  const text = await res.text().catch(() => '')
  return `${workflow} の起動が ${res.status}（${text.slice(0, 200)}）`
}

/** 1. 解析ジョブ: 22:45・10:45 JST から15分のうちに1回 */
export async function runAnalysisDispatch(env: Env, now: number, fetcher: Fetcher = fetch): Promise<DispatchResult> {
  const slot = analysisSlotStart(now)
  if (slot == null) return { status: 'idle' }
  const last = Number((await kvGet(env.DB, 'dispatch:analysis')) ?? '0')
  if (last >= slot) return { status: 'idle' }
  if (!env.GITHUB_DISPATCH_TOKEN) return { status: 'skip', reason: 'GITHUB_DISPATCH_TOKEN が無い' }
  const err = await dispatchWorkflow(env.GITHUB_DISPATCH_TOKEN, ANALYSIS_WORKFLOW, fetcher)
  if (err) return { status: 'skip', reason: err }
  await kvSet(env.DB, 'dispatch:analysis', now, now)
  return { status: 'dispatched', workflow: ANALYSIS_WORKFLOW }
}

/** 2. 日程の取り込み: これから始まる回が events に無いあいだ、1時間に1回 */
export async function runScheduleDispatch(env: Env, now: number, fetcher: Fetcher = fetch): Promise<DispatchResult> {
  if (new Date(now).getUTCMinutes() >= SCHEDULE_RUN_MINUTES) return { status: 'idle' }
  const upcoming = await env.DB.prepare('SELECT 1 AS x FROM events WHERE start_at > ?1 LIMIT 1').bind(now).first()
  if (upcoming) return { status: 'idle' }
  const active = await activeEvent(env.DB, now)
  if (active && active.aggregateAt - now > SCHEDULE_BEFORE_END_MS) return { status: 'idle' }
  if (!env.GITHUB_DISPATCH_TOKEN) return { status: 'skip', reason: 'GITHUB_DISPATCH_TOKEN が無い' }
  const err = await dispatchWorkflow(env.GITHUB_DISPATCH_TOKEN, SCHEDULE_WORKFLOW, fetcher)
  if (err) return { status: 'skip', reason: err }
  return { status: 'dispatched', workflow: SCHEDULE_WORKFLOW }
}
