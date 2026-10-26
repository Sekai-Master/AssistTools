/**
 * 日報（毎日21時の6順位のまとめ）を投稿キューに積む。5分ごとの見回り（finals.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-25 Nori: 毎日21時の1回。6順位の いま・直近24時間・直近1時間・歴代ペース・最終予測。初日は直近24時間の列を外す。
 * - 21時台に、30分ごとの収集（21:05）が書いた最新の値（kv `current`）が21時以降の点になったら積む。同じ日の2回目以降は id が同じなので積まれない
 * - 何日目かは「日報を出す時刻の一覧の何番目か」で決める（経過時間で決めると、21時台に始まる回で :03 と :33 の点で日がずれ、1日分消えた。#160 レビュー M1）
 * - 直近24時間・直近1時間は、推移（kv `history:{id}`）の24時間前・1時間前の点から。点が無ければ空
 * - 歴代ペースは、解析ジョブが前もって置いた kv `pace:{id}`（pace.ts）から。無ければ空
 * - マラソン・チアフルだけ（ワールドリンクは歴代ペースの比べる相手が無い）。終了の日（21:00 が終了）は出さない
 * ★ CPU 10ms の枠: ふだんの回は時刻を見て終わる。積む回だけ current（数KB）・history（約60KB）・pace（約25KB）を parse する
 */
import { kvGet, queuePost } from './db.ts'
import type { Env } from './env.ts'
import { formatMan } from './posts.ts'
import { DAILY_UTC_HOUR, dailyTimes, paceRank, type PacePoint } from './pace.ts'
import type { PostPayload, Snapshot } from './snapshot.ts'

const H = 3_600_000
/**
 * 24時間前・1時間前の点として認める、ずれの幅。収集は30分ごと（:03・:33）なので、ふつうはちょうどの点がある。
 * 幅を広げると「直近24時間」が 23〜25 時間ぶんの伸びになりうる（#160 レビュー L2）
 */
const DAY_TOLERANCE_MS = 20 * 60_000
const HOUR_TOLERANCE_MS = 10 * 60_000

/** 積まなかったが、ログに残すほどでもない理由（開催していない・日報の日でない・対象外の種別）は idle にする（#160 レビュー L3） */
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

export type HistoryRowLite = [number, number, [number, number, ...unknown[]][]]

/** t に最も近い推移の点（tol より離れていれば null）。追い込み（spurt.ts）も使う */
export function nearest(rows: readonly HistoryRowLite[], t: number, tol: number): HistoryRowLite | null {
  let best: HistoryRowLite | null = null
  for (const r of rows) if (Math.abs(r[0] - t) <= tol && (!best || Math.abs(r[0] - t) < Math.abs(best[0] - t))) best = r
  return best
}

export const valueIn = (row: HistoryRowLite | null, rank: number) => row?.[2].find((x) => x[0] === rank)?.[1] ?? null

/** 日報の各順位の数字（純粋関数）。fresh（開始から24時間たっていない日）は直近24時間を出さない */
export function dailyRanks(snap: Snapshot, rows: readonly HistoryRowLite[], point: PacePoint | null, fresh: boolean): DailyRank[] {
  const elapsedH = (snap.sampleAt - snap.event.startAt) / H
  const dayRow = fresh ? null : nearest(rows, snap.sampleAt - 24 * H, DAY_TOLERANCE_MS)
  const hourRow = nearest(rows, snap.sampleAt - H, HOUR_TOLERANCE_MS)
  return snap.ranks.map((r) => {
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
}

/**
 * 投稿の控えの本文（画像が作れなかったとき・古い Bot が日報を読めないときに、そのまま出る文字）。
 * 数字の無い投稿にならないよう、6順位のいまの値を入れる（#160 レビュー H1・M2）。画像と一緒に出す本文は Bot が作る
 */
export function dailyText(name: string, day: number, ranks: readonly { rank: number; current: number }[], site: string): string {
  return [`【ボーダー日報】${name}（${day}日目・21時台）`, '', ...ranks.map((r) => `${r.rank}位 ${formatMan(r.current)}`), '', `${site}/border`].join('\n')
}

export async function runDaily(env: Env, now: number): Promise<DailyResult> {
  // 21時台（日本時間）だけ。ふだんの回はここで終わる
  if (new Date(now).getUTCHours() !== DAILY_UTC_HOUR) return { status: 'idle' }
  const raw = await kvGet(env.DB, 'current')
  if (!raw) return { status: 'idle' }
  const snap = JSON.parse(raw) as Snapshot
  const e = snap.event
  if (e.type !== 'marathon' && e.type !== 'cheerful_carnival') return { status: 'idle' }
  // 今日の21時（日報を出す時刻）。終了の日の21時は dailyTimes に入っていない
  const times = dailyTimes(e)
  const index = times.findIndex((t) => t <= now && now - t < H)
  if (index < 0) return { status: 'idle' }
  const today = times[index]
  // 21時以降の点（21:03 ごろ）が入るまで待つ。21:05 の収集の後の見回りで積む
  if (snap.sampleAt < today) return { status: 'skip', reason: '21時以降の値がまだ無い' }
  if (snap.ranks.length === 0) return { status: 'skip', reason: '順位が無い' }
  const day = index + 1
  const fresh = today - e.startAt < 24 * H
  // 同じ日の日報を積んだあとの見回り（21時台に5分ごと）は、推移を読み直さずに抜ける
  const id = `${e.id}:daily:${day}`
  if (await env.DB.prepare('SELECT 1 AS x FROM posts WHERE id = ?1').bind(id).first()) return { status: 'exists', id }

  const hist = await kvGet(env.DB, `history:${e.id}`)
  const rows = hist ? (JSON.parse(`[${hist}]`) as HistoryRowLite[]) : []
  const paceRaw = await kvGet(env.DB, `pace:${e.id}`)
  const points = paceRaw ? ((JSON.parse(paceRaw) as { points?: PacePoint[] }).points ?? []) : []
  const point = points.find((p) => p.at === today) ?? null

  const ranks = dailyRanks(snap, rows, point, fresh)
  const payload: PostPayload = { kind: 'daily', day, fresh, snapshot: snap, ranks }
  const queued = await queuePost(env.DB, id, e.id, 'daily', dailyText(e.name, day, snap.ranks, env.SITE_ORIGIN), now, payload)
  return { status: queued ? 'queued' : 'exists', id }
}
