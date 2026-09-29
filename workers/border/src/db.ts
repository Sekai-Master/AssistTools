/**
 * D1 へのアクセスはここに集める。SQL は必ずパラメータバインド（?N）で書く。
 */
import type { EventMeta, Model, Prediction, Shape } from './model.ts'

export interface EventRow {
  id: number
  name: string
  type: string
  unit: string
  start_at: number
  aggregate_at: number
}

export function toMeta(r: EventRow): EventMeta {
  return { id: r.id, name: r.name, eventType: r.type, unit: r.unit, startAt: r.start_at, aggregateAt: r.aggregate_at }
}

/** 集計の後、この時間までは終値のサンプルを拾いに行く（sekai.best の最終サンプルは 20:59 終了の 16分後） */
export const FINAL_CAPTURE_MS = 60 * 60_000

export async function activeEvent(db: D1Database, now: number): Promise<EventMeta | null> {
  const r = await db
    .prepare('SELECT * FROM events WHERE start_at <= ?1 AND aggregate_at + ?2 >= ?1 ORDER BY start_at DESC LIMIT 1')
    .bind(now, FINAL_CAPTURE_MS)
    .first<EventRow>()
  return r ? toMeta(r) : null
}

export async function upsertEvents(db: D1Database, events: readonly EventMeta[]): Promise<number> {
  if (events.length === 0) return 0
  // 値が変わらない行は UPDATE しない（書き込み行数を増やさない）
  const stmt = db.prepare(
    `INSERT INTO events (id, name, type, unit, start_at, aggregate_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, unit = excluded.unit,
       start_at = excluded.start_at, aggregate_at = excluded.aggregate_at
     WHERE events.name IS NOT excluded.name OR events.type IS NOT excluded.type OR events.unit IS NOT excluded.unit
       OR events.start_at IS NOT excluded.start_at OR events.aggregate_at IS NOT excluded.aggregate_at`,
  )
  const res = await db.batch(events.map((e) => stmt.bind(e.id, e.name, e.eventType, e.unit, e.startAt, e.aggregateAt)))
  return res.reduce((n, r) => n + (r.meta.changes ?? 0), 0)
}

export interface LiveSample {
  rank: number
  ts: number
  score: number
}

export async function insertSamples(db: D1Database, eventId: number, samples: readonly LiveSample[]): Promise<void> {
  if (samples.length === 0) return
  const stmt = db.prepare('INSERT OR IGNORE INTO samples (event_id, rank, ts, score) VALUES (?1, ?2, ?3, ?4)')
  await db.batch(samples.map((s) => stmt.bind(eventId, s.rank, s.ts, s.score)))
}

