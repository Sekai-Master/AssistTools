import { describe, expect, it } from 'vitest'
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
    expect(await res!.json()).toMatchObject({ progress: 0.5, ranks: [{ rank: 50 }] })
  })
})
