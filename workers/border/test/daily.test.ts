import { describe, expect, it } from 'vitest'
import { handleRequest } from '../src/api.ts'
import { dailyRanks, runDaily } from '../src/daily.ts'
import { kvAppend, kvGet, kvSet, unsentPosts } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import { GRID } from '../src/model.ts'
import { dailyAtProgress, dailyTimes, paceRank, pacePoints } from '../src/pace.ts'
import type { Snapshot } from '../src/snapshot.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const M = 60_000
// 222 MORE MORE JUMP！ Memories: 10/26 15:00 〜 10/30 20:59:59（日本時間）
const START = Date.UTC(2026, 9, 26, 6, 0)
const AGG = Date.UTC(2026, 9, 30, 11, 59, 59)
const EV = { id: 222, name: 'MORE MORE JUMP！ Memories', type: 'marathon', unit: 'none', startAt: START, aggregateAt: AGG, durationHours: 102 }

function snapAt(t: number, scale = 1, type = 'marathon'): Snapshot {
  return {
    event: { ...EV, type },
    checkedAt: t,
    sampleAt: t,
    progress: (t - START) / (AGG + M - START),
    modelVersion: 'v',
    extrapolatedFrom: null,
    predicted: true,
    ranks: [50, 1000].map((rank) => ({ rank, current: Math.round(((t - START) / H) * 1e6 * scale * (50 / rank) * 10), predicted: 9e7, low: 8e7, high: 1e8, confidence: 'mid', visible: true })),
  }
}

describe('日報を出す時刻と歴代ペース（pace.ts）', () => {
  it('開始の日から終了の前日まで毎日21時（終了の日の21時は入れない）', () => {
    expect(dailyTimes({ startAt: START, aggregateAt: AGG })).toEqual([0, 1, 2, 3].map((d) => Date.UTC(2026, 9, 26 + d, 12)))
  })

  it('経過率の時点の日速は形を補間して、値÷経過時間×24', () => {
    // 形が 経過率そのまま（直線）なら、どこでも日速は 終値÷時間×24
    const line = { final: 1000, share: GRID.map((p) => p) }
    expect(dailyAtProgress(line, 100, 0.53)).toBeCloseTo(240)
    expect(dailyAtProgress({ final: 1000, share: GRID.map(() => null) }, 100, 0.5)).toBeNull()
    expect(dailyAtProgress(line, 100, 0)).toBeNull()
  })

  it('過去の回の日速の並びは大きい順、対象の回と長さの分からない回は入れない。順位は自分より大きい回の数＋1', () => {
    const shape = (eventId: number, final: number) => ({ eventId, rank: 50, final, share: GRID.map((p) => p) })
    const hoursOf = new Map([
      [1, 100],
      [2, 100],
      [222, 102],
    ])
    const [p] = pacePoints({ id: 222, startAt: START, aggregateAt: AGG }, [shape(1, 1000), shape(2, 3000), shape(222, 9e9), shape(9, 5000)], hoursOf)
    expect(p.ranks['50']).toEqual([720, 240])
    expect(paceRank(p.ranks['50'], 500)).toEqual({ pos: 2, of: 3 })
  })
})

describe('日報の数字（dailyRanks）', () => {
  const rows = (ts: number[]) => ts.map((t) => [t, 0, snapAt(t).ranks.map((r) => [r.rank, r.current])] as [number, number, [number, number][]])

  it('初日は直近24時間を出さない。直近1時間は1時間前の点から', () => {
    const t = Date.UTC(2026, 9, 26, 12, 3)
    const [r] = dailyRanks(snapAt(t), rows([t - H, t - 24 * H]), null, true)
    expect(r).toMatchObject({ rank: 50, d24: null, h1: 1e7, pace: null })
  })

  it('3日目は24時間前の点から。点が20分より離れていれば空（23〜25時間ぶんを「直近24時間」と出さない）', () => {
    const t = Date.UTC(2026, 9, 28, 12, 3)
    expect(dailyRanks(snapAt(t), rows([t - 24 * H, t - H]), null, false)[0].d24).toBe(24e7)
    expect(dailyRanks(snapAt(t), rows([t - 24 * H - 30 * M]), null, false)[0].d24).toBeNull()
  })
})