export async function insertPredictions(
  db: D1Database,
  eventId: number,
  modelVersion: string,
  rows: readonly { ts: number; p: Prediction }[],
  now: number,
): Promise<void> {
  if (rows.length === 0) return
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO predictions
     (event_id, rank, ts, model_version, progress, current, share, predicted, low, high, visible, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
  await db.batch(
    rows.map(({ ts, p }) =>
      stmt.bind(
        eventId,
        p.rank,
        ts,
        modelVersion,
        p.progress,
        p.current,
        p.share,
        Math.round(p.predicted),
        p.low == null ? null : Math.round(p.low),
        p.high == null ? null : Math.round(p.high),
        p.visible ? 1 : 0,
        now,
      ),
    ),
  )
}

export interface PredictionRow {
  event_id: number
  rank: number
  ts: number
  model_version: string
  progress: number
  current: number
  share: number
  predicted: number
  low: number | null
  high: number | null
  visible: number
}

export async function predictionsFor(db: D1Database, eventId: number): Promise<PredictionRow[]> {
  const r = await db
    .prepare(
      `SELECT event_id, rank, ts, model_version, progress, current, share, predicted, low, high, visible
       FROM predictions WHERE event_id = ?1 ORDER BY ts, rank`,
    )
    .bind(eventId)
    .all<PredictionRow>()
  return r.results
}

export interface ActiveModel {
  version: string
  model: Model
}

export async function activeModel(db: D1Database): Promise<ActiveModel | null> {
  const r = await db.prepare('SELECT version, body FROM models WHERE active = 1 LIMIT 1').first<{ version: string; body: string }>()
  if (!r) return null
  return { version: r.version, model: JSON.parse(r.body) as Model }
}

export async function activeModelSummary(db: D1Database): Promise<string | null> {
  const r = await db.prepare('SELECT summary FROM models WHERE active = 1 LIMIT 1').first<{ summary: string }>()
  return r?.summary ?? null
}

/** 新しい版を入れて有効にする。同じ版がすでに有効なら何もしない */
export async function putModel(db: D1Database, version: string, body: string, summary: string, now: number): Promise<boolean> {
  const cur = await db.prepare('SELECT version FROM models WHERE active = 1 LIMIT 1').first<{ version: string }>()
  if (cur?.version === version) return false
  await db.batch([
    db.prepare('UPDATE models SET active = 0 WHERE active = 1'),
    db
      .prepare(
        `INSERT INTO models (version, created_at, active, body, summary) VALUES (?1, ?2, 1, ?3, ?4)
         ON CONFLICT(version) DO UPDATE SET active = 1, body = excluded.body, summary = excluded.summary`,
      )
      .bind(version, now, body, summary),
  ])
  return true
}

export async function allShapes(db: D1Database): Promise<Shape[]> {
  const r = await db.prepare('SELECT event_id, rank, final, share FROM shapes ORDER BY event_id, rank').all<{
    event_id: number
    rank: number
    final: number
    share: string
  }>()
  return r.results.map((x) => ({ eventId: x.event_id, rank: x.rank, final: x.final, share: JSON.parse(x.share) as (number | null)[] }))
}

export async function upsertShapes(db: D1Database, shapes: readonly Shape[], now: number): Promise<void> {
  if (shapes.length === 0) return
  const stmt = db.prepare(
    `INSERT INTO shapes (event_id, rank, final, share, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(event_id, rank) DO UPDATE SET final = excluded.final, share = excluded.share, updated_at = excluded.updated_at
     WHERE shapes.final IS NOT excluded.final OR shapes.share IS NOT excluded.share`,
  )
  // D1 の batch は1回あたりの文の数に上限があるので分ける
  for (let i = 0; i < shapes.length; i += 50) {
    await db.batch(shapes.slice(i, i + 50).map((s) => stmt.bind(s.eventId, s.rank, s.final, JSON.stringify(s.share), now)))
  }
}

export async function kvGet(db: D1Database, k: string): Promise<string | null> {
  const r = await db.prepare('SELECT v FROM kv WHERE k = ?1').bind(k).first<{ v: string }>()
  return r?.v ?? null
}

export async function kvSet(db: D1Database, k: string, v: string, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at')
    .bind(k, v, now)
    .run()
}

/** カンマ区切りで追記する（読み出し側で [ ] を付ける）。Worker で JSON を parse し直さないため */
export async function kvAppend(db: D1Database, k: string, item: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(k) DO UPDATE SET v = kv.v || ',' || excluded.v, updated_at = excluded.updated_at`,
    )
    .bind(k, item, now)
    .run()
}

export async function putReport(db: D1Database, eventId: number, body: string, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO reports (event_id, created_at, body) VALUES (?1, ?2, ?3) ON CONFLICT(event_id) DO UPDATE SET body = excluded.body, created_at = excluded.created_at')
    .bind(eventId, now, body)
    .run()
}

export async function allReports(db: D1Database): Promise<string[]> {
  const r = await db.prepare('SELECT body FROM reports ORDER BY event_id DESC LIMIT 50').all<{ body: string }>()
  return r.results.map((x) => x.body)
}

export async function reportedEventIds(db: D1Database): Promise<number[]> {
  const r = await db.prepare('SELECT event_id FROM reports').all<{ event_id: number }>()
  return r.results.map((x) => x.event_id)
}

export interface PostRow {
  id: string
  event_id: number
  kind: string
  text: string
  created_at: number
  sent_x_at: number | null
  sent_discord_at: number | null
}

/** 同じ id はもう入っていれば無視する（マイルストーンを二重に出さない） */
export async function queuePost(db: D1Database, id: string, eventId: number, kind: string, text: string, now: number): Promise<boolean> {
  const r = await db
    .prepare('INSERT OR IGNORE INTO posts (id, event_id, kind, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, eventId, kind, text, now)
    .run()
  return (r.meta.changes ?? 0) > 0
}

export type PostChannel = 'x' | 'discord'

export async function unsentPosts(db: D1Database, channel: PostChannel): Promise<PostRow[]> {
  const col = channel === 'x' ? 'sent_x_at' : 'sent_discord_at'
  const r = await db.prepare(`SELECT * FROM posts WHERE ${col} IS NULL ORDER BY created_at LIMIT 20`).all<PostRow>()
  return r.results
}

export async function markPostSent(db: D1Database, id: string, channel: PostChannel, now: number): Promise<boolean> {
  const col = channel === 'x' ? 'sent_x_at' : 'sent_discord_at'
  const r = await db.prepare(`UPDATE posts SET ${col} = ?2 WHERE id = ?1 AND ${col} IS NULL`).bind(id, now).run()
  return (r.meta.changes ?? 0) > 0
}
