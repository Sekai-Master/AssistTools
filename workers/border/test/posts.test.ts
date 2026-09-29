import { describe, expect, it } from 'vitest'
import { X_LIMIT, formatMan, milestoneText, resultText, xWeight } from '../src/posts.ts'

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
    expect(formatMan(127_619_078)).toBe('12,762万')
    expect(formatMan(9_999)).toBe('9,999')
  })
})

const ranks = [50, 100, 200, 500, 1000, 2000].map((rank) => ({ rank, predicted: 123_456_789 / rank, low: 120_000_000 / rank, high: 130_000_000 / rank }))

describe('milestoneText', () => {
  it('280 カウントに収まるよう順位の行を後ろから落とす', () => {
    const t = milestoneText('とても長いイベント名がここに入ってもはみ出さないことを確かめるための名前', 0.5, ranks) as string
    expect(xWeight(t)).toBeLessThanOrEqual(X_LIMIT)
    expect(t).toContain('【ボーダー予測】')
    expect(t).toContain('1000位')
    expect(t.endsWith('https://sekaimaster.pages.dev/border')).toBe(true)
  })

  it('表に出せる順位が無ければ投稿しない', () => {
    expect(milestoneText('x', 0.5, [])).toBeNull()
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
