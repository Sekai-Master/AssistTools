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
  /** migrations/0002 で足した列。古い行は null */
  asset?: string | null
}

export function toMeta(r: EventRow): EventMeta {
  return { id: r.id, name: r.name, eventType: r.type, unit: r.unit, startAt: r.start_at, aggregateAt: r.aggregate_at, asset: r.asset ?? null }
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

/**
 * 開催中の回すべて（新しく始まった順・最大5件）。回が重なる（テストイベントがマラソンの終了直後の1時間や開催中に始まる）と、
 * 最後に始まった1件だけでは sekai.best が見せている回と食い違うので、収集（collect.ts）は live の回に合うものを選ぶ
 */
export async function activeEvents(db: D1Database, now: number): Promise<EventMeta[]> {
  const r = await db
    .prepare('SELECT * FROM events WHERE start_at <= ?1 AND aggregate_at + ?2 >= ?1 ORDER BY start_at DESC LIMIT 5')
    .bind(now, FINAL_CAPTURE_MS)
    .all<EventRow>()
  return r.results.map(toMeta)
}

/**
 * 終わってから from〜until（ミリ秒）のあいだのイベントのうち、いちばん最近終わったもの。歴代の表へ足す見回り（finals.ts）用
 */
export async function justEndedEvent(db: D1Database, now: number, from: number, until: number): Promise<EventMeta | null> {
  const r = await db
    // 列の側を式にしない（索引に乗るように。#159 レビュー LOW-7）
    .prepare('SELECT * FROM events WHERE aggregate_at <= ?1 - ?2 AND aggregate_at > ?1 - ?3 ORDER BY aggregate_at DESC LIMIT 1')
    .bind(now, from, until)
    .first<EventRow>()
  return r ? toMeta(r) : null
}

const UPSERT_EVENT = `INSERT INTO events (id, name, type, unit, start_at, aggregate_at, asset) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, unit = excluded.unit,
       start_at = excluded.start_at, aggregate_at = excluded.aggregate_at, asset = excluded.asset
     WHERE events.name IS NOT excluded.name OR events.type IS NOT excluded.type OR events.unit IS NOT excluded.unit
       OR events.start_at IS NOT excluded.start_at OR events.aggregate_at IS NOT excluded.aggregate_at
       OR events.asset IS NOT excluded.asset`
/** migrations/0002（素材名の列）を当てる前の表の書き方。先にデプロイしても日程の取り込みを止めない（#159 レビュー MEDIUM-3） */
const UPSERT_EVENT_NO_ASSET = `INSERT INTO events (id, name, type, unit, start_at, aggregate_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, unit = excluded.unit,
       start_at = excluded.start_at, aggregate_at = excluded.aggregate_at
     WHERE events.name IS NOT excluded.name OR events.type IS NOT excluded.type OR events.unit IS NOT excluded.unit
       OR events.start_at IS NOT excluded.start_at OR events.aggregate_at IS NOT excluded.aggregate_at`

export async function upsertEvents(db: D1Database, events: readonly EventMeta[]): Promise<number> {
  if (events.length === 0) return 0
  // 値が変わらない行は UPDATE しない（書き込み行数を増やさない）
  const write = async (withAsset: boolean) => {
    const stmt = db.prepare(withAsset ? UPSERT_EVENT : UPSERT_EVENT_NO_ASSET)
    let changed = 0
    for (let i = 0; i < events.length; i += 50) {
      const rows = events.slice(i, i + 50)
      const res = await db.batch(
        rows.map((e) =>
          withAsset ? stmt.bind(e.id, e.name, e.eventType, e.unit, e.startAt, e.aggregateAt, e.asset ?? null) : stmt.bind(e.id, e.name, e.eventType, e.unit, e.startAt, e.aggregateAt),
        ),
      )
      changed += res.reduce((n, r) => n + (r.meta.changes ?? 0), 0)
    }
    return changed
  }
  try {
    return await write(true)
  } catch (err) {
    if (!/asset/.test(err instanceof Error ? err.message : String(err))) throw err
    console.error('events に asset の列が無い（migrations/0002 が未適用）。素材名なしで書く')
    return write(false)
  }
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

/**
 * 新しい版を入れて有効にする。同じ版がすでに有効なら何もしない。
 * ★ kv・reports・models に入れる値は、必ずこのファイルの中で JSON.stringify する（引数は値で受ける）。
 *   公開 API（public.ts）はこれらを文字列のまま連結して返すので、生の文字列が入る経路が1本でもあると
 *   JSON の注入になる（セキュリティレビュー 2026-09-30）。
 */
export async function putModel(db: D1Database, model: Model, summary: unknown, now: number): Promise<boolean> {
  const version = model.version
  const cur = await db.prepare('SELECT version FROM models WHERE active = 1 LIMIT 1').first<{ version: string }>()
  if (cur?.version === version) return false
  const body = JSON.stringify(model)
  const summaryJson = JSON.stringify(summary)
  await db.batch([
    db.prepare('UPDATE models SET active = 0 WHERE active = 1'),
    db
      .prepare(
        `INSERT INTO models (version, created_at, active, body, summary) VALUES (?1, ?2, 1, ?3, ?4)
         ON CONFLICT(version) DO UPDATE SET active = 1, body = excluded.body, summary = excluded.summary`,
      )
      .bind(version, now, body, summaryJson),
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

/** kv の値と、その更新時刻（書き込みの衝突を見分けるため） */
export async function kvGetStamped(db: D1Database, k: string): Promise<{ v: string; at: number } | null> {
  const r = await db.prepare('SELECT v, updated_at FROM kv WHERE k = ?1').bind(k).first<{ v: string; updated_at: number }>()
  return r ? { v: r.v, at: r.updated_at } : null
}

const UPDATE_IF_STAMP = 'UPDATE kv SET v = ?2, updated_at = ?3 WHERE k = ?1 AND updated_at = ?4'

/** 読んだときの更新時刻のままなら書き換える。あいだに誰かが書いていたら false（書かない） */
export async function kvSetIfStamp(db: D1Database, k: string, value: unknown, now: number, prevAt: number): Promise<boolean> {
  const r = await db.prepare(UPDATE_IF_STAMP).bind(k, JSON.stringify(value), now, prevAt).run()
  return (r.meta.changes ?? 0) > 0
}

/**
 * 歴代の表（kv `finals`）を、読んだときの更新時刻のままなら書き換え、同じトランザクションで投稿を積む（finals.ts）。
 * - 表と投稿を別々に書くと、間で落ちたときに「表には入ったが投稿が無い」になり、次の回は表に入っているので積み直さない（#159 レビュー MEDIUM-1）
 * - 解析ジョブも同じ表を読んで書き戻すので、あいだに書かれていたら何もせず false（次の5分でやり直す。MEDIUM-2）
 * 投稿の INSERT は「表がいま書いた時刻になっているときだけ」にして、表を書けなかったときは積まない
 */
export async function putFinalsIfUnchanged(
  db: D1Database,
  table: unknown,
  prevAt: number,
  now: number,
  post?: { id: string; eventId: number; kind: string; text: string; payload: unknown },
): Promise<boolean> {
  const stmts = [db.prepare(UPDATE_IF_STAMP).bind('finals', JSON.stringify(table), now, prevAt)]
  if (post) {
    stmts.push(
      db
        .prepare(`INSERT OR IGNORE INTO kv (k, v, updated_at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM kv WHERE k = 'finals' AND updated_at = ?3)`)
        .bind(`post:${post.id}`, JSON.stringify(post.payload), now),
      db
        .prepare(
          `INSERT OR IGNORE INTO posts (id, event_id, kind, text, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM kv WHERE k = 'finals' AND updated_at = ?5)`,
        )
        .bind(post.id, post.eventId, post.kind, post.text, now),
    )
  }
  const [r] = await db.batch(stmts)
  return (r.meta.changes ?? 0) > 0
}

export async function kvSet(db: D1Database, k: string, value: unknown, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at')
    .bind(k, JSON.stringify(value), now)
    .run()
}

/** カンマ区切りで追記する（読み出し側で [ ] を付ける）。Worker で JSON を parse し直さないため */
export async function kvAppend(db: D1Database, k: string, item: unknown, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(k) DO UPDATE SET v = kv.v || ',' || excluded.v, updated_at = excluded.updated_at`,
    )
    .bind(k, JSON.stringify(item), now)
    .run()
}

export async function putReport(db: D1Database, eventId: number, report: unknown, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO reports (event_id, created_at, body) VALUES (?1, ?2, ?3) ON CONFLICT(event_id) DO UPDATE SET body = excluded.body, created_at = excluded.created_at')
    .bind(eventId, now, JSON.stringify(report))
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
  /** 画像を作るためのデータ（kv の `post:{id}`。JSON 文字列のまま返す） */
  payload: string | null
}

/**
 * 同じ id はもう入っていれば無視する（マイルストーンを二重に出さない）。
 * payload は画像を作るためのデータで、新しく積めたときだけ kv の `post:{id}` に入れる。
 * posts 表に列を足さないのは、マイグレーションを増やさずに済ませるため。
 */
export async function queuePost(
  db: D1Database,
  id: string,
  eventId: number,
  kind: string,
  text: string,
  now: number,
  payload?: unknown,
): Promise<boolean> {
  const insertPost = db
    .prepare('INSERT OR IGNORE INTO posts (id, event_id, kind, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, eventId, kind, text, now)
  if (payload === undefined) {
    const r = await insertPost.run()
    return (r.meta.changes ?? 0) > 0
  }
  // 投稿の行と画像用のデータは1回の batch（＝1つのトランザクション）で書く。
  // 別々に書くと、間で止まったときに画像用のデータの無い投稿ができる（レビュー 2026-09-30）。
  // データは最初に積んだときのものを残す（同じ id の投稿は同じ中身）
  const [, post] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)').bind(`post:${id}`, JSON.stringify(payload), now),
    insertPost,
  ])
  return (post.meta.changes ?? 0) > 0
}

export type PostChannel = 'x' | 'discord'

export async function unsentPosts(db: D1Database, channel: PostChannel): Promise<PostRow[]> {
  const col = channel === 'x' ? 'sent_x_at' : 'sent_discord_at'
  const r = await db
    .prepare(
      `SELECT p.id, p.event_id, p.kind, p.text, p.created_at, p.sent_x_at, p.sent_discord_at, k.v AS payload
       FROM posts p LEFT JOIN kv k ON k.k = 'post:' || p.id
       WHERE p.${col} IS NULL ORDER BY p.created_at LIMIT 20`,
    )
    .all<PostRow>()
  return r.results
}

export async function markPostSent(db: D1Database, id: string, channel: PostChannel, now: number): Promise<boolean> {
  const col = channel === 'x' ? 'sent_x_at' : 'sent_discord_at'
  const r = await db.prepare(`UPDATE posts SET ${col} = ?2 WHERE id = ?1 AND ${col} IS NULL`).bind(id, now).run()
  return (r.meta.changes ?? 0) > 0
}
