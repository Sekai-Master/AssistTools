/**
 * Cron の本体。30分ごとに呼ばれる。
 *
 * ★ Workers 無料枠の CPU は Cron でも 1回 10ms。重い処理（学習・評価）はここに入れない。
 *   ここでやるのは「実測を1回取って、割り算6回して、数行書く」だけ。
 *   日程（288KB）の parse は開催中には行わない（開催中でない回にだけ読み直す）。
 */
import {
  activeEvent,
  activeModel,
  insertPredictions,
  insertSamples,
  kvAppend,
  kvGet,
  kvSet,
  queuePost,
  upsertEvents,
  type LiveSample,
} from './db.ts'
import type { Env } from './env.ts'
import { RANKS, durationHours, predict, type EventMeta, type Prediction } from './model.ts'
import { milestoneText } from './posts.ts'
import type { PostPayload, Snapshot } from './snapshot.ts'

export const LIVE_URL = 'https://api.sekai.best/event/live'
export const USER_AGENT = 'sekaimaster-border/1.0 (+https://sekaimaster.pages.dev)'

/**
 * この時点をまたいだ回に、予測ポストをキューに積む。
 * 開始24時間は序盤の「目安」（幅が広いことを確度で示す。2026-09-30 Nori 提案）
 */
/** 節目をこれ以上過ぎてから気づいた回は、その節目のポストを出さない（経過率。150h で約7.5時間） */
export const MILESTONE_GRACE = 0.05

export const MILESTONES: readonly { key: string; at: (e: EventMeta) => number; label: (progress: number) => string }[] = [
  { key: 'h24', at: (e) => 24 / durationHours(e), label: () => '開始24時間' },
  { key: 'p50', at: () => 0.5, label: (p) => `経過${Math.round(p * 100)}%` },
  { key: 'p85', at: () => 0.85, label: (p) => `経過${Math.round(p * 100)}%` },
]

/** 日程を読み直すとき、終了からこの期間より古いイベントは D1 に入れない */
const SCHEDULE_LOOKBACK_MS = 3 * 86_400_000
/**
 * 開催していない間も、日程（288KB）を読み直すのはこの間隔に1回まで。
 * イベントは数日前にはマスタに載るので、6時間に1回で開始に間に合う。
 * 毎回読むと、Cron の大半を占める「開催していない回」が毎回 288KB を parse することになる（レビュー 2026-09-30）
 */
export const SCHEDULE_REFRESH_MS = 6 * 3_600_000

export type CronResult =
  | { status: 'idle'; scheduleChanged: number }
  | { status: 'source_error'; message: string }
  | { status: 'event_mismatch'; expected: number; got: number | null }
  | { status: 'collected'; eventId: number; samples: number; predictions: number; stale: boolean; queued: string[] }

type Fetcher = typeof fetch

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/** bonuses.json から直近のイベントだけ取り出す（外部データなので型を1つずつ確かめる） */
export function parseSchedule(raw: unknown, now: number): EventMeta[] {
  if (!isRecord(raw) || !Array.isArray(raw.events)) return []
  const out: EventMeta[] = []
  for (const e of raw.events) {
    if (!isRecord(e)) continue
    const { id, name, type, unit, startAt, aggregateAt } = e
    if (typeof id !== 'number' || typeof startAt !== 'number' || typeof aggregateAt !== 'number') continue
    if (aggregateAt < now - SCHEDULE_LOOKBACK_MS) continue
    out.push({
      id,
      name: typeof name === 'string' ? name : `event ${id}`,
      eventType: typeof type === 'string' ? type : 'unknown',
      unit: typeof unit === 'string' ? unit : 'none',
      startAt,
      aggregateAt,
    })
  }
  return out
}

/** /event/live から目的の6順位だけ取り出す */
export function parseLive(raw: unknown): { eventId: number | null; samples: LiveSample[] } {
  if (!isRecord(raw) || !isRecord(raw.data) || !Array.isArray(raw.data.eventRankings)) return { eventId: null, samples: [] }
  const wanted = new Set<number>(RANKS)
  let eventId: number | null = null
  const samples: LiveSample[] = []
  for (const r of raw.data.eventRankings) {
    if (!isRecord(r)) continue
    const { rank, score, timestamp } = r
    if (typeof r.eventId === 'number') eventId ??= r.eventId
    if (typeof rank !== 'number' || !wanted.has(rank) || typeof timestamp !== 'string') continue
    const s = typeof score === 'string' ? Number(score) : score
    const ts = Date.parse(timestamp)
    if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0 || Number.isNaN(ts)) continue
    samples.push({ rank, ts, score: s })
  }
  return { eventId, samples }
}

async function refreshSchedule(env: Env, now: number, fetcher: Fetcher): Promise<number> {
  const last = Number((await kvGet(env.DB, 'schedule_at')) ?? '0')
  if (now - last < SCHEDULE_REFRESH_MS) return 0
  const res = await fetcher(`${env.SITE_ORIGIN}/CardDatas/bonuses.json`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`bonuses.json ${res.status}`)
  const changed = await upsertEvents(env.DB, parseSchedule(await res.json(), now))
  await kvSet(env.DB, 'schedule_at', now, now)
  return changed
}

