import { describe, expect, it } from 'vitest'
import { kvSet, unsentPosts, upsertEvents } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import { xWeight } from '../src/posts.ts'
import { START_TEXT_MAX_WEIGHT, firstPredictionAt, runStart, startText } from '../src/start.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const M = 60_000
// 222 MORE MORE JUMP！ Memories: 10/26 15:00 〜 10/30 20:59:59（日本時間）
const START = Date.UTC(2026, 9, 26, 6, 0)
const AGG = Date.UTC(2026, 9, 30, 11, 59, 59)
const SITE = 'https://sekaimaster.pages.dev'

const row = (id: number, name: string, type: string, hours: number, finals: Record<string, number>) => ({
  id,
  name,
  asset: null,
  type,
  typeLabel: type,
  unit: 'none',
  start: '2026-01-01',
  days: 5,
  hours,
  finals,
  sources: {},
})
// 歴代の表（kv finals）の一部。221 が同じ種別（Memories）・同じ長さ（102時間）の直近の回
const TABLE = {
  events: [
    row(200, '古いMemories', 'memories', 102, { '50': 1, '100': 2, '1000': 3 }),
    row(219, 'マラソン102', 'marathon', 102, { '50': 9, '100': 9, '1000': 9 }),
    row(220, 'WL102', 'world_bloom', 102, { '50': 9, '100': 9, '1000': 9 }),
    row(221, 'Vivid BAD SQUAD Memories', 'memories', 102, { '50': 96_655_348, '100': 77_323_232, '200': 36_277_425, '500': 25_250_108, '1000': 22_028_987, '2000': 7_234_025 }),
  ],
}

async function setup(over: { type?: string; asset?: string | null; name?: string; table?: unknown } = {}) {
  const env: Env = { DB: createD1(), SITE_ORIGIN: SITE, ADMIN_TOKEN: 'tok' }
  await upsertEvents(env.DB, [
    {
      id: 222,
      name: over.name ?? 'MORE MORE JUMP！ Memories',
      eventType: over.type ?? 'marathon',
      unit: 'none',
      startAt: START,
      aggregateAt: AGG,
      asset: over.asset === undefined ? 'event_memories_mmj_2026' : over.asset,
    },
  ])
  if (over.table !== null) await kvSet(env.DB, 'finals', over.table ?? TABLE, 0)
  return env
}

describe('開始の告知の本文（startText）', () => {
  // 2026-10-26 に親セッションが手で出した 222 の文面を基準にする（ハッシュタグは Bot が X にだけ足す）
  it('222: 手で出した文面と同じ', async () => {
    const env = await setup()
    await runStart(env, START - 30 * M)
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.text).toBe(
      [
        'まもなく15:00から「MORE MORE JUMP！ Memories」開始🎶（10/30 20:59まで・102時間）',
        '',
        '同じ長さの前回「Vivid BAD SQUAD Memories」の最終ボーダーは100位 7,732万・1000位 2,203万。',
        '予測は10/27 15時ごろから、日報は毎日21時ごろ。',
        'https://sekaimaster.pages.dev/border/history',
      ].join('\n'),
    )
    // Bot が足すハッシュタグ（重み28）込みでも 280 未満
    expect(xWeight(`${post.text}\n#プロセカボーダー #プロセカ`)).toBeLessThan(280)
  })

  it('前例が無ければそう書く（マラソンは予測が参考値になると添える）。チアフルは予測に触れない', () => {
    const base = { name: 'X', startAt: START, aggregateAt: AGG, hours: 102, typeLabel: 'マラソン', prev: null, firstPredictionAt: START + 24 * H + 3 * M, dailyAt: START + 6 * H }
    expect(startText(base, SITE)).toContain('同じ長さ（102時間）のマラソンは過去にありません。予測は外れやすい参考値になります。')
    const cheer = startText({ ...base, typeLabel: 'チアフル', firstPredictionAt: null }, SITE)
    expect(cheer).toContain('同じ長さ（102時間）のチアフルは過去にありません。')
    expect(cheer).not.toContain('予測')
    expect(cheer).toContain('日報は毎日21時ごろ。')
  })

  it('名前がとても長くても重みの上限に収める（予定の行 → 名前の順に削る）', () => {
    const prev = { id: 1, name: '前'.repeat(80), finals: { '100': 1e8, '1000': 3e7 } }
    for (const n of [10, 40, 80, 200]) {
      const t = startText({ name: '長'.repeat(n), startAt: START, aggregateAt: AGG, hours: 102, typeLabel: 'Memories', prev, firstPredictionAt: START + 24 * H, dailyAt: START + 6 * H }, SITE)
      expect(xWeight(t), String(n)).toBeLessThanOrEqual(START_TEXT_MAX_WEIGHT)
      expect(t.startsWith('まもなく15:00から「')).toBe(true)
    }
  })

  it('最初の予測は節目のうち最も早いもの（ふつうは開始24時間、48時間未満の回は経過50%）を、投稿の出る回（:03・:33）に丸める', () => {
    expect(firstPredictionAt({ startAt: START, aggregateAt: AGG })).toBe(START + 24 * H + 3 * M)
    // 40時間の回は経過50%（20時間後）が先
    expect(firstPredictionAt({ startAt: START, aggregateAt: START + 40 * H - 1000 })).toBe(START + 20 * H + 3 * M)
  })
})

