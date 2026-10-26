import { describe, expect, it } from 'vitest'
import { runDaily } from '../src/daily.ts'
import { kvAppend, kvSet, unsentPosts, upsertEvents } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import type { Snapshot } from '../src/snapshot.ts'
import { runSpurt, spurtRanks, spurtText } from '../src/spurt.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const M = 60_000
// 222 MORE MORE JUMP！ Memories: 10/26 15:00 〜 10/30 20:59:59（日本時間）。終了3時間前は 10/30 18:00
const START = Date.UTC(2026, 9, 26, 6, 0)
const AGG = Date.UTC(2026, 9, 30, 11, 59, 59)
const EV = { id: 222, name: 'MORE MORE JUMP！ Memories', type: 'marathon', unit: 'none', startAt: START, aggregateAt: AGG, durationHours: 102 }
const AT18 = Date.UTC(2026, 9, 30, 9, 0)

function snapAt(t: number, type = 'marathon'): Snapshot {
  return {
    event: { ...EV, type },
    checkedAt: t,
    sampleAt: t,
    progress: (t - START) / (AGG + M - START),
    modelVersion: 'v',
    extrapolatedFrom: null,
    predicted: true,
    ranks: [50, 1000].map((rank) => ({ rank, current: Math.round(((t - START) / H) * 1e6 * (50 / rank)), predicted: 9e7, low: 8e7, high: 1e8, confidence: 'mid', visible: true })),
  }
}

async function setup(snap: Snapshot, type = 'marathon') {
  const env: Env = { DB: createD1(), SITE_ORIGIN: 'https://site.example', ADMIN_TOKEN: 'tok' }
  await upsertEvents(env.DB, [{ id: 222, name: EV.name, eventType: type, unit: 'none', startAt: START, aggregateAt: AGG, asset: 'event_memories_mmj_2026' }])
  await kvSet(env.DB, 'current', snap, snap.sampleAt)
  return env
}

describe('追い込みの数字（spurtRanks）', () => {
  const rows = (ts: number[]) => ts.map((t) => [t, 0, snapAt(t).ranks.map((r) => [r.rank, r.current])] as [number, number, [number, number][]])

  it('直近1時間・3時間は1時間前・3時間前の点から。点が10分より離れていれば空', () => {
    const t = AT18 + 3 * M
    const [r50, r1000] = spurtRanks(snapAt(t), rows([t - H, t - 3 * H]))
    expect(r50).toEqual({ rank: 50, h1: 1e6, h3: 3e6 })
    expect(r1000).toEqual({ rank: 1000, h1: 5e4, h3: 15e4 })
    expect(spurtRanks(snapAt(t), rows([t - H - 30 * M, t - 3 * H - 11 * M]))[0]).toEqual({ rank: 50, h1: null, h3: null })
  })

  it('控えの本文は見出しと6順位のいまの値', () => {
    const text = spurtText('名前', [{ rank: 50, current: 96_655_348 }], 'https://s')
    expect(text).toBe('【ラストスパート・残り3時間】名前\n\n50位 9,666万\n\nhttps://s/border')
  })
})

describe('追い込みを積む（runSpurt）', () => {
  it('終了3時間前を過ぎた最初の値が入ったら積む。2回は積まない', async () => {
    const t = AT18 + 3 * M
    const env = await setup(snapAt(t))
    for (const h of [1, 3]) {
      const s = snapAt(t - h * H)
      await kvAppend(env.DB, 'history:222', [t - h * H, s.progress, s.ranks.map((r) => [r.rank, r.current, null, null, null, 0])], t)
    }
    expect(await runSpurt(env, t + 2 * M)).toEqual({ status: 'queued', id: '222:spurt' })
    expect(await runSpurt(env, t + 7 * M)).toEqual({ status: 'exists', id: '222:spurt' })
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.kind).toBe('spurt')
    expect(post.text).toContain('【ラストスパート・残り3時間】MORE MORE JUMP！ Memories')
    const payload = JSON.parse(post.payload as string)
    expect(payload).toMatchObject({ kind: 'spurt', hoursLeft: 3, snapshot: { event: { id: 222 } } })
    expect(payload.ranks[0]).toEqual({ rank: 50, h1: 1e6, h3: 3e6 })
  })

  it('終了3時間前より前の値しか無ければ待つ。3時間前より前・2時間前を過ぎた時刻は何もしない', async () => {
    expect(await runSpurt(await setup(snapAt(AT18 - 27 * M)), AT18 + 2 * M)).toMatchObject({ status: 'skip', reason: '終了3時間前より後の値がまだ無い' })
    expect(await runSpurt(await setup(snapAt(AT18 - 27 * M)), AT18 - 5 * M)).toEqual({ status: 'idle' })
    // 19:00 を過ぎてからでは「残り3時間」と出さない（止まっていて遅れた場合）
    expect(await runSpurt(await setup(snapAt(AT18 + 63 * M)), AT18 + H + 5 * M)).toEqual({ status: 'idle' })
  })

  it('ワールドリンクなど日報の対象でない種別・いまの値が別の回なら積まない', async () => {
    const t = AT18 + 3 * M
    expect(await runSpurt(await setup(snapAt(t), 'world_bloom'), t + 2 * M)).toEqual({ status: 'idle' })
    const other = { ...snapAt(t), event: { ...EV, id: 221 } }
    expect(await runSpurt(await setup(other), t + 2 * M)).toMatchObject({ status: 'skip' })
  })

  // 2026-10-25 Nori の指示: 終了の日の21時（終了の後）に日報が出ていないか確かめ、追い込みと重ならないようにする
  it('終了の日は 21時の日報が出ない（追い込みだけ）', async () => {
    const last = Date.UTC(2026, 9, 30, 12, 3)
    expect(await runDaily(await setup(snapAt(last)), last + 2 * M)).toEqual({ status: 'idle' })
  })
})
