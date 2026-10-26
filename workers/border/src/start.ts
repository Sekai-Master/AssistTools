/**
 * イベント開始直前の告知を積む。5分ごとの見回り（finals.ts・daily.ts・spurt.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-26 Nori「イベント開始直前のツイートが何かしらあってもいいかもね」「なんか適当な画像作れるようにしませんか」
 * 「Git が時間通りに動くと思えない」（時刻は GitHub Actions に頼らない）。
 * - events の startAt の 75分前〜15分前のあいだの見回りで、**開始15分前の時刻（postAt）** を付けて1本積む。Bot はその時刻ちょうどに出す
 *   （歴代ボーダーの終了20分後と同じしくみ。sekaimaster-bot の relay.ts の postAtOf）
 * - 中身: 新しい回の名前・素材名（ロゴ）・期間・長さ、同じ種別で同じ長さの直近の回の6順位の終値（無ければ前例なし）、
 *   最初の予測の時刻（マラソンだけ）と日報の時刻。ワールドリンクは数えない（歴代ボーダーと同じ。告知もしない）
 * - **公開前の情報は出さない**: 使うのはマスタに入っている名前・期間・素材名だけ。出るのは開始15分前で、ゲーム内の告知
 *   （マスタの eventOnlyComponentDisplayStartAt。ふつうは開始3時間前）より後。積むのも開始75分前からで、それまでは何も持たない
 * - 15分前を過ぎてから気づいた回は積まない（「まもなく」と出すのが遅れるくらいなら出さない）
 * ★ CPU 10ms の枠: ふだんの回は events を1回引いて終わる。積む回だけ歴代の表（約90KB）を parse する（1イベントに1回）
 */
import { MILESTONES } from './collect.ts'
import { kvGet, queuePost, toMeta, type EventRow } from './db.ts'
import type { Env } from './env.ts'
import { historyMeta, parseHistory, type HistoryType } from './history.ts'
import { dailyTimes } from './pace.ts'
import { formatMan, xWeight } from './posts.ts'
import type { PostPayload } from './snapshot.ts'

const M = 60_000
const H = 60 * M
/** 開始のこの時間前に出す */
export const START_NOTICE_BEFORE_MS = 15 * M
/** 出す時刻のこの時間前から積む（Bot が画像を先に作り、時刻のタイマーを掛けられるように） */
const QUEUE_AHEAD_MS = H
/**
 * 本文の重みの上限。Bot が X にだけ「\n#プロセカボーダー #プロセカ」（重み28）を足すので、その分と余裕を引く
 * （足して 272 まで。ちょうど 280 は避ける。2026-10-26 の指示。222 の文面は 242＋28＝270）
 */
export const START_TEXT_MAX_WEIGHT = 244

export type StartResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'queued' | 'exists'; id: string }

const jst = (ms: number) => new Date(ms + 9 * H)
const hm = (ms: number) => `${jst(ms).getUTCHours()}:${String(jst(ms).getUTCMinutes()).padStart(2, '0')}`
const md = (ms: number) => `${jst(ms).getUTCMonth() + 1}/${jst(ms).getUTCDate()}`

/**
 * 最初の予測が出る回の時刻（予測の節目のうち最も早いもの。sekai.best は :03・:33 に取り、収集は :05・:35 に読む）。
 * Bot の caption.ts の whenLabel と同じ丸め（丸めた値をもう一度丸めても変わらない）
 */
export function firstPredictionAt(e: { startAt: number; aggregateAt: number }): number {
  const meta = { id: 0, name: '', eventType: 'marathon', unit: 'none', startAt: e.startAt, aggregateAt: e.aggregateAt }
  const at = Math.min(...MILESTONES.map((m) => m.at(meta)))
  const t = e.startAt + at * (e.aggregateAt + M - e.startAt)
  return Math.ceil((t - 3 * M) / (30 * M)) * 30 * M + 3 * M
}

const whenShort = (ms: number) => `${md(ms)} ${jst(ms).getUTCHours()}時${jst(ms).getUTCMinutes() >= 30 ? '半' : ''}`

export interface StartPrev {
  id: number
  name: string
  finals: Record<string, number>
}

