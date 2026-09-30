import { beforeEach, describe, expect, it } from 'vitest'
import { handleRequest } from '../src/api.ts'
import { parseLive, parseSchedule, runCron } from '../src/collect.ts'
import { putModel } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import { GRID, type Model } from '../src/model.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const START = Date.UTC(2026, 9, 1, 6, 0) // 2026-10-01 15:00 JST
const EVENT = { id: 219, name: 'テストイベント', type: 'marathon', unit: 'none', startAt: START, aggregateAt: START + 150 * H - 60_000 }

function liveBody(eventId: number, ts: number, scale: number) {
  const ranks = [50, 100, 200, 500, 1000, 2000, 5000]
  return {
    status: 'success',
    data: {
      eventRankings: [
        ...ranks.map((rank) => ({ eventId, rank, score: String(Math.round((scale * 1e8) / rank)), timestamp: new Date(ts).toISOString(), userName: '第三者' })),
        null,
      ],
    },
  }
}

function fakeFetch(live: () => unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/CardDatas/bonuses.json')) return Response.json({ events: [EVENT, { id: 1, startAt: 0, aggregateAt: 1 }] })
    if (url.includes('/event/live')) return Response.json(live())
    return new Response('nf', { status: 404 })
  }) as typeof fetch
}

const linear: Model = {
  version: 'test@e1',
  createdAt: '',
  algorithm: 'share-median-v1',
  grid: [...GRID],
  ranks: Object.fromEntries(
    [50, 100, 200, 500, 1000, 2000].map((r) => [
      String(r),
      {
        candidate: 'same_all',
        minProgress: r <= 100 ? 0.9 : 0.04,
        tables: { all: GRID.map((p) => p) },
        band: { lo: GRID.map(() => -0.04), hi: GRID.map(() => 0.03) },
      },
    ]),
  ),
}

let env: Env

beforeEach(() => {
  env = { DB: createD1(), ADMIN_TOKEN: 'secret-token', SITE_ORIGIN: 'https://sekaimaster.pages.dev' }
})

describe('parseLive / parseSchedule', () => {
  it('目的の順位だけ取り、第三者の情報は持たない', () => {
    const { eventId, samples } = parseLive(liveBody(219, START + H, 1))
    expect(eventId).toBe(219)
    expect(samples.map((s) => s.rank)).toEqual([50, 100, 200, 500, 1000, 2000])
    expect(Object.keys(samples[0]).sort()).toEqual(['rank', 'score', 'ts'])
  })

  it('壊れた入力でも落ちない', () => {
    expect(parseLive(null).samples).toEqual([])
    expect(parseLive({ data: { eventRankings: 123 } }).samples).toEqual([])
    expect(parseSchedule({ events: [null, { id: 'x' }] }, START)).toEqual([])
  })
})

describe('runCron', () => {
  it('開催中でなければ日程だけ読み直して何もしない', async () => {
    const r = await runCron(env, START - 10 * H, fakeFetch(() => liveBody(219, START, 1)))
    expect(r.status).toBe('idle')
  })

  it('開催中は実測を保存し、有効なモデルで予測してマイルストーンを1回だけ積む', async () => {
    await putModel(env.DB, linear, { version: 'test@e1' }, 0)
    // 経過率 76/150 ≈ 0.507（最初のマイルストーン 0.5 をまたぐ）
    let t = START + 76 * H
    const f = fakeFetch(() => liveBody(219, t, (t - START) / (150 * H)))
    const r1 = await runCron(env, t + 5 * 60_000, f)
    expect(r1).toMatchObject({ status: 'collected', eventId: 219, samples: 6, predictions: 6, stale: false })
    expect(r1.status === 'collected' && r1.queued).toEqual(['219:p50'])

    // 同じサンプルが返ってきた（sekai.best が止まった）ときは予測を積み増さない
    const r2 = await runCron(env, t + 35 * 60_000, f)
    expect(r2).toMatchObject({ status: 'collected', stale: true, queued: [] })

    t = START + 80 * H
    const r3 = await runCron(env, t + 5 * 60_000, f)
    expect(r3.status === 'collected' && r3.queued).toEqual([])

    const cur = await (await handleRequest(new Request('https://w/v1/border/current'), env)).json() as {
      progress: number
      ranks: { rank: number; predicted: number; low: number; high: number; visible: boolean }[]
    }
    const r1000 = cur.ranks.find((r) => r.rank === 1000)
    // 線形の形なので終値の予測は 1e8/1000 = 100,000
    expect(r1000?.predicted).toBeCloseTo(100_000, -2)
    expect(r1000?.low).toBeLessThan(100_000)
    expect(r1000?.high).toBeGreaterThan(100_000)
    expect(cur.ranks.find((r) => r.rank === 50)?.visible).toBe(false)

    const hist = await (await handleRequest(new Request('https://w/v1/border/events/219/history'), env)).json() as { rows: unknown[] }
    expect(hist.rows).toHaveLength(2)
  })

  it('開始24時間のポストを積み、画像用のデータ（payload）が投稿キューと一緒に取れる', async () => {
    await putModel(env.DB, linear, { version: 'test@e1' }, 0)
    const t = START + 25 * H
    const r = await runCron(env, t + 5 * 60_000, fakeFetch(() => liveBody(219, t, 25 / 150)))
    expect(r.status === 'collected' && r.queued).toEqual(['219:h24'])
    const req = new Request('https://w/admin/posts?unsent=x', { headers: { Authorization: 'Bearer secret-token' } })
    const body = (await (await handleRequest(req, env)).json()) as { posts: { id: string; text: string; payload: string }[] }
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].text).toContain('（開始24時間）')
    const payload = JSON.parse(body.posts[0].payload) as { kind: string; key: string; snapshot: { ranks: { rank: number; confidence: string | null }[] } }
    expect(payload.kind).toBe('milestone')
    expect(payload.key).toBe('h24')
    expect(payload.snapshot.ranks.find((x) => x.rank === 1000)?.confidence).toBe('high')
  })

  it('節目を大きく過ぎてから動き出したときは、その節目のポストを出さない', async () => {
    await putModel(env.DB, linear, { version: 'test@e1' }, 0)
    const t = START + 40 * H // 24h の節目（0.16）から 0.1 以上過ぎている
    const r = await runCron(env, t + 5 * 60_000, fakeFetch(() => liveBody(219, t, 40 / 150)))
    expect(r.status === 'collected' && r.queued).toEqual([])
  })

  it('live が別イベントを返したら何も書かない', async () => {
    await runCron(env, START - 10 * H, fakeFetch(() => ({})))
    const r = await runCron(env, START + H, fakeFetch(() => liveBody(218, START + H, 1)))
    expect(r).toEqual({ status: 'event_mismatch', expected: 219, got: 218 })
  })
})

