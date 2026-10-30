import { describe, expect, it } from 'vitest'
import { xWeight } from '../../workers/border/src/posts.ts'
import type { Report } from '../border/report.ts'
import { checkInsight, insightPayload, insightPost, insightUser, reportFacts } from './insight.ts'
import { sanitizeForIssue } from './diagnose.ts'
import {
  MAX_SONGS_PER_RUN,
  X_BUDGET,
  newSongs,
  safeForX,
  songPayload,
  songPost,
  songPostId,
} from './xposts.ts'

describe('新曲の告知', () => {
  const NOW = Date.UTC(2026, 9, 8)
  const BASE = NOW - 72 * 3_600_000
  const before = [
    { id: '1', title: 'A' },
    // 比べる元の時点では公開前だった曲（そのあと公開された）
    { id: '6', title: '先に入っていた曲', published: true, publishedAt: NOW - 3_600_000 },
  ]
  const after = [
    ...before,
    { id: '2', title: 'エメラルド', published: true, publishedAt: NOW - 1000 },
    { id: '3', title: '未公開', published: false },
    { id: '4', title: 'あした公開', published: true, publishedAt: NOW + 86_400_000 },
    { id: '5', title: '譜面がまだ', published: true },
  ]

  // ★ 公開前の曲は書かない。ランキングに出せない曲も「選べます」と言わない
  // ★ 公開前から楽曲データに入っていた曲も、公開されたら知らせる（レビュー M1）
  it('比べる元の時点で公開済みだった曲との差で、公開済み・ランキングに出せる曲だけ', () => {
    expect(newSongs(before, BASE, after, NOW, new Set(['1', '2', '3', '4', '6'])).map((s) => s.id)).toEqual(['6', '2'])
  })

  it('1曲1本。曲名はデータのまま', () => {
    expect(songPost({ id: '2', title: 'エメラルド' })).toContain('「エメラルド」')
    expect(songPostId({ id: '2', title: 'エメラルド' })).toBe('x-song-2')
  })

  it('曲名がメンションやドメインの形なら知らせない', () => {
    expect(songPost({ id: '9', title: '@everyone' })).toBeNull()
    expect(songPost({ id: '9', title: 'evil.example.com' })).toBeNull()
  })
})

describe('告知に添える画像の指示', () => {
  const doomer = { id: '775', title: 'ドゥーマー', artistName: '東京真中', Unit: '0_VS', jacketLink: 'jacket_s_775.webp' }

  it('新曲: サイトのジャケ写と曲名・作者・ユニットを Bot に渡す', () => {
    expect(songPayload(doomer)).toEqual({
      kind: 'song',
      title: 'ドゥーマー',
      artist: '東京真中',
      unit: '0_VS',
      jacketUrl: 'https://sekaimaster.pages.dev/MusicDatas/jacket/jacket_s_775.webp',
      alt: '新しく追加した曲「ドゥーマー」のジャケットと曲名のカード。効率曲ランキングと周回プランで選べます。',
    })
  })

  it('新曲: ジャケ写のファイル名が読めなければ画像なし（文字だけで出る）', () => {
    for (const jacketLink of [undefined, 123, '', '../x.webp', 'a/b.webp', 'https://evil/x.webp', 'x.svg']) {
      expect(songPayload({ ...doomer, jacketLink }), String(jacketLink)).toBeNull()
    }
    // 作者・ユニットが読めなくてもカードは出す
    expect(songPayload({ ...doomer, artistName: 5, Unit: null })).toMatchObject({ artist: null, unit: null })
  })

})

describe('承認なしで出す文面の安全の確かめ', () => {
  it('自分のサイトのリンクは通し、メンション・山かっこ・ほかのリンクやドメインは止める', () => {
    expect(safeForX('【更新】x\nhttps://sekaimaster.pages.dev/changelog')).toBeNull()
    expect(safeForX('連絡は @someone')).toContain('メンション')
    expect(safeForX('＠everyone')).toContain('メンション')
    expect(safeForX('<@&123>')).toContain('メンション')
    expect(safeForX('見て https://evil.example/x')).toContain('URL')
    expect(safeForX('evil.com を見て')).toContain('ドメイン')
    expect(safeForX('www.example を見て')).toContain('ドメイン')
  })

})

describe('1回の本数の上限', () => {
  it('新曲の告知に上限がある（比べる元が壊れたときに全部を流さない）', () => {
    expect(MAX_SONGS_PER_RUN).toBeLessThanOrEqual(5)
  })
})

