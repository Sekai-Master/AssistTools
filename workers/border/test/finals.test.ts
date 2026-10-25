import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../src/api.ts'
import { parseSchedule } from '../src/collect.ts'
import { kvGet, kvGetStamped, kvSet, putFinalsIfUnchanged, unsentPosts, upsertEvents } from '../src/db.ts'
import { FINALS_CRON } from '../src/index.ts'
import type { Env } from '../src/env.ts'
import { FINALS_GIVE_UP_MS, endOf, runFinals } from '../src/finals.ts'
import type { EventMeta } from '../src/model.ts'
import { createD1 } from './d1shim.ts'

const M = 60_000
// 222 は 21:00 終了（集計 20:59:59）。順位発表は集計の10分後
const AGG = Date.UTC(2026, 10, 3, 11, 59, 59)
const EV: EventMeta = { id: 222, name: '次の回', eventType: 'marathon', unit: 'idol', startAt: AGG - 198 * 60 * M, aggregateAt: AGG, asset: 'event_next_2026' }
const SEED_ROW = { id: 1, name: '一番星', asset: null, type: 'marathon', typeLabel: 'マラソン', unit: 'none', start: '2020-10-09', days: 10, hours: 222, finals: { '50': 1 }, sources: { '50': 'x' } }

function liveBody(eventId: number, ts: number) {
  const ranks = [50, 100, 200, 500, 1000, 2000, 5000]
  return {
    data: {
      eventRankings: ranks.map((rank) => ({ eventId, rank, score: String(1e9 / rank), timestamp: new Date(ts).toISOString(), userName: '第三者' })),
    },
  }
}

async function setup(ev: EventMeta = EV, withTable = true) {
  const env: Env = { DB: createD1(), SITE_ORIGIN: 'https://site.example' }
  await upsertEvents(env.DB, [ev])
  if (withTable) await kvSet(env.DB, 'finals', { events: [SEED_ROW], updatedAt: 0 }, 0)
  let calls = 0
  const fetcher = (live: unknown) =>
    (async () => {
      calls++
      return Response.json(live)
    }) as unknown as typeof fetch
  return { env, fetcher, calls: () => calls }
}

const tableOf = async (env: Env) => (JSON.parse((await kvGet(env.DB, 'finals')) as string) as { events: { id: number; type: string; finals: Record<string, number> }[] }).events

describe('終わった直後の回を歴代の表へ（finals.ts）', () => {
  it('終了から15分で、確定後の点を表に足し、終了20分後の時刻付きで投稿を積む', async () => {
    const { env, fetcher } = await setup()
    const r = await runFinals(env, endOf(AGG) + 15 * M, fetcher(liveBody(222, AGG + 13 * M)))
    expect(r).toEqual({ status: 'added', eventId: 222, queued: true })
    const row = (await tableOf(env)).find((e) => e.id === 222)
    expect(row?.finals).toEqual({ '50': 2e7, '100': 1e7, '200': 5e6, '500': 2e6, '1000': 1e6, '2000': 5e5 })
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.id).toBe('222:history')
    expect(JSON.parse(post.payload as string)).toEqual({ kind: 'history', eventId: 222, postAt: Date.UTC(2026, 10, 3, 12, 20) })
    expect(post.text).toContain('https://site.example/border/history?event=222')
  })

  it('終了から15分より前と、3時間より後は何もしない（D1 を1回引くだけ）', async () => {
    const { env, fetcher, calls } = await setup()
    expect(await runFinals(env, endOf(AGG) + 14 * M, fetcher(liveBody(222, AGG + 13 * M)))).toEqual({ status: 'idle' })
    expect(await runFinals(env, AGG + FINALS_GIVE_UP_MS, fetcher(liveBody(222, AGG + 13 * M)))).toEqual({ status: 'idle' })
    expect(calls()).toBe(0)
  })

  it('順位発表より前の点・別の回の live なら待つ（表も投稿も変えない）', async () => {
    const { env, fetcher } = await setup()
    expect((await runFinals(env, endOf(AGG) + 15 * M, fetcher(liveBody(222, AGG + 10 * M)))).status).toBe('waiting')
    expect((await runFinals(env, endOf(AGG) + 15 * M, fetcher(liveBody(223, AGG + 13 * M)))).status).toBe('waiting')
    expect((await tableOf(env)).map((e) => e.id)).toEqual([1])
    expect(await unsentPosts(env.DB, 'x')).toEqual([])
  })

  it('表に入っている回は取りに行かない。表がまだ無ければ作らない（種は解析ジョブが入れる）', async () => {
    const a = await setup()
    await runFinals(a.env, endOf(AGG) + 15 * M, a.fetcher(liveBody(222, AGG + 13 * M)))
    expect((await runFinals(a.env, endOf(AGG) + 20 * M, a.fetcher(liveBody(222, AGG + 13 * M)))).status).toBe('skip')
    expect(a.calls()).toBe(1)
    const b = await setup(EV, false)
    expect(await runFinals(b.env, endOf(AGG) + 15 * M, b.fetcher(liveBody(222, AGG + 13 * M)))).toMatchObject({ status: 'skip', reason: '表がまだ無い' })
    expect(await kvGet(b.env.DB, 'finals')).toBeNull()
  })

  it('ワールドリンクは表に足すが投稿は積まない。Memories は素材名で種別を上書き', async () => {
    const wl = await setup({ ...EV, eventType: 'world_bloom', asset: 'event_wl_2026' })
    expect(await runFinals(wl.env, endOf(AGG) + 15 * M, wl.fetcher(liveBody(222, AGG + 13 * M)))).toEqual({ status: 'added', eventId: 222, queued: false })
    expect((await tableOf(wl.env)).find((e) => e.id === 222)?.type).toBe('world_bloom')
    expect(await unsentPosts(wl.env.DB, 'x')).toEqual([])
    const mem = await setup({ ...EV, unit: 'none', asset: 'event_memories_vbs_2027' })
    await runFinals(mem.env, endOf(AGG) + 15 * M, mem.fetcher(liveBody(222, AGG + 13 * M)))
    expect((await tableOf(mem.env)).find((e) => e.id === 222)?.type).toBe('memories')
  })

  it('日程の素材名は URL に使える文字だけ通し、イベントの表に入る', async () => {
    const [ok, bad] = parseSchedule({ events: [{ ...EV, type: 'marathon', asset: 'event_next_2026' }, { ...EV, id: 223, type: 'marathon', asset: '../x' }] }, AGG)
    expect(ok.asset).toBe('event_next_2026')
    expect(bad.asset).toBeNull()
  })
})