describe('API', () => {
  const adminReq = (path: string, init: RequestInit = {}, token = 'secret-token') =>
    new Request(`https://w${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })

  it('管理 API はトークンが違えば 401', async () => {
    expect((await handleRequest(adminReq('/admin/shapes', {}, 'wrong-token!'), env)).status).toBe(401)
    expect((await handleRequest(new Request('https://w/admin/shapes'), env)).status).toBe(401)
  })

  it('形の投入は型を確かめ、壊れていれば 400', async () => {
    const bad = await handleRequest(adminReq('/admin/shapes', { method: 'PUT', body: JSON.stringify({ shapes: [{ eventId: 1, rank: 1000, final: 1, share: [1] }] }) }), env)
    expect(bad.status).toBe(400)
    const nul = await handleRequest(adminReq('/admin/shapes', { method: 'PUT', body: 'null' }), env)
    expect(nul.status).toBe(400)
    const ok = await handleRequest(
      adminReq('/admin/shapes', { method: 'PUT', body: JSON.stringify({ shapes: [{ eventId: 1, rank: 1000, final: 5, share: GRID.map((p) => p) }] }) }),
      env,
    )
    expect(ok.status).toBe(200)
    const got = (await (await handleRequest(adminReq('/admin/shapes'), env)).json()) as { shapes: unknown[] }
    expect(got.shapes).toHaveLength(1)
  })

  it('日程を管理 API で入れると、Cron がそのイベントを開催中として拾う', async () => {
    const put = await handleRequest(adminReq('/admin/events', { method: 'PUT', body: JSON.stringify({ events: [EVENT, { id: 'x' }, null] }) }), env)
    expect(await put.json()).toMatchObject({ ok: true, count: 1 })
    // bonuses.json を返さない fetch でも、日程が入っていれば収集する
    const r = await runCron(env, START + H, (async (input: RequestInfo | URL) =>
      String(input).includes('/event/live') ? Response.json(liveBody(219, START + H, 0.01)) : new Response('gone', { status: 500 })) as typeof fetch)
    expect(r).toMatchObject({ status: 'collected', eventId: 219 })
  })

  it('同じ版のモデルは入れ直さない', async () => {
    const put = () => handleRequest(adminReq('/admin/model', { method: 'PUT', body: JSON.stringify({ model: linear, summary: { version: linear.version } }) }), env)
    expect(await (await put()).json()).toMatchObject({ changed: true })
    expect(await (await put()).json()).toMatchObject({ changed: false })
    const tr = (await (await handleRequest(new Request('https://w/v1/border/track-record'), env)).json()) as { model: { version: string } }
    expect(tr.model.version).toBe(linear.version)
  })

  it('公開 API は文字列を連結して返すが、入れる側で必ず JSON にするので壊れない', async () => {
    const evil = 'x"]},{"injected":true,"a":["'
    await handleRequest(adminReq('/admin/reports', { method: 'PUT', body: JSON.stringify({ eventId: 219, report: { name: evil } }) }), env)
    const res = await handleRequest(new Request('https://w/v1/border/track-record'), env)
    const body = JSON.parse(await res.text()) as { reports: { name: string }[] }
    expect(body.reports).toEqual([{ name: evil }])
  })

  it('投稿キュー: チャンネルごとに送信済みを付ける', async () => {
    await handleRequest(adminReq('/admin/posts', { method: 'PUT', body: JSON.stringify({ id: '219:result', eventId: 219, kind: 'result', text: 'x' }) }), env)
    const list = async (ch: string) => ((await (await handleRequest(adminReq(`/admin/posts?unsent=${ch}`), env)).json()) as { posts: unknown[] }).posts
    expect(await list('x')).toHaveLength(1)
    await handleRequest(adminReq('/admin/posts/sent', { method: 'POST', body: JSON.stringify({ id: '219:result', channel: 'x' }) }), env)
    expect(await list('x')).toHaveLength(0)
    expect(await list('discord')).toHaveLength(1)
  })

  it('公開の読み出しは GET だけ・存在しないパスは 404', async () => {
    expect((await handleRequest(new Request('https://w/v1/border/current', { method: 'POST' }), env)).status).toBe(405)
    expect((await handleRequest(new Request('https://w/v1/border/nope'), env)).status).toBe(404)
    expect((await handleRequest(new Request('https://w/v1/border/current'), env)).status).toBe(404)
  })
})
