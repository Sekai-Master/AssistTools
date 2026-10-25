import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { announceAt, confirmedFinal, historyMeta, mergeSeed, parseHistory, unknownMemories, type HistoryEvent, type MasterEvent } from './history.ts'

const H = 3_600_000
// 221 Vivid BAD SQUAD Memories（マスタの値そのまま）
const e221: MasterEvent = {
  id: 221,
  name: 'Vivid BAD SQUAD Memories',
  eventType: 'marathon',
  unit: 'none',
  assetbundleName: 'event_memories_vbs_2026',
  startAt: 1792562400000,
  aggregateAt: 1792929599000,
  rankingAnnounceAt: 1792930199000,
}

describe('歴代ボーダーの行', () => {
  it('Memories は種別とユニットを上書きし、日数と時間を出す', () => {
    expect(historyMeta(e221)).toEqual({
      id: 221,
      name: 'Vivid BAD SQUAD Memories',
      asset: 'event_memories_vbs_2026',
      type: 'memories',
      typeLabel: 'Memories',
      unit: 'street',
      start: '2026-10-21',
      days: 5,
      hours: 102,
    })
  })

  it('名前に memories が入るだけの回は普通のマラソン', () => {
    const m = historyMeta({ ...e221, id: 106, name: '君と紡ぐPrecious memories', assetbundleName: 'event_preciousmemories_2023' })
    expect(m?.type).toBe('marathon')
    expect(m?.unit).toBe('none')
  })

  it('ワールドリンクは種別ワールドリンクで入れる。テストの回は対象外。知らない Memories のユニットは上書きしない', () => {
    // ワールドリンクの素材名は Memories の形ではないので、種別は上書きされない
    expect(historyMeta({ ...e221, eventType: 'world_bloom', assetbundleName: 'event_wl_2026' })).toMatchObject({ type: 'world_bloom', typeLabel: 'ワールドリンク' })
    expect(historyMeta({ ...e221, eventType: 'live_battle' })).toBeNull()
    expect(historyMeta({ ...e221, eventType: 'cheerful_carnival', name: '第2回チアフルカーニバルイベントテストイベント' })).toBeNull()
    // 知らない略称の Memories は、マラソンとして確定させずに保留（null）
    expect(historyMeta({ ...e221, assetbundleName: 'event_memories_constructor_2026' })).toBeNull()
    expect(unknownMemories({ ...e221, assetbundleName: 'event_memories_xyz_2027' })).toBe(true)
    expect(unknownMemories(e221)).toBe(false)
  })

  it('確定値は順位発表より後の点だけ（199 は 20:57 で止まっていた）', () => {
    expect(announceAt(e221)).toBe(e221.aggregateAt + 600_000)
    expect(confirmedFinal([[e221.aggregateAt - 3 * 60_000, 100]], e221)).toBeNull()
    expect(confirmedFinal([[e221.rankingAnnounceAt as number, 100]], e221)).toBeNull()
    expect(confirmedFinal([[e221.aggregateAt + 0.25 * H, 100]], e221)).toBe(100)
    expect(confirmedFinal([], e221)).toBeNull()
  })

  it('種の表: 読めない行・重複が無い。ワールドリンク以外は 50・100・1000位が揃い、ほかの順位は 6順位の中だけ', () => {
    const raw = JSON.parse(fs.readFileSync(new URL('./data/finals-seed.json', import.meta.url), 'utf8')) as { events: unknown[] }
    const seed = parseHistory(raw)
    expect(seed.length).toBe(raw.events.length)
    expect(new Set(seed.map((e) => e.id)).size).toBe(seed.length)
    const six = ['50', '100', '200', '500', '1000', '2000']
    for (const e of seed) {
      for (const r of Object.keys(e.finals)) expect(six, `${e.id}:${r}`).toContain(r)
      if (e.type !== 'world_bloom') for (const r of ['50', '100', '1000']) expect(e.finals[r], `${e.id}:${r}`).toBeGreaterThan(0)
    }
    expect(seed.some((e) => e.name.includes('テストイベント'))).toBe(false)
    expect(seed.some((e) => e.type === 'world_bloom')).toBe(true)
  })

  it('種の書き足し: 無い回と無い順位だけ足し、既にある値は変えない。種に無い回は残す', () => {
    const row = (id: number, finals: Record<string, number>, extra: Partial<HistoryEvent> = {}): HistoryEvent => ({
      id,
      name: `e${id}`,
      asset: null,
      type: 'marathon',
      typeLabel: 'マラソン',
      unit: 'none',
      start: '2026-01-01',
      days: 9,
      hours: 198,
      finals,
      sources: Object.fromEntries(Object.keys(finals).map((k) => [k, 'x'])),
      ...extra,
    })
    const stored = [row(1, { '50': 10 }), row(300, { '50': 7 })]
    const seed = [row(1, { '50': 99, '200': 5 }), row(2, { '50': 3 }, { type: 'world_bloom', typeLabel: 'ワールドリンク' })]
    const { events, changed } = mergeSeed(stored, seed)
    expect(changed).toBe(2)
    expect(events.map((e) => e.id)).toEqual([1, 2, 300])
    expect(events[0].finals).toEqual({ '50': 10, '200': 5 })
    expect(events[1].type).toBe('world_bloom')
    expect(mergeSeed(events, seed).changed).toBe(0)
    expect(mergeSeed([], seed).events).toHaveLength(2)
  })

  it('表の読み取りは壊れた行を捨てる', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory({ events: [null, { id: 'x' }, { id: 1, finals: {} }] })).toHaveLength(1)
  })
})
