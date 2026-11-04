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