describe('見回りの守り（#159 レビュー）', () => {
  it('素材名が無い回は足さずに待つ（Memories をマラソンとして入れない）', async () => {
    const { env, fetcher, calls } = await setup({ ...EV, asset: null })
    expect(await runFinals(env, endOf(AGG) + 15 * M, fetcher(liveBody(222, AGG + 13 * M)))).toMatchObject({ status: 'waiting', reason: '素材名がまだ無い' })
    expect(calls()).toBe(0)
  })

  it('live が読めない・失敗なら待つ', async () => {
    const { env } = await setup()
    const boom = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect((await runFinals(env, endOf(AGG) + 15 * M, boom)).status).toBe('waiting')
    const bad = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch
    expect(await runFinals(env, endOf(AGG) + 15 * M, bad)).toMatchObject({ status: 'waiting', reason: 'live 503' })
  })

  it('読んだあとに表が書き換わっていたら、表も投稿も書かない', async () => {
    const { env } = await setup()
    const before = await kvGetStamped(env.DB, 'finals')
    await kvSet(env.DB, 'finals', { events: [SEED_ROW], updatedAt: 5 }, 5)
    const post = { id: '222:history', eventId: 222, kind: 'history', text: 't', payload: { kind: 'history', eventId: 222 } }
    expect(await putFinalsIfUnchanged(env.DB, { events: [] }, before?.at ?? -1, 10, post)).toBe(false)
    expect((await kvGetStamped(env.DB, 'finals'))?.at).toBe(5)
    expect(await unsentPosts(env.DB, 'x')).toEqual([])
    expect(await putFinalsIfUnchanged(env.DB, { events: [] }, 5, 10, post)).toBe(true)
    expect((await unsentPosts(env.DB, 'x')).map((p) => p.id)).toEqual(['222:history'])
  })

  it('管理 API の表の書き込みは、読んだときの更新時刻と違えば 409', async () => {
    const { env } = await setup()
    env.ADMIN_TOKEN = 'tok'
    const put = (expectUpdatedAt?: number) =>
      handleRequest(
        new Request('https://w/admin/finals', {
          method: 'PUT',
          headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: [SEED_ROW], expectUpdatedAt }),
        }),
        env,
      )
    expect((await put(12345)).status).toBe(409)
    expect((await put(0)).status).toBe(200)
    expect((await put()).status).toBe(200)
  })

  it('見回りの Cron の文字列は wrangler.jsonc と同じ', () => {
    const conf = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    expect(conf).toContain(`"${FINALS_CRON}"`)
  })
})
