import { describe, expect, it } from 'vitest'
import { X_LIMIT, formatMan, formatRange, milestoneText, postReferenceOf, resultText, xWeight } from '../src/posts.ts'
import { referenceOf } from '../src/snapshot.ts'

describe('formatRange', () => {
  it('両端が万なら前の万を省く', () => {
    expect(formatRange(14_100_000, 15_950_000)).toBe('1,410〜1,595万')
    expect(formatRange(9_000, 12_000)).toBe('9,000〜1万')
  })
})

describe('xWeight', () => {
  it('日本語は2、ASCII は1、URL は一律23で数える', () => {
    expect(xWeight('abc')).toBe(3)
    expect(xWeight('あいう')).toBe(6)
    expect(xWeight('https://sekaimaster.pages.dev/border/very/long/path')).toBe(23)
  })
})

describe('formatMan', () => {
  it('万単位・3桁区切りで丸める', () => {
    expect(formatMan(15_025_880)).toBe('1,503万')
    expect(formatMan(5_536_871)).toBe('554万')
    expect(formatMan(127_619_078)).toBe('1億2,762万')
    expect(formatMan(100_000_000)).toBe('1億')
    expect(formatMan(99_990_000)).toBe('9,999万')
    expect(formatMan(9_999)).toBe('9,999')
  })
})

const ranks = [50, 100, 200, 500, 1000, 2000].map((rank) => ({ rank, predicted: 123_456_789 / rank, low: 120_000_000 / rank, high: 130_000_000 / rank }))

describe('referenceOf / postReferenceOf（参考値の出どころ。#175）', () => {
  const thin = { duration: 102, samples: 1, latestEventId: 221, weight: 0.3 }
  it('新しい Worker の referenceSource をそのまま使う', () => {
    expect(referenceOf({ extrapolatedFrom: 150, thin, referenceSource: 'thin' })).toBe('thin')
    expect(referenceOf({ extrapolatedFrom: 198, thin: null, referenceSource: 'rate' })).toBe('rate')
    expect(referenceOf({ extrapolatedFrom: 198, thin: null, referenceSource: 'borrow' })).toBe('borrow')
    expect(postReferenceOf({ extrapolatedFrom: 150, thin: { ...thin, samples: 2 }, referenceSource: 'thin' })).toEqual({ source: 'thin', samples: 2 })
    expect(postReferenceOf({ extrapolatedFrom: 198, thin: null, referenceSource: 'rate' })).toEqual({ source: 'rate' })
  })
  it('referenceSource の無い古い出力: thin があれば thin、extrapolatedFrom だけなら borrow（いまの文面のまま）', () => {
    expect(referenceOf({ extrapolatedFrom: 150, thin })).toBe('thin')
    expect(referenceOf({ extrapolatedFrom: 150 })).toBe('borrow')
    expect(referenceOf({ extrapolatedFrom: 150, thin: null, referenceSource: null })).toBe('borrow')
  })
  it('参考値でなければ null。thin と言っているのに中身が無い・知らない値は borrow に倒す', () => {
    expect(referenceOf({ extrapolatedFrom: null, thin, referenceSource: 'thin' })).toBeNull()
    expect(referenceOf({})).toBeNull()
    expect(referenceOf({ extrapolatedFrom: 150, thin: null, referenceSource: 'thin' })).toBe('borrow')
    expect(referenceOf({ extrapolatedFrom: 150, referenceSource: 'other' as never })).toBe('borrow')
    expect(postReferenceOf({ extrapolatedFrom: null })).toBeNull()
  })
})

describe('milestoneText', () => {
  it('280 カウントに収まるよう順位の行を後ろから落とす', () => {
    const t = milestoneText('とても長いイベント名がここに入ってもはみ出さないことを確かめるための名前', '経過50%', ranks) as string
    expect(xWeight(t)).toBeLessThanOrEqual(X_LIMIT)
    expect(t).toContain('【ボーダー予測】')
    expect(t).toContain('1000位')
    expect(t.endsWith('https://sekaimaster.pages.dev/border')).toBe(true)
  })

  it('見出しに時点のラベル、各行に確度を入れる。範囲は前の「万」を省く', () => {
    const t = milestoneText('After the Fire', '開始24時間', [
      { rank: 1000, predicted: 15_025_880, low: 14_100_000, high: 15_950_000, confidence: 'rough' },
    ]) as string
    expect(t).toContain('【ボーダー予測】After the Fire（開始24時間）')
    expect(t).toContain('1000位 1,503万（1,410〜1,595万・確度目安）')
  })

  it('参考値（過去に無い長さ）: 見出しに「参考値」、確度は名乗らず、外れやすいと書く', () => {
    const t = milestoneText(
      'Vivid BAD SQUAD Memories',
      '開始24時間',
      [{ rank: 1000, predicted: 16_400_000, low: 12_280_000, high: 19_870_000, confidence: 'rough' }],
      { source: 'borrow' },
    ) as string
    expect(t).toContain('【ボーダー予測・参考値】Vivid BAD SQUAD Memories（開始24時間）')
    expect(t).toContain('1000位 1,640万（1,228〜1,987万）')
    expect(t).not.toContain('確度')
    expect(t).toContain('過去に無い長さのイベントで、外れやすい参考値です。')
    // 長い名前でも 280 に収まる
    expect(xWeight(milestoneText('とても長いイベント名がここに入ってもはみ出さないことを確かめるための名前', '経過50%', ranks, { source: 'borrow' }) as string)).toBeLessThanOrEqual(X_LIMIT)
  })

  it('参考値（同じ長さの回が少ない）: 「過去に無い長さ」と書かず、同じ長さの回の数を書く（#175、222 = 102h の前例は 221）', () => {
    const r = [{ rank: 1000, predicted: 16_400_000, low: 12_280_000, high: 19_870_000, confidence: 'rough' as const }]
    const t = milestoneText('Vivid BAD SQUAD Memories', '開始24時間', r, { source: 'thin', samples: 1 }) as string
    expect(t).toContain('【ボーダー予測・参考値】Vivid BAD SQUAD Memories（開始24時間）')
    expect(t).toContain('同じ長さの回が少ない（1回）イベントで、外れやすい参考値です。')
    expect(t).not.toContain('過去に無い長さ')
    expect(t).not.toContain('確度')
    // 率モデルを混ぜた過去に無い長さは、借り方に触れない同じ文面
    expect(milestoneText('x', '経過50%', r, { source: 'rate' })).toContain('過去に無い長さのイベントで、外れやすい参考値です。')
    expect(xWeight(milestoneText('とても長いイベント名がここに入ってもはみ出さないことを確かめるための名前', '経過50%', ranks, { source: 'thin', samples: 2 }) as string)).toBeLessThanOrEqual(X_LIMIT)
  })

  it('表に出せる順位が無ければ投稿しない', () => {
    expect(milestoneText('x', '経過50%', [])).toBeNull()
  })
})

describe('resultText', () => {
  it('実測・予測・誤差を並べる', () => {
    const t = resultText('After the Fire', [{ rank: 1000, final: 15_300_659, predicted: 15_025_880, progress: 0.85 }]) as string
    expect(t).toContain('1000位 実測1,530万／予測1,503万（-1.8%）')
    expect(t).toContain('経過85%')
    expect(xWeight(t)).toBeLessThanOrEqual(X_LIMIT)
  })
})