function snapshotOf(event: EventMeta, now: number, samples: LiveSample[], preds: Map<number, Prediction>, modelVersion: string | null): Snapshot {
  const sampleAt = Math.max(...samples.map((s) => s.ts))
  const span = event.aggregateAt + 60_000 - event.startAt
  return {
    event: {
      id: event.id,
      name: event.name,
      type: event.eventType,
      unit: event.unit,
      startAt: event.startAt,
      aggregateAt: event.aggregateAt,
      durationHours: durationHours(event),
    },
    checkedAt: now,
    sampleAt,
    progress: Math.min(1, Math.max(0, (sampleAt - event.startAt) / span)),
    modelVersion,
    predicted: preds.size > 0,
    ranks: [...samples]
      .sort((a, b) => a.rank - b.rank)
      .map((s) => {
        const p = preds.get(s.rank)
        return {
          rank: s.rank,
          current: s.score,
          predicted: p ? Math.round(p.predicted) : null,
          low: p?.low == null ? null : Math.round(p.low),
          high: p?.high == null ? null : Math.round(p.high),
          confidence: p?.confidence ?? null,
          visible: p?.visible ?? false,
        }
      }),
  }
}

export async function runCron(env: Env, now: number, fetcher: Fetcher = fetch): Promise<CronResult> {
  let event = await activeEvent(env.DB, now)
  if (!event) {
    const changed = await refreshSchedule(env, now, fetcher)
    event = await activeEvent(env.DB, now)
    if (!event) return { status: 'idle', scheduleChanged: changed }
  }

  let live: { eventId: number | null; samples: LiveSample[] }
  try {
    const res = await fetcher(LIVE_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return { status: 'source_error', message: `live ${res.status}` }
    live = parseLive(await res.json())
  } catch (err) {
    return { status: 'source_error', message: err instanceof Error ? err.message : String(err) }
  }
  if (live.eventId !== event.id) return { status: 'event_mismatch', expected: event.id, got: live.eventId }
  if (live.samples.length === 0) return { status: 'source_error', message: 'live に目的の順位が無い' }

  const prevRaw = await kvGet(env.DB, 'current')
  const prev = prevRaw ? (JSON.parse(prevRaw) as Snapshot) : null
  const sampleAt = Math.max(...live.samples.map((s) => s.ts))
  // sekai.best 側の取得が止まっていると同じ値が返ってくる（2026-09-10 に3.4時間止まった）
  const stale = prev != null && prev.event.id === event.id && prev.sampleAt === sampleAt

  await insertSamples(env.DB, event.id, live.samples)

  const preds = new Map<number, Prediction>()
  const model = event.eventType === 'marathon' ? await activeModel(env.DB) : null
  if (model) {
    for (const s of live.samples) {
      // 1順位の表が壊れていても、残りの順位と実測の保存は止めない
      try {
        const p = predict(model.model, event, s.rank, s.score, s.ts)
        if (p) preds.set(s.rank, p)
      } catch (err) {
        console.error('predict failed', model.version, s.rank, err)
      }
    }
    if (!stale) {
      await insertPredictions(
        env.DB,
        event.id,
        model.version,
        live.samples.filter((s) => preds.has(s.rank)).map((s) => ({ ts: s.ts, p: preds.get(s.rank) as Prediction })),
        now,
      )
    }
  }

  const snap = snapshotOf(event, now, live.samples, preds, model?.version ?? null)
  await kvSet(env.DB, 'current', snap, now)
  if (!stale) {
    const row = [snap.sampleAt, snap.progress, snap.ranks.map((r) => [r.rank, r.current, r.predicted, r.low, r.high, r.visible ? 1 : 0])]
    await kvAppend(env.DB, `history:${event.id}`, row, now)
  }

  const queued: string[] = []
  if (!stale && preds.size > 0) {
    const prevProgress = prev && prev.event.id === event.id ? prev.progress : 0
    for (const m of MILESTONES) {
      const at = m.at(event)
      if (!(prevProgress < at && snap.progress >= at)) continue
      // 途中から動き出した・止まっていた等で節目を大きく過ぎていたら、その節目のポストは出さない
      //（開始76時間に「開始24時間の予測」を出すのは嘘になる）
      if (snap.progress - at > MILESTONE_GRACE) continue
      const label = m.label(snap.progress)
      const text = milestoneText(
        event.name,
        label,
        snap.ranks
          .filter((r) => r.visible && r.predicted != null)
          .map((r) => ({ rank: r.rank, predicted: r.predicted as number, low: r.low, high: r.high, confidence: r.confidence })),
      )
      const id = `${event.id}:${m.key}`
      const payload: PostPayload = { kind: 'milestone', key: m.key, label, snapshot: snap }
      if (text && (await queuePost(env.DB, id, event.id, 'milestone', text, now, payload))) queued.push(id)
    }
  }

  return { status: 'collected', eventId: event.id, samples: live.samples.length, predictions: preds.size, stale, queued }
}
