import { describe, expect, it } from 'vitest'
import { upsertEvents } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import { MASTER_EVENTS_URL, MASTER_TAIL_BYTES, parseMasterTail, runMasterTail } from '../src/masterTail.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
// 10/31 1:00（日本時間）。222 は 10/30 20:59 に終わり、収集の1時間も過ぎて開催していない
const NOW = Date.UTC(2026, 9, 30, 16, 0, 30)

/** マスタの1件（本物と同じく、1件 十数KB の報酬の表を持つ） */
const masterEvent = (id: number, startAt: number, hours: number, extra: Record<string, unknown> = {}) => ({
  id,
  eventType: 'marathon',
  name: `イベント${id}`,
  assetbundleName: `event_test_${id}`,
  startAt,
  aggregateAt: startAt + hours * H - 1000,
  unit: 'none',
  eventRankingRewardRanges: Array.from({ length: 60 }, (_, i) => ({ id: id * 100 + i, fromRank: i, toRank: i + 1, eventRankingRewards: [{ id: i, seq: 1, resourceBoxId: i, rewardConditionType: 'none' }] })),
  ...extra,
})
// 本物と同じく2文字の字下げで整形した全体。末尾が 223（10/31 15:00 開始）
const LIST = [
  ...Array.from({ length: 20 }, (_, i) => masterEvent(200 + i, Date.UTC(2026, 3, 1 + i * 7), 150)),
  masterEvent(222, Date.UTC(2026, 9, 26, 6), 102),
  masterEvent(223, Date.UTC(2026, 9, 31, 6), 150),
]
const FULL = JSON.stringify(LIST, null, 2)
const tailOf = (s: string, n = MASTER_TAIL_BYTES) => Buffer.from(s).subarray(-n).toString('utf8')

function fetcherOf(body: string, status = 206) {
  const calls: { url: string; range: string | null }[] = []
  let cancelled = false
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), range: new Headers(init?.headers).get('Range') })
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(body))
        c.close()
      },
      cancel() {
        cancelled = true
      },
    })
    return new Response(stream, { status })
  }) as typeof fetch
  return { f, calls, cancelled: () => cancelled }
}

async function envOf() {
  const env: Env = { DB: createD1(), SITE_ORIGIN: 'https://site.example', ADMIN_TOKEN: 'tok' }
  return env
}
const ids = async (env: Env) => (await env.DB.prepare('SELECT id FROM events ORDER BY id').all<{ id: number }>()).results.map((r) => r.id)

describe('マスタの末尾の読み方（parseMasterTail）', () => {
  it('末尾の切れ端は、最初の要素の始まりから後ろを読む（途中で切れた先頭の要素は捨てる）', () => {
    expect(FULL.length).toBeGreaterThan(MASTER_TAIL_BYTES * 3)
    const list = parseMasterTail(tailOf(FULL))
    expect(list?.map((e) => (e as { id: number }).id).slice(-2)).toEqual([222, 223])
    // 全体が届いたときもそのまま読む
    expect(parseMasterTail(FULL)?.length).toBe(LIST.length)
  })

  it('壊れた JSON・途中で切れた末尾・切れ目の無い形（字下げ無し）は null', () => {
    const tail = tailOf(FULL)
    expect(parseMasterTail(tail.replace('"eventType": "marathon"', '"eventType": marathon'))).toBeNull()
    expect(parseMasterTail(tail.slice(0, -30))).toBeNull()
    expect(parseMasterTail(tail.slice(0, -1))).toBeNull()
    expect(parseMasterTail(tailOf(JSON.stringify(LIST)))).toBeNull()
    expect(parseMasterTail('')).toBeNull()
  })
})

describe('マスタの末尾を events に入れる（runMasterTail）', () => {
  it('開催していない間、毎時0〜4分に Range で末尾だけを取り、新しい回を入れる。変わらなければ書かない', async () => {
    const env = await envOf()
    const net = fetcherOf(tailOf(FULL))
    const r = await runMasterTail(env, NOW, net.f)
    expect(net.calls).toEqual([{ url: MASTER_EVENTS_URL, range: `bytes=-${MASTER_TAIL_BYTES}` }])
    // 3日より前に終わった回（200〜219）は parseSchedule が入れない
    expect(r).toEqual({ status: 'checked', events: 2, changed: 2, ids: [222, 223] })
    expect(await ids(env)).toEqual([222, 223])
    const row = await env.DB.prepare('SELECT * FROM events WHERE id = 223').first<Record<string, unknown>>()
    expect(row).toMatchObject({ name: 'イベント223', type: 'marathon', unit: 'none', start_at: Date.UTC(2026, 9, 31, 6), asset: 'event_test_223' })
    // 2回目（1時間後）は値が同じなので書かない
    expect(await runMasterTail(env, NOW + H, fetcherOf(tailOf(FULL)).f)).toEqual({ status: 'checked', events: 2, changed: 0, ids: [222, 223] })
  })

  it('毎時5分以降・開催中は何もしない（マスタも読まない）', async () => {
    const env = await envOf()
    const net = fetcherOf(tailOf(FULL))
    expect(await runMasterTail(env, NOW + 5 * 60_000, net.f)).toEqual({ status: 'idle' })
    await upsertEvents(env.DB, [{ id: 223, name: 'x', eventType: 'marathon', unit: 'none', startAt: NOW - H, aggregateAt: NOW + 100 * H, asset: null }])
    expect(await runMasterTail(env, NOW, net.f)).toEqual({ status: 'idle' })
    expect(net.calls).toEqual([])
  })

  it('Range が効かずに全体（200）が返ったら、本文を読まずに捨てて何も書かない', async () => {
    const env = await envOf()
    const net = fetcherOf(FULL, 200)
    expect(await runMasterTail(env, NOW, net.f)).toMatchObject({ status: 'skip' })
    expect(net.cancelled()).toBe(true)
    expect(await ids(env)).toEqual([])
  })

  it('壊れた JSON・途中で切れた末尾・読めない応答・つながらないときは何も書かない', async () => {
    const tail = tailOf(FULL)
    for (const [name, f] of [
      ['壊れた JSON', fetcherOf(tail.replace(/"name": "イベント223"/, '"name": イベント223')).f],
      ['途中で切れた', fetcherOf(tail.slice(0, -100)).f],
      ['404', fetcherOf('Not Found', 404).f],
      ['つながらない', (async () => Promise.reject(new Error('network'))) as unknown as typeof fetch],
    ] as const) {
      const env = await envOf()
      expect(await runMasterTail(env, NOW, f), name).toMatchObject({ status: 'skip' })
      expect(await ids(env), name).toEqual([])
    }
  })

  it('頼んだより大きく返ってきたら（206 でも）読まない', async () => {
    const env = await envOf()
    expect(await runMasterTail(env, NOW, fetcherOf(tailOf(FULL, MASTER_TAIL_BYTES * 3)).f)).toMatchObject({ status: 'skip', reason: expect.stringContaining('大きすぎる') })
  })
})
