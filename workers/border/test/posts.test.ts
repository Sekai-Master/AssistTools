import { describe, expect, it } from 'vitest'
import { X_LIMIT, formatMan, formatRange, milestoneText, resultText, xWeight } from '../src/posts.ts'

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