/** 本文（Worker の文が正。Bot は X にだけハッシュタグを足して出す）。START_TEXT_MAX_WEIGHT に収める */
export function startText(
  o: { name: string; startAt: number; aggregateAt: number; hours: number; typeLabel: string; prev: StartPrev | null; firstPredictionAt: number | null; dailyAt: number | null },
  site: string,
): string {
  const build = (name: string, prevName: string | null, withSchedule: boolean) => {
    const head = `まもなく${hm(o.startAt)}から「${name}」開始🎶（${md(o.aggregateAt)} ${hm(o.aggregateAt)}まで・${o.hours}時間）`
    const p = o.prev
    const ref =
      p && prevName != null
        ? `同じ長さの前回「${prevName}」の最終ボーダーは${['100', '1000']
            .filter((r) => typeof p.finals[r] === 'number')
            .map((r) => `${r}位 ${formatMan(p.finals[r])}`)
            .join('・')}。`
        : `同じ長さ（${o.hours}時間）の${o.typeLabel}は過去にありません${o.firstPredictionAt != null ? '。予測は外れやすい参考値になります' : ''}。`
    const sched = [o.firstPredictionAt != null ? `予測は${whenShort(o.firstPredictionAt)}ごろから` : null, o.dailyAt != null ? '日報は毎日21時ごろ' : null].filter(
      (x): x is string => x != null,
    )
    return [head, '', ref, withSchedule && sched.length ? `${sched.join('、')}。` : null, `${site}/border/history`].filter((l): l is string => l != null).join('\n')
  }
  // 入らなければ 予定の行 → 名前を縮める の順（ふつうは入る。222 は 242）
  for (const withSchedule of [true, false]) {
    const t = build(o.name, o.prev?.name ?? null, withSchedule)
    if (xWeight(t) <= START_TEXT_MAX_WEIGHT) return t
  }
  const cut = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s)
  for (let n = 30; n >= 4; n -= 2) {
    const t = build(cut(o.name, n), o.prev ? cut(o.prev.name, n) : null, false)
    if (xWeight(t) <= START_TEXT_MAX_WEIGHT) return t
  }
  return build(cut(o.name, 4), o.prev ? cut(o.prev.name, 4) : null, false)
}

export async function runStart(env: Env, now: number): Promise<StartResult> {
  // 開始が 15分後より先・75分後まで の回だけ（種別も WHERE で絞る）
  const row = await env.DB.prepare(
    "SELECT * FROM events WHERE start_at > ?1 AND start_at <= ?2 AND type IN ('marathon', 'cheerful_carnival') ORDER BY start_at LIMIT 1",
  )
    .bind(now + START_NOTICE_BEFORE_MS, now + START_NOTICE_BEFORE_MS + QUEUE_AHEAD_MS)
    .first<EventRow>()
  if (!row) return { status: 'idle' }
  const ev = toMeta(row)
  const id = `${ev.id}:start`
  if (await env.DB.prepare('SELECT 1 AS x FROM posts WHERE id = ?1').bind(id).first()) return { status: 'exists', id }
  // 素材名が無いと Memories を見分けられず、比べる回を取り違える（finals.ts と同じ理由）。埋まるまで待つ
  if (!ev.asset) return { status: 'skip', reason: '素材名がまだ無い' }
  const meta = historyMeta({ id: ev.id, name: ev.name, eventType: ev.eventType, unit: ev.unit, assetbundleName: ev.asset, startAt: ev.startAt, aggregateAt: ev.aggregateAt })
  // テストの回・知らない Memories は告知しない
  if (!meta) return { status: 'skip', reason: '告知の対象外' }

  const stored = await kvGet(env.DB, 'finals')
  const table = stored ? parseHistory(JSON.parse(stored)) : []
  const prevRow = table
    // 本文に出す 100位・1000位の終値がそろっている回だけ（欠けた回を「前回」にすると本文が崩れる。#173 レビュー L2）
    .filter(
      (e) =>
        e.type === meta.type &&
        e.hours === meta.hours &&
        e.id < ev.id &&
        (e.type as HistoryType) !== 'world_bloom' &&
        typeof e.finals['100'] === 'number' &&
        typeof e.finals['1000'] === 'number',
    )
    .sort((a, b) => b.id - a.id)[0]
  const prev: StartPrev | null = prevRow ? { id: prevRow.id, name: prevRow.name, finals: prevRow.finals } : null
  const first = ev.eventType === 'marathon' ? firstPredictionAt(ev) : null
  const dailyAt = dailyTimes(ev)[0] ?? null
  const postAt = ev.startAt - START_NOTICE_BEFORE_MS
  const payload: PostPayload = {
    kind: 'start',
    postAt,
    event: { id: ev.id, name: ev.name, type: meta.type, typeLabel: meta.typeLabel, unit: meta.unit, asset: ev.asset, startAt: ev.startAt, aggregateAt: ev.aggregateAt, hours: meta.hours },
    prev,
    firstPredictionAt: first,
    dailyAt,
  }
  const text = startText({ name: ev.name, startAt: ev.startAt, aggregateAt: ev.aggregateAt, hours: meta.hours, typeLabel: meta.typeLabel, prev, firstPredictionAt: first, dailyAt }, env.SITE_ORIGIN)
  const queued = await queuePost(env.DB, id, ev.id, 'start', text, now, payload)
  return { status: queued ? 'queued' : 'exists', id }
}
