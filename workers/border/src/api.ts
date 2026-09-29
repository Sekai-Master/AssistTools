/**
 * Worker の HTTP 入口。
 *   - /v1/border/*  公開の読み出し（中身は public.ts。サイトは Pages Functions 経由で同じものを読む）
 *   - /admin/*      解析ジョブ・Bot 用（Bearer トークン必須）
 */
import { runCron } from './collect.ts'
import {
  allShapes,
  markPostSent,
  predictionsFor,
  putModel,
  putReport,
  queuePost,
  reportedEventIds,
  unsentPosts,
  upsertShapes,
  type PostChannel,
} from './db.ts'
import type { Env } from './env.ts'
import { GRID, type Model, type Shape } from './model.ts'
import { publicBorderResponse } from './public.ts'

const MAX_BODY_BYTES = 2_000_000

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

function error(message: string, status: number): Response {
  return json({ error: message }, status)
}

function authorized(req: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN
  const header = req.headers.get('Authorization') ?? ''
  if (!token || !header.startsWith('Bearer ')) return false
  const enc = new TextEncoder()
  const a = enc.encode(header.slice(7))
  const b = enc.encode(token)
  if (a.byteLength !== b.byteLength) return false
  // 比較にかかる時間から一致位置を推測されないよう、途中で抜けずに全バイト見る
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function readBody(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? '0')
  if (len > MAX_BODY_BYTES) throw new Error('body too large')
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new Error('body too large')
  return JSON.parse(text) as unknown
}

function isShare(x: unknown): x is (number | null)[] {
  return Array.isArray(x) && x.length === GRID.length && x.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)))
}

export function parseShapes(body: unknown): Shape[] | null {
  if (!isRecord(body) || !Array.isArray(body.shapes)) return null
  const out: Shape[] = []
  for (const s of body.shapes) {
    if (!isRecord(s)) return null
    const { eventId, rank, final, share } = s
    if (typeof eventId !== 'number' || typeof rank !== 'number' || typeof final !== 'number' || !(final > 0) || !isShare(share)) return null
    out.push({ eventId, rank, final, share })
  }
  return out
}

function isModel(x: unknown): x is Model {
  if (!isRecord(x) || typeof x.version !== 'string' || !isRecord(x.ranks) || !Array.isArray(x.grid)) return false
  return Object.values(x.ranks).every(
    (r) => isRecord(r) && typeof r.minProgress === 'number' && isRecord(r.tables) && isRecord(r.band) && Object.values(r.tables).every(isShare),
  )
}

async function adminRoute(req: Request, env: Env, url: URL): Promise<Response> {
  if (!authorized(req, env)) return error('unauthorized', 401)
  const path = url.pathname
  const now = Date.now()

  if (path === '/admin/shapes' && req.method === 'GET') return json({ shapes: await allShapes(env.DB) })

  if (path === '/admin/shapes' && req.method === 'PUT') {
    const shapes = parseShapes(await readBody(req))
    if (!shapes) return error('shapes の形が不正', 400)
    await upsertShapes(env.DB, shapes, now)
    return json({ ok: true, count: shapes.length })
  }

  if (path === '/admin/model' && req.method === 'PUT') {
    const body = await readBody(req)
    if (!isRecord(body) || !isModel(body.model) || !isRecord(body.summary)) return error('model の形が不正', 400)
    const changed = await putModel(env.DB, body.model.version, JSON.stringify(body.model), JSON.stringify(body.summary), now)
    return json({ ok: true, version: body.model.version, changed })
  }

  if (path === '/admin/predictions' && req.method === 'GET') {
    const eventId = Number(url.searchParams.get('event'))
    if (!Number.isInteger(eventId) || eventId <= 0) return error('event が不正', 400)
    return json({ predictions: await predictionsFor(env.DB, eventId) })
  }

  if (path === '/admin/reports' && req.method === 'GET') return json({ eventIds: await reportedEventIds(env.DB) })

  if (path === '/admin/reports' && req.method === 'PUT') {
    const body = await readBody(req)
    if (!isRecord(body) || typeof body.eventId !== 'number' || !isRecord(body.report)) return error('report の形が不正', 400)
    await putReport(env.DB, body.eventId, JSON.stringify(body.report), now)
    return json({ ok: true })
  }

  if (path === '/admin/posts' && req.method === 'PUT') {
    const body = await readBody(req)
    if (!isRecord(body) || typeof body.id !== 'string' || typeof body.eventId !== 'number' || typeof body.kind !== 'string' || typeof body.text !== 'string') {
      return error('post の形が不正', 400)
    }
    const queued = await queuePost(env.DB, body.id, body.eventId, body.kind, body.text, now)
    return json({ ok: true, queued })
  }

  if (path === '/admin/posts' && req.method === 'GET') {
    const channel = url.searchParams.get('unsent')
    if (channel !== 'x' && channel !== 'discord') return error('unsent は x か discord', 400)
    return json({ posts: await unsentPosts(env.DB, channel) })
  }

  if (path === '/admin/posts/sent' && req.method === 'POST') {
    const body = await readBody(req)
    if (!isRecord(body) || typeof body.id !== 'string' || (body.channel !== 'x' && body.channel !== 'discord')) return error('id / channel が不正', 400)
    return json({ ok: true, marked: await markPostSent(env.DB, body.id, body.channel as PostChannel, now) })
  }

  if (path === '/admin/cron' && req.method === 'POST') {
    return json(await runCron(env, now))
  }

  return error('not found', 404)
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  try {
    if (url.pathname.startsWith('/admin/')) return await adminRoute(req, env, url)
    if (req.method !== 'GET') return error('method not allowed', 405)
    if (url.pathname.startsWith('/v1/border/')) {
      const res = await publicBorderResponse(env.DB, url.pathname.slice('/v1/border'.length))
      if (res) return res
    }
    return error('not found', 404)
  } catch (err) {
    console.error('request failed', url.pathname, err)
    const status = err instanceof SyntaxError || (err instanceof Error && err.message === 'body too large') ? 400 : 500
    return error(status === 400 ? 'リクエストの形が不正' : '内部エラー', status)
  }
}
