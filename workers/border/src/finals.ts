/**
 * 終わった直後のイベントを、歴代ボーダーの表（kv `finals`）に足して、歴代ボーダーの投稿を積む。5分ごとの Cron。
 *
 * 2026-10-25 Nori「終了から15分後に取得、20分後に投稿」「完全に時間指定でワーカーでやりましょう」。
 * - 終了から15分たったら、/event/live（いつもの収集と同じ1回の取得）の確定後の点（順位発表より後）を見る。
 *   sekai.best は 20:59 終了の回で 21:12 ごろに確定後の点を取る（221 で実測）。まだなら5分後にやり直す
 * - 取れたら表に1行足し、投稿に「終了から20分後」の時刻を付けて積む。Bot はその時刻ちょうどに出す
 * - 終了から3時間たっても取れなければあきらめる。解析ジョブ（analyze.ts の updateFinals）が後から sekai.best の時系列で拾う
 * - ワールドリンクは表に足すが、投稿は積まない（Bot の画像はワールドリンクを数えない）
 *
 * ★ Workers 無料枠の CPU は 1回 10ms。ふだんの回（終わった直後のイベントが無い）は D1 を1回引くだけ。
 *   足す回だけ /event/live（約100KB）と表（約90KB）を parse する（イベント1回につき1〜数回）。
 */
import { LIVE_URL, USER_AGENT, parseLive } from './collect.ts'
import { justEndedEvent, kvGetStamped, putFinalsIfUnchanged } from './db.ts'
import type { Env } from './env.ts'
import { FINAL_RANKS, announceAt, historyMeta, historyPostText, parseHistory, type HistoryEvent } from './history.ts'

/** 終了（集計終了の1秒後）からこの時間で取りに行く */
export const FINALS_FETCH_AFTER_MS = 15 * 60_000
/** 終了からこの時間に投稿する */
export const FINALS_POST_AFTER_MS = 20 * 60_000
/** 終了からこの時間たっても取れなければ、解析ジョブに任せる */
export const FINALS_GIVE_UP_MS = 3 * 3_600_000
/** Cron は時刻ちょうどより数秒遅れて動くことがある。早く動いたときに5分待たないよう、少し手前から見る */
const CRON_SLACK_MS = 30_000

/** 集計終了（20:59:59）の1秒後が終了（21:00:00） */
export const endOf = (aggregateAt: number) => aggregateAt + 1_000

export type FinalsResult =
  | { status: 'idle' }
  | { status: 'skip'; eventId: number; reason: string }
  | { status: 'waiting'; eventId: number; reason: string }
  | { status: 'added'; eventId: number; queued: boolean }

type Fetcher = typeof fetch

export async function runFinals(env: Env, now: number, fetcher: Fetcher = fetch): Promise<FinalsResult> {
  // 集計終了（aggregateAt）から数えた区間。終了は集計終了の1秒後
  const ev = await justEndedEvent(env.DB, now, endOf(0) + FINALS_FETCH_AFTER_MS - CRON_SLACK_MS, FINALS_GIVE_UP_MS)
  if (!ev) return { status: 'idle' }
  // 素材名が無いと Memories を見分けられず、マラソンとして表に入れてしまう（入れた行は後から直されない）。
  // 埋まるまで待ち、3時間たっても無ければ解析ジョブ（マスタの素材名を使う）に任せる（#159 レビュー HIGH-1。222 は MMJ Memories）
  if (!ev.asset) return { status: 'waiting', eventId: ev.id, reason: '素材名がまだ無い' }
  const master = {
    id: ev.id,
    name: ev.name,
    eventType: ev.eventType,
    unit: ev.unit,
    assetbundleName: ev.asset ?? undefined,
    startAt: ev.startAt,
    aggregateAt: ev.aggregateAt,
  }
  const meta = historyMeta(master)
  // 対象外（ライブバトルなど・テストの回・知らない Memories の素材名）は足さない。知らない Memories は解析ジョブが知らせる
  if (!meta) return { status: 'skip', eventId: ev.id, reason: '歴代の表の対象外' }

  // 表はまだ無いなら作らない（種は解析ジョブが入れる。ここで1行だけの表を作ると種が入らなくなる）
  const stored = await kvGetStamped(env.DB, 'finals')
  if (!stored) return { status: 'skip', eventId: ev.id, reason: '表がまだ無い' }
  const raw = JSON.parse(stored.v) as { events?: unknown[] }
  const table = parseHistory(raw)
  if (table.some((e) => e.id === ev.id)) return { status: 'skip', eventId: ev.id, reason: '表に入っている' }
  // 読めない行を黙って捨てて書き戻さない（解析ジョブと同じ。#159 レビュー LOW-4）
  if (table.length !== (Array.isArray(raw.events) ? raw.events.length : 0)) return { status: 'skip', eventId: ev.id, reason: '表に読めない行がある' }

  let live: ReturnType<typeof parseLive>
  try {
    const res = await fetcher(LIVE_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return { status: 'waiting', eventId: ev.id, reason: `live ${res.status}` }
    live = parseLive(await res.json())
  } catch (err) {
    return { status: 'waiting', eventId: ev.id, reason: `live を読めなかった（${err instanceof Error ? err.message : String(err)}）` }
  }
  if (live.eventId !== ev.id) return { status: 'waiting', eventId: ev.id, reason: `live は ${live.eventId} を返した` }
  const finals: Record<string, number> = {}
  const sources: Record<string, string> = {}
  const settled = announceAt(master)
  for (const rank of FINAL_RANKS) {
    const s = live.samples.find((x) => x.rank === rank)
    // 順位発表より後の点だけが確定値（それより前は終了間際の値。199 で 20:57 の点を終値にしていた）
    if (!s || s.ts <= settled) return { status: 'waiting', eventId: ev.id, reason: `${rank}位の確定後の点がまだ無い` }
    finals[String(rank)] = s.score
    sources[String(rank)] = 'sekai.best'
  }

  const row: HistoryEvent = { ...meta, finals, sources }
  const events = [...table, row].sort((a, b) => a.id - b.id)
  // ワールドリンクは投稿を積まない（Bot の画像はワールドリンクを数えない）
  const post =
    meta.type === 'world_bloom'
      ? undefined
      : {
          id: `${ev.id}:history`,
          eventId: ev.id,
          kind: 'history',
          text: historyPostText(ev.name, ev.id, env.SITE_ORIGIN),
          payload: { kind: 'history', eventId: ev.id, postAt: endOf(ev.aggregateAt) + FINALS_POST_AFTER_MS },
        }
  // 表と投稿は1回の書き込みで。あいだに解析ジョブが表を書いていたら何もせず、次の5分でやり直す
  if (!(await putFinalsIfUnchanged(env.DB, { events, updatedAt: now }, stored.at, now, post))) {
    return { status: 'waiting', eventId: ev.id, reason: '表が読んだあとに書き換わった' }
  }
  return { status: 'added', eventId: ev.id, queued: post != null }
}