describe('Issue に書く前の無害化', () => {
  it('メンションを全角に、画像を消し、GitHub と自分のサイト以外のリンクを伏せる', () => {
    const t = sanitizeForIssue('@user 見て ![x](https://evil.example/a.png) https://evil.example/p https://github.com/o/r/issues/1')
    expect(t).not.toContain('@')
    expect(t).toContain('＠user')
    expect(t).toContain('（画像は省略）')
    expect(t).toContain('（リンク省略）')
    expect(t).toContain('https://github.com/o/r/issues/1')
  })
})

const report: Report = {
  eventId: 219,
  name: 'Side by Side, Our Ways！',
  unit: 'none',
  durationHours: 246,
  startAt: 0,
  aggregateAt: 0,
  generatedAt: '',
  modelVersions: ['v'],
  ranks: [
    {
      rank: 1000,
      final: 20_000_000,
      prospective: [
        { checkpoint: 0.5, progress: 0.5, modelVersion: 'v', predicted: 18_000_000, low: 16_000_000, high: 21_000_000, error: -0.1, inBand: true, visible: true },
        { checkpoint: 0.85, progress: 0.85, modelVersion: 'v', predicted: 19_000_000, low: 18_500_000, high: 19_800_000, error: -0.05, inBand: false, visible: true },
      ],
      replay: null,
    },
  ],
}

describe('一言解説', () => {
  it('渡す事実は順位ごとの1行（実測・経過50%と85%の予測・誤差・幅の中か外か）', () => {
    expect(reportFacts(report)).toEqual([
      '1000位: 実測 2,000万、経過50%の予測 1,800万（誤差 -10.0%・8割の幅の中）、経過85%の予測 1,900万（誤差 -5.0%・8割の幅の外）',
    ])
  })

  it('長い・URL・ハッシュタグ・段落分けは通さない', () => {
    const facts = insightUser(report)
    expect(checkInsight('1000位は5%下に外れ、終盤の伸びが過去より強かったとみられます。', facts)).toBeNull()
    expect(checkInsight('あ'.repeat(121), facts)).toContain('長すぎる')
    expect(checkInsight('見て https://x.com', facts)).toContain('URL')
    expect(checkInsight('#プロセカ', facts)).toContain('ハッシュタグ')
    expect(checkInsight('一文目。\n\n二文目。', facts)).toContain('段落')
  })

  it('数は渡した事実にあるものだけ（% は丸めを許す）', () => {
    const facts = insightUser(report)
    // 事実の数そのもの・丸めた %・全角
    expect(checkInsight('1000位は経過85%の予測が1,900万で、実測2,000万より5.0%低めでした。', facts)).toBeNull()
    expect(checkInsight('1000位は経過50%で10%下に外れました。', facts)).toBeNull()
    expect(checkInsight('１０００位は５%下でした。', facts)).toBeNull()
    // 作った数・計算した差・無い順位
    expect(checkInsight('1000位は7%下に外れました。', facts)).toContain('渡していない数')
    expect(checkInsight('1000位は100万下に外れました。', facts)).toContain('渡していない数')
    expect(checkInsight('500位は5%下でした。', facts)).toContain('渡していない数')
    expect(checkInsight('1000位は5.4%下でした。', facts)).toContain('渡していない数')
  })

  it('順位の数と幅に入った数も渡す（221 は事実に無い「6」で弾かれた。6順位の数とみられる）', () => {
    const facts = insightUser(report)
    expect(facts).toContain('全体: 1順位。8割の幅の中は、経過50%で1順位・経過85%で0順位')
    expect(checkInsight('1順位のうち、経過85%で幅に入ったのは0順位でした。', facts)).toBeNull()
    expect(checkInsight('6順位のうち4順位が幅の中でした。', facts)).toContain('渡していない数')
  })

  it('投稿は 276 以内。入りきらなければハッシュタグを外す', () => {
    const short = insightPost(report.name, '1000位は5%下に外れました。') ?? ''
    expect(short).toContain('#プロセカボーダー')
    // ハッシュタグありでは超え、外せば収まる長さ
    const long = insightPost('あ'.repeat(10), 'い'.repeat(90))
    expect(long).not.toBeNull()
    expect(long).not.toContain('#プロセカ')
    expect(xWeight(long ?? '')).toBeLessThanOrEqual(X_BUDGET)
    // 外しても収まらなければ積まない
    expect(insightPost('あ'.repeat(40), 'い'.repeat(120))).toBeNull()
  })

  it('投稿に添えるデータは、その回の答え合わせへの返信の印（Bot の client.ts の形）', () => {
    expect(insightPayload(222)).toEqual({ kind: 'insight', eventId: 222, replyTo: '222:result' })
  })
})
