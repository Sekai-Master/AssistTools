/**
 * 終了前の追い込み（ラストスパート）の投稿を積む。5分ごとの見回り（finals.ts・daily.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-25 Nori「作る」。最終日の終了3時間前（20:59 終了の回なら 18時台）に1本。
 * - 日報（daily.ts）と同じしくみ: 終了3時間前を過ぎた最初の値（18:03 の点を 18:05 の収集が kv `current` に書く）が入ったら積む。
 *   id は1イベントに1つ（`{id}:spurt`）なので2回は積まれない
 * - 中身は6順位の いま・直近1時間・直近3時間・最終予測。直近3時間は「残りと同じ長さの伸び」（同じ勢いならあとどれだけ伸びるかの目安）
 * - 終了の日の21時の日報は出ない（daily.ts の dailyTimes は終了より前の21時だけ）ので、追い込みと日報は重ならない
 * - マラソン・チアフルだけ（日報と同じ）。終了3時間前から1時間のうちに積めなければ出さない（遅れて「残り3時間」と出すのは嘘になる）
 * ★ CPU 10ms の枠: ふだんの回は events を1回引いて終わる（索引の無い小さい表の走査）。
 *   積む回だけ current（数KB）・history（約60〜100KB）を parse する（1イベントに1回）
 */
import { nearest, valueIn, type HistoryRowLite } from './daily.ts'
import { kvGet, queuePost } from './db.ts'
import type { Env } from './env.ts'
import { isTestEvent } from './history.ts'
import { formatMan } from './posts.ts'
import type { PostPayload, Snapshot } from './snapshot.ts'

const H = 3_600_000
/** 終了のこの時間前に出す */
export const SPURT_BEFORE_MS = 3 * H
/** 終了3時間前からこの時間のうちに積めなければ出さない */
const SPURT_WINDOW_MS = H
/** 1時間前・3時間前の点として認める、ずれの幅（日報の直近1時間と同じ） */
const TOLERANCE_MS = 10 * 60_000

/** 集計終了（20:59:59）の1秒後が終了（finals.ts の endOf と同じ） */
const endOf = (aggregateAt: number) => aggregateAt + 1_000

export type SpurtResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'queued' | 'exists'; id: string }

export interface SpurtRank {
  rank: number
  /** 直近1時間の伸び（点が無ければ null） */
  h1: number | null
  /** 直近3時間の伸び（点が無ければ null） */
  h3: number | null
}

/** 各順位の直近1時間・3時間の伸び（純粋関数） */
export function spurtRanks(snap: Snapshot, rows: readonly HistoryRowLite[]): SpurtRank[] {
  const h1Row = nearest(rows, snap.sampleAt - H, TOLERANCE_MS)
  const h3Row = nearest(rows, snap.sampleAt - 3 * H, TOLERANCE_MS)
  return snap.ranks.map((r) => {
    const a = valueIn(h1Row, r.rank)
    const b = valueIn(h3Row, r.rank)
    return { rank: r.rank, h1: a == null ? null : r.current - a, h3: b == null ? null : r.current - b }
  })
}

/** 控えの本文（画像が作れなかったとき・古い Bot が読めないときにそのまま出る）。6順位のいまの値を入れる */
export function spurtText(name: string, ranks: readonly { rank: number; current: number }[], site: string): string {
  // 控えは X にそのまま出るので、名前が極端に長くても 280 に収まるよう縮める（6順位と URL で約 150。レビュー LOW-3）
  const short = [...name].length > 40 ? `${[...name].slice(0, 39).join('')}…` : name
  return [`【ラストスパート・残り3時間】${short}`, '', ...ranks.map((r) => `${r.rank}位 ${formatMan(r.current)}`), '', `${site}/border`].join('\n')
}

export async function runSpurt(env: Env, now: number): Promise<SpurtResult> {
  // いまが終了3時間前〜2時間前のあいだにある回だけ。種別も WHERE で絞る（対象外の回が同じ時間帯に終わっても取りこぼさない。レビュー LOW-2）
  // テストの回（24時間のチアフルなど）が同じ時間帯に終わる本番の回と重なっても取りこぼさないよう、数行を引いて最初の本番の回を使う
  const cands = await env.DB.prepare(
    "SELECT id, type, name, asset FROM events WHERE aggregate_at > ?1 AND aggregate_at <= ?2 AND type IN ('marathon', 'cheerful_carnival') ORDER BY aggregate_at LIMIT 5",
  )
    .bind(now - endOf(0) + SPURT_BEFORE_MS - SPURT_WINDOW_MS, now - endOf(0) + SPURT_BEFORE_MS)
    .all<{ id: number; type: string; name: string; asset: string | null }>()
  const ev = cands.results.find((r) => !isTestEvent(r))
  if (!ev) return { status: 'idle' }
  const id = `${ev.id}:spurt`
  if (await env.DB.prepare('SELECT 1 AS x FROM posts WHERE id = ?1').bind(id).first()) return { status: 'exists', id }

  const raw = await kvGet(env.DB, 'current')
  if (!raw) return { status: 'skip', reason: 'いまの値が無い' }
  const snap = JSON.parse(raw) as Snapshot
  if (snap.event.id !== ev.id) return { status: 'skip', reason: `いまの値は ${snap.event.id} のもの` }
  // 終了3時間前より後の点（18:03 ごろ）が入るまで待つ
  if (snap.sampleAt < endOf(snap.event.aggregateAt) - SPURT_BEFORE_MS) return { status: 'skip', reason: '終了3時間前より後の値がまだ無い' }
  if (snap.ranks.length === 0) return { status: 'skip', reason: '順位が無い' }

  const hist = await kvGet(env.DB, `history:${ev.id}`)
  const rows = hist ? (JSON.parse(`[${hist}]`) as HistoryRowLite[]) : []
  const payload: PostPayload = { kind: 'spurt', hoursLeft: SPURT_BEFORE_MS / H, snapshot: snap, ranks: spurtRanks(snap, rows) }
  const queued = await queuePost(env.DB, id, ev.id, 'spurt', spurtText(snap.event.name, snap.ranks, env.SITE_ORIGIN), now, payload)
  return { status: queued ? 'queued' : 'exists', id }
}
