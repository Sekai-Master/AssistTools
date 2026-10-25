/**
 * 日報（毎日21時の6順位のまとめ）を投稿キューに積む。5分ごとの見回り（finals.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-25 Nori: 毎日21時の1回。6順位の いま・直近24時間・直近1時間・歴代ペース・最終予測。初日は直近24時間の列を外す。
 * - 21時台に、30分ごとの収集（21:05）が書いた最新の値（kv `current`）が21時以降の点になったら積む。同じ日の2回目以降は id が同じなので積まれない
 * - 直近24時間・直近1時間は、推移（kv `history:{id}`）の24時間前・1時間前の点から。点が無ければ空
 * - 歴代ペースは、解析ジョブが前もって置いた kv `pace:{id}`（pace.ts）から。無ければ空
 * - マラソン・チアフルだけ（ワールドリンクは歴代ペースの比べる相手が無い）。終了の日（21:00 が終了）は出さない
 * ★ CPU 10ms の枠: ふだんの回は時刻を見て終わる。積む回だけ current（数KB）・history（約30KB）・pace（約40KB）を parse する
 */
import { kvGet, queuePost } from './db.ts'
import type { Env } from './env.ts'
import { dailyTimes, paceRank, type PacePoint } from './pace.ts'
import type { PostPayload, Snapshot } from './snapshot.ts'

const H = 3_600_000
/** 24時間前・1時間前の点として認める、ずれの幅 */
const DAY_TOLERANCE_MS = 45 * 60_000
const HOUR_TOLERANCE_MS = 20 * 60_000

export type DailyResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'queued' | 'exists'; id: string }

export interface DailyRank {
  rank: number
  /** 直近24時間の伸び（初日・点が無いときは null） */
  d24: number | null
  /** 直近1時間の伸び */
  h1: number | null
  /** 歴代ペース（同じ経過率の日速での順位） */
  pace: { pos: number; of: number } | null
}

type HistoryRowLite = [number, number, [number, number, ...unknown[]][]]

function nearest(rows: readonly HistoryRowLite[], t: number, tol: number): HistoryRowLite | null {
  let best: HistoryRowLite | null = null
  for (const r of rows) if (Math.abs(r[0] - t) <= tol && (!best || Math.abs(r[0] - t) < Math.abs(best[0] - t))) best = r
  return best
}

const valueIn = (row: HistoryRowLite | null, rank: number) => row?.[2].find((x) => x[0] === rank)?.[1] ?? null

/** 日報の各順位の数字（純粋関数。テスト用に分けてある） */
export function dailyRanks(snap: Snapshot, rows: readonly HistoryRowLite[], point: PacePoint | null): { day: number; fresh: boolean; ranks: DailyRank[] } {
  const elapsedH = (snap.sampleAt - snap.event.startAt) / H
  const fresh = elapsedH < 24
  const dayRow = fresh ? null : nearest(rows, snap.sampleAt - 24 * H, DAY_TOLERANCE_MS)
  const hourRow = nearest(rows, snap.sampleAt - H, HOUR_TOLERANCE_MS)
  const ranks = snap.ranks.map((r) => {
    const d = valueIn(dayRow, r.rank)
    const h = valueIn(hourRow, r.rank)
    const pool = point?.ranks[String(r.rank)]
    return {
      rank: r.rank,
      d24: d == null ? null : r.current - d,
      h1: h == null ? null : r.current - h,
      pace: pool && pool.length > 0 && elapsedH > 0 ? paceRank(pool, (r.current / elapsedH) * 24) : null,
    }
  })
  return { day: Math.floor(elapsedH / 24) + 1, fresh, ranks }
}

/** 投稿の控えの本文（画像が作れなかったときの文字・代替テキスト）。画像と一緒に出す本文は Bot が作る */
export function dailyText(name: string, day: number, site: string): string {
  return [`【ボーダー日報】${name}（${day}日目）`, '', '21時時点の6順位の値と、直近の伸び・歴代ペースです。', `${site}/border`].join('\n')
}

export async function runDaily(env: Env, now: number): Promise<DailyResult> {
  // 21時台（日本時間）だけ。ふだんの回はここで終わる
  if (new Date(now).getUTCHours() !== 12) return { status: 'idle' }
  const raw = await kvGet(env.DB, 'current')
  if (!raw) return { status: 'skip', reason: '最新の値が無い' }
  const snap = JSON.parse(raw) as Snapshot
  const e = snap.event
  if (e.type !== 'marathon' && e.type !== 'cheerful_carnival') return { status: 'skip', reason: '日報の対象外の種別' }
  // 今日の21時（日報を出す時刻）。終了の日の21時は dailyTimes に入っていない
  const today = dailyTimes(e).find((t) => t <= now && now - t < H)
  if (today == null) return { status: 'skip', reason: '日報を出す日ではない' }
  // 21時以降の点（21:03 ごろ）が入るまで待つ。21:05 の収集の後の見回りで積む
  if (snap.sampleAt < today) return { status: 'skip', reason: '21時以降の値がまだ無い' }
  if (snap.ranks.length === 0) return { status: 'skip', reason: '順位が無い' }
  // 同じ日の日報を積んだあとの見回り（21時台に5分ごと）は、推移を読み直さずに抜ける
  const day = Math.floor((snap.sampleAt - e.startAt) / H / 24) + 1
  const id = `${e.id}:daily:${day}`
  if (await env.DB.prepare('SELECT 1 AS x FROM posts WHERE id = ?1').bind(id).first()) return { status: 'exists', id }

  const hist = await kvGet(env.DB, `history:${e.id}`)
  const rows = hist ? (JSON.parse(`[${hist}]`) as HistoryRowLite[]) : []
  const paceRaw = await kvGet(env.DB, `pace:${e.id}`)
  const points = paceRaw ? ((JSON.parse(paceRaw) as { points?: PacePoint[] }).points ?? []) : []
  const point = points.find((p) => p.at === today) ?? null

  const { fresh, ranks } = dailyRanks(snap, rows, point)
  const payload: PostPayload = { kind: 'daily', day, fresh, snapshot: snap, ranks }
  const queued = await queuePost(env.DB, id, e.id, 'daily', dailyText(e.name, day, env.SITE_ORIGIN), now, payload)
  return { status: queued ? 'queued' : 'exists', id }
}
