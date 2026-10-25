import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { announceAt, confirmedFinal, historyMeta, parseHistory, unknownMemories, type MasterEvent } from './history.ts'

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

  it('ワールドリンクとテストの回は対象外。知らない Memories のユニットは上書きしない', () => {
    expect(historyMeta({ ...e221, eventType: 'world_bloom' })).toBeNull()
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

  it('種の表: 読めない行・重複が無く、全行に 50・100・1000位が揃う', () => {
    const raw = JSON.parse(fs.readFileSync(new URL('./data/finals-seed.json', import.meta.url), 'utf8')) as { events: unknown[] }
    const seed = parseHistory(raw)
    expect(seed.length).toBe(raw.events.length)
    expect(new Set(seed.map((e) => e.id)).size).toBe(seed.length)
    for (const e of seed) expect(Object.keys(e.finals).sort(), String(e.id)).toEqual(['100', '1000', '50'])
    expect(seed.some((e) => e.name.includes('テストイベント'))).toBe(false)
  })

  it('表の読み取りは壊れた行を捨てる', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory({ events: [null, { id: 'x' }, { id: 1, finals: {} }] })).toHaveLength(1)
  })
})
