import { describe, expect, it, vi } from 'vitest'
import { kvSet, upsertEvents } from '../src/db.ts'
import { publicBorderResponse } from '../src/public.ts'
import { createD1 } from './d1shim.ts'

const EVENT = { id: 223, name: 'テストイベント', eventType: 'marathon', unit: 'school_refusal', startAt: 0, aggregateAt: 1, asset: 'event_someday_2026' }

async function current(db: D1Database) {
  const res = await publicBorderResponse(db, '/current')
  return (await res!.json()) as { event: { id: number; asset?: string | null }; ranks: unknown[] }
}

/**
 * トップの開催中のイベントにロゴを出すため、current に素材名（/CardDatas/logo/<asset>.webp）を足す。
 * kv の current は Worker が30分ごとに組むので、Worker を出し直さなくても読み出しの側で足せるようにしている。
 */
describe('current のロゴの素材名', () => {
  it('kv の行に無ければ events から足す', async () => {
    const db = createD1()
    await upsertEvents(db, [EVENT])
    await kvSet(db, 'current', { event: { id: 223, name: 'テストイベント' }, ranks: [] }, 0)

    expect((await current(db)).event.asset).toBe('event_someday_2026')
  })

  it('events に素材名が無い回は null', async () => {
    const db = createD1()
    await upsertEvents(db, [{ ...EVENT, asset: null }])
    await kvSet(db, 'current', { event: { id: 223, name: 'テストイベント' }, ranks: [] }, 0)

    expect((await current(db)).event.asset).toBeNull()
  })

  it('kv の行が既に素材名を持っていれば、そのまま返す', async () => {
    const db = createD1()
    await upsertEvents(db, [EVENT])
    await kvSet(db, 'current', { event: { id: 223, name: 'テストイベント', asset: 'kv_side' }, ranks: [] }, 0)

    expect((await current(db)).event.asset).toBe('kv_side')
  })

  it('ほかの中身とキャッシュの指定は変えない', async () => {
    const db = createD1()
    await upsertEvents(db, [EVENT])
    await kvSet(db, 'current', { event: { id: 223, name: 'テストイベント' }, progress: 0.5, ranks: [{ rank: 50 }] }, 0)

    const res = await publicBorderResponse(db, '/current')
    expect(res!.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(await res!.json()).toEqual({ event: { id: 223, name: 'テストイベント', asset: 'event_someday_2026' }, progress: 0.5, ranks: [{ rank: 50 }] })
  })

  it('kv の行の素材名が null なら、引き直さずに null のまま', async () => {
    const db = createD1()
    await upsertEvents(db, [EVENT])
    await kvSet(db, 'current', { event: { id: 223, name: 'テストイベント', asset: null }, ranks: [] }, 0)

    expect((await current(db)).event.asset).toBeNull()
  })

  it('events にその回の行が無ければ null', async () => {
    const db = createD1()
    await kvSet(db, 'current', { event: { id: 999, name: '未登録' }, ranks: [] }, 0)

    expect((await current(db)).event.asset).toBeNull()
  })
})

/**
 * ★ 足すのはロゴのためだけ。足せないときに予測そのものを落とさない（ロゴが出ないだけにする）。
 */
describe('current の素材名を足せないとき', () => {
  const body = { event: { id: 223, name: 'テストイベント' }, progress: 0.5, ranks: [{ rank: 50 }] }
  vi.spyOn(console, 'error').mockImplementation(() => {})

  it('events に asset の列が無くても、元の中身を返す', async () => {
    const db = createD1()
    await upsertEvents(db, [EVENT])
    await db.prepare('ALTER TABLE events DROP COLUMN asset').run()
    await kvSet(db, 'current', body, 0)

    const res = await publicBorderResponse(db, '/current')
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual(body)
  })

  it('D1 が投げても、元の中身を返す', async () => {
    const db = createD1()
    await kvSet(db, 'current', body, 0)
    const failing = {
      prepare: (sql: string) => {
        if (sql.includes('FROM events')) throw new Error('D1 が落ちた')
        return db.prepare(sql)
      },
    } as unknown as D1Database

    const res = await publicBorderResponse(failing, '/current')
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual(body)
  })

  it('kv の行が壊れていても、そのまま返す', async () => {
    const db = createD1()
    await db.prepare('INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)').bind('current', '{broken', 0).run()

    const res = await publicBorderResponse(db, '/current')
    expect(res!.status).toBe(200)
    expect(await res!.text()).toBe('{broken')
  })
})

/**
 * サイトの「イベ乙までに、あと合計何分休めば」の行が、回が終わってから次の回が始まるまでのあいだに使う次の回（/upcoming）。
 * ★ 次の回は今の回が終わってから返す。2 つ先の回・マラソンでない回は返さない。読むのは kv の current と events のこれからの回だけ
 */
describe('/upcoming', () => {
  const H = 3_600_000
  // 226 は 11/24 20:59:59 JST に集計、227 は 11/25 15:00〜11/29 20:59:59 JST
  const E226 = { id: 226, name: 'ワンダーランズ×ショウタイム Memories', eventType: 'marathon', unit: 'none', startAt: 1795154400000, aggregateAt: 1795521599000, asset: null }
  const E227 = { id: 227, name: 'Leo/need Memories', eventType: 'marathon', unit: 'light_sound', startAt: 1795586400000, aggregateAt: 1796043599000, asset: null }
  const E228 = { id: 228, name: '次の次', eventType: 'marathon', unit: 'idol', startAt: 1796191200000, aggregateAt: 1796734799000, asset: null }
  const TONIGHT = E226.aggregateAt + H // 11/24 21:59 JST

  async function setup(events: (typeof E226)[], currentEvent: typeof E226 = E226) {
    const db = createD1()
    await upsertEvents(db, events)
    const { id, name, startAt, aggregateAt } = currentEvent
    await kvSet(db, 'current', { event: { id, name, startAt, aggregateAt, durationHours: 102 }, ranks: [] }, 0)
    return db
  }
  async function upcoming(db: D1Database, now: number) {
    const res = await publicBorderResponse(db, '/upcoming', now)
    return { status: res!.status, cache: res!.headers.get('Cache-Control'), body: (await res!.json()) as { event?: unknown } }
  }

  it('今の回が終わっていて次の回があれば、次の回（id・名前・期間）。キャッシュ 5 分', async () => {
    const db = await setup([E226, E227, E228])
    const r = await upcoming(db, TONIGHT)
    expect(r.status).toBe(200)
    expect(r.cache).toBe('public, max-age=300')
    expect(r.body).toEqual({ event: { id: 227, name: 'Leo/need Memories', startAt: E227.startAt, aggregateAt: E227.aggregateAt } })
  })

  it('今の回が集計前なら今の回（次の回は今の回が終わるまで出さない）', async () => {
    const db = await setup([E226, E227])
    const r = await upcoming(db, E226.aggregateAt - H)
    expect(r.body).toEqual({ event: { id: 226, name: E226.name, startAt: E226.startAt, aggregateAt: E226.aggregateAt } })
  })

  it('次の回が無い（終わった回だけ）なら 404', async () => {
    const db = await setup([E226])
    const r = await upcoming(db, TONIGHT)
    expect(r.status).toBe(404)
    expect(r.cache).toBe('public, max-age=300')
  })

  it('次の回がマラソンでなければ 404（その先の回は返さない）', async () => {
    const cc = { ...E227, eventType: 'cheerful_carnival' }
    const db = await setup([E226, cc, E228])
    expect((await upcoming(db, TONIGHT)).status).toBe(404)
  })

  it('次の回が始まっていて current がまだ前の回でも、次の回を返す', async () => {
    const db = await setup([E226, E227])
    const r = await upcoming(db, E227.startAt + 10 * 60_000)
    expect((r.body.event as { id: number }).id).toBe(227)
  })

  it('kv の current が無い・壊れていれば 404', async () => {
    const db = createD1()
    await upsertEvents(db, [E226, E227])
    expect((await upcoming(db, TONIGHT)).status).toBe(404)
    await db.prepare('INSERT INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)').bind('current', '{broken', 0).run()
    expect((await upcoming(db, TONIGHT)).status).toBe(404)
  })

  it('events は主キーの範囲（今の回より後）だけを読む', async () => {
    const db = await setup([E226, E227])
    const sqls: string[] = []
    const spy = { prepare: (sql: string) => (sqls.push(sql), db.prepare(sql)) } as unknown as D1Database
    await upcoming(spy, TONIGHT)
    const ev = sqls.filter((s) => s.includes('FROM events'))
    expect(ev).toHaveLength(1)
    expect(ev[0]).toContain('id > ?1')
  })
})