describe('日報を積む（runDaily）', () => {
  const T = Date.UTC(2026, 9, 27, 12, 3) // 2日目 21:03 の点
  async function setup(snap: Snapshot) {
    const env: Env = { DB: createD1(), SITE_ORIGIN: 'https://site.example', ADMIN_TOKEN: 'tok' }
    await kvSet(env.DB, 'current', snap, snap.sampleAt)
    return env
  }

  it('21時台に、21時以降の点が入っていれば積む。同じ日は2回積まない', async () => {
    const env = await setup(snapAt(T))
    expect(await runDaily(env, T + 2 * M)).toEqual({ status: 'queued', id: '222:daily:2' })
    expect(await runDaily(env, T + 7 * M)).toEqual({ status: 'exists', id: '222:daily:2' })
    const [post] = await unsentPosts(env.DB, 'x')
    const payload = JSON.parse(post.payload as string)
    expect(payload).toMatchObject({ kind: 'daily', day: 2, fresh: false })
    // 控えの本文にも6順位のいまの値（画像が作れない・古い Bot でも数字の無い投稿にしない）
    expect(post.text).toContain('【ボーダー日報】MORE MORE JUMP！ Memories（2日目・21時台）')
    expect(post.text).toContain('50位 ')
    expect(post.text).toContain('1000位 ')
  })

  it('推移（kv history。収集が書き足す形）から直近の伸びを出す', async () => {
    const env = await setup(snapAt(T))
    for (const t of [T - 24 * H, T - H]) {
      const s = snapAt(t)
      await kvAppend(env.DB, 'history:222', [t, s.progress, s.ranks.map((r) => [r.rank, r.current, null, null, null, 0])], t)
    }
    await runDaily(env, T + 2 * M)
    const [post] = await unsentPosts(env.DB, 'x')
    expect(JSON.parse(post.payload as string).ranks[0]).toMatchObject({ rank: 50, d24: 24e7, h1: 1e7 })
  })

  it('何日目かは日報の時刻の何番目か（21時台に始まる回でも、:03 と :33 の点で日がずれない）', async () => {
    // 21:20 開始の回。最初の日報は翌日の21時（「1日目」・開始から24時間たっていない）
    const start = Date.UTC(2026, 10, 1, 12, 20)
    const ev = { ...EV, id: 300, startAt: start, aggregateAt: start + 5 * 24 * H }
    for (const [sample, want] of [
      [Date.UTC(2026, 10, 2, 12, 33), '300:daily:1'],
      [Date.UTC(2026, 10, 3, 12, 3), '300:daily:2'],
    ] as const) {
      const env = await setup({ ...snapAt(sample), event: ev, sampleAt: sample })
      expect(await runDaily(env, sample + 2 * M)).toEqual({ status: 'queued', id: want })
      const [post] = await unsentPosts(env.DB, 'x')
      expect(JSON.parse(post.payload as string).fresh).toBe(want.endsWith(':1'))
    }
  })

  it('21時台でなければ・終了の日・ワールドリンクは何もしない（ログも出さない）。21時より前の点なら待つ', async () => {
    expect(await runDaily(await setup(snapAt(T)), T + H)).toEqual({ status: 'idle' })
    expect(await runDaily(await setup(snapAt(T - 30 * M)), T + 2 * M)).toMatchObject({ status: 'skip', reason: '21時以降の値がまだ無い' })
    const last = Date.UTC(2026, 9, 30, 12, 3)
    expect(await runDaily(await setup(snapAt(last)), last + 2 * M)).toEqual({ status: 'idle' })
    expect(await runDaily(await setup(snapAt(T, 1, 'world_bloom')), T + 2 * M)).toEqual({ status: 'idle' })
  })

  it('テストイベントは日報の時刻でも出さない（日程が21時開始の24時間でなくても）', async () => {
    const test = { ...EV, type: 'cheerful_carnival', name: '第2回チアフルカーニバルイベントテストイベント' }
    const env = await setup({ ...snapAt(T), event: test })
    expect(await runDaily(env, T + 2 * M)).toEqual({ status: 'idle' })
    expect(await unsentPosts(env.DB, 'x')).toHaveLength(0)
    // 同じ日程・同じ時刻で名前が普通の回は積む
    expect(await runDaily(await setup({ ...snapAt(T), event: { ...test, name: 'チアフルカーニバル' } }), T + 2 * M)).toEqual({ status: 'queued', id: '222:daily:2' })
  })

  it('解析ジョブが置いた歴代ペースを使う（管理 API で受け取る）', async () => {
    const env = await setup(snapAt(T))
    const res = await handleRequest(
      new Request('https://w/admin/pace', {
        method: 'PUT',
        headers: { Authorization: 'Bearer tok' },
        body: JSON.stringify({ eventId: 222, points: [{ at: Date.UTC(2026, 9, 27, 12), progress: 0.3, ranks: { '50': [9e9, 1, 0] } }] }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await kvGet(env.DB, 'pace:222')).toContain('"progress":0.3')
    await runDaily(env, T + 2 * M)
    const [post] = await unsentPosts(env.DB, 'x')
    expect(JSON.parse(post.payload as string).ranks[0].pace).toEqual({ pos: 2, of: 4 })
    // 今日の21時の並びが無ければ（時刻が合わない）歴代ペースは空
    const other = await setup(snapAt(T + 24 * H))
    await kvSet(other.DB, 'pace:222', { points: [{ at: Date.UTC(2026, 9, 27, 12), progress: 0.3, ranks: { '50': [1] } }] }, 0)
    await runDaily(other, T + 24 * H + 2 * M)
    const [p2] = await unsentPosts(other.DB, 'x')
    expect(JSON.parse(p2.payload as string).ranks[0].pace).toBeNull()
    for (const points of [[{ at: 1, progress: 2, ranks: {} }], [{ at: 1, progress: 0.5, ranks: { x: [1] } }]]) {
      const res = await handleRequest(new Request('https://w/admin/pace', { method: 'PUT', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ eventId: 222, points }) }), env)
      expect(res.status).toBe(400)
    }
    const bad = await handleRequest(new Request('https://w/admin/pace', { method: 'PUT', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ eventId: 222, points: [{ at: 1, progress: 2, ranks: {} }] }) }), env)
    expect(bad.status).toBe(400)
  })
})