describe('開始の告知を積む（runStart）', () => {
  it('開始75分前〜15分前の見回りで、開始15分前の時刻を付けて1回だけ積む', async () => {
    const env = await setup()
    expect(await runStart(env, START - 76 * M)).toEqual({ status: 'idle' })
    expect(await runStart(env, START - 70 * M)).toEqual({ status: 'queued', id: '222:start' })
    expect(await runStart(env, START - 65 * M)).toEqual({ status: 'exists', id: '222:start' })
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.kind).toBe('start')
    const payload = JSON.parse(post.payload as string)
    expect(payload).toMatchObject({
      kind: 'start',
      postAt: START - 15 * M,
      event: { id: 222, type: 'memories', typeLabel: 'Memories', unit: 'idol', asset: 'event_memories_mmj_2026', hours: 102 },
      prev: { id: 221, name: 'Vivid BAD SQUAD Memories' },
      firstPredictionAt: START + 24 * H + 3 * M,
      dailyAt: Date.UTC(2026, 9, 26, 12),
    })
    expect(payload.prev.finals['2000']).toBe(7_234_025)
  })

  it('15分前を過ぎてから気づいた回・開始後は積まない', async () => {
    expect(await runStart(await setup(), START - 15 * M)).toEqual({ status: 'idle' })
    expect(await runStart(await setup(), START + 5 * M)).toEqual({ status: 'idle' })
  })

  it('比べる回は同じ種別・同じ長さの直近の回。ワールドリンクと別の種別は使わない。無ければ前例なし', async () => {
    // マラソンとして見ると 219（マラソン102）。Memories の 221 や WL の 220 は使わない
    const env = await setup({ asset: 'event_some_2026' })
    await runStart(env, START - 30 * M)
    const [post] = await unsentPosts(env.DB, 'x')
    expect(JSON.parse(post.payload as string).prev).toMatchObject({ id: 219 })
    const none = await setup({ table: { events: [] } })
    await runStart(none, START - 30 * M)
    const [p2] = await unsentPosts(none.DB, 'x')
    expect(JSON.parse(p2.payload as string).prev).toBeNull()
    expect(p2.text).toContain('過去にありません')
  })

  it('チアフルは最初の予測の時刻を持たない。ワールドリンク・素材名の無い回・テストの回は積まない', async () => {
    const cheer = await setup({ type: 'cheerful_carnival', asset: 'event_cc_2026' })
    await runStart(cheer, START - 30 * M)
    const [post] = await unsentPosts(cheer.DB, 'x')
    expect(JSON.parse(post.payload as string).firstPredictionAt).toBeNull()
    expect(await runStart(await setup({ type: 'world_bloom' }), START - 30 * M)).toEqual({ status: 'idle' })
    expect(await runStart(await setup({ asset: null }), START - 30 * M)).toMatchObject({ status: 'skip', reason: '素材名がまだ無い' })
    expect(await runStart(await setup({ name: 'テストイベント' }), START - 30 * M)).toMatchObject({ status: 'skip' })
  })
})
