import { describe, expect, it } from 'vitest'
import { xWeight } from '../../workers/border/src/posts.ts'
import type { Report } from '../border/report.ts'
import { checkInsight, insightPost, insightUser, reportFacts } from './insight.ts'
import { sanitizeForIssue } from './diagnose.ts'
import {
  CHANGELOG_URL,
  MAX_RELEASES_PER_RUN,
  MAX_SONGS_PER_RUN,
  X_BUDGET,
  checkReleasePost,
  fallbackReleasePost,
  newAnnounceable,
  newSongs,
  parseChangelog,
  recentReleases,
  safeForX,
  songPost,
  songPostId,
} from './xposts.ts'

const CL = `# 更新履歴

前書き

## [1.23.0] - 2026-10-01

数字を入れるだけで編成どうしを比べられるツールを足しました。

### 追加

- **編成かんたん比較を追加しました。**

## [1.22.2] - 2026-09-30

修正です。

## [1.22.0] - 2026-08-27

途中から開いても計画できるようにしました。
`

describe('更新履歴の読み取り', () => {
  it('版ごとに分け、本文は次の版の見出しの手前まで', () => {
    const e = parseChangelog(CL)
    expect(e.map((x) => x.version)).toEqual(['1.23.0', '1.22.2', '1.22.0'])
    expect(e[0].date).toBe('2026-10-01')
    expect(e[0].body).toContain('編成かんたん比較')
    expect(e[0].body).not.toContain('1.22.2')
  })

  // ★ PATCH は知らせない（docs/x-operations.md 第7節）
  it('新しく足された MINOR 以上の版だけを知らせる', () => {
    const after = parseChangelog(CL)
    const before = after.slice(2)
    expect(newAnnounceable(before, after).map((e) => e.version)).toEqual(['1.23.0'])
    expect(newAnnounceable(after, after)).toEqual([])
  })
})

describe('版の告知', () => {
  const ok = `【更新 v1.23.0】数字を入れるだけで編成どうしを比べられます。\n\n${CHANGELOG_URL}`

  it('型に合った文面は通す', () => {
    expect(checkReleasePost(ok, '1.23.0')).toBeNull()
  })

  it('頭の版・URL・ハッシュタグ・長さが合わなければ通さない', () => {
    expect(checkReleasePost(ok.replace('1.23.0', '1.22.0'), '1.23.0')).toContain('【更新')
    expect(checkReleasePost(`${ok}\nhttps://example.com`, '1.23.0')).toContain('URL')
    expect(checkReleasePost(`${ok} #プロセカ`, '1.23.0')).toContain('ハッシュタグ')
    expect(checkReleasePost(ok.replace('比べられます。', 'あ'.repeat(200)), '1.23.0')).toContain('長すぎる')
  })

  it('型に合わなかったときの文面は、最初の段落を入るところまで', () => {
    const e = parseChangelog(CL)[0]
    const t = fallbackReleasePost(e)
    expect(t.startsWith('【更新 v1.23.0】数字を入れるだけで')).toBe(true)
    expect(checkReleasePost(t, '1.23.0')).toBeNull()
    const long = fallbackReleasePost({ ...e, body: 'あ'.repeat(400) })
    expect(xWeight(long)).toBeLessThanOrEqual(X_BUDGET)
    expect(long).toContain('…')
  })
})

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

describe('承認なしで出す文面の安全の確かめ', () => {
  it('自分のサイトのリンクは通し、メンション・山かっこ・ほかのリンクやドメインは止める', () => {
    expect(safeForX(`【更新】x\n${CHANGELOG_URL}`)).toBeNull()
    expect(safeForX('連絡は @someone')).toContain('メンション')
    expect(safeForX('＠everyone')).toContain('メンション')
    expect(safeForX('<@&123>')).toContain('メンション')
    expect(safeForX('見て https://evil.example/x')).toContain('URL')
    expect(safeForX('evil.com を見て')).toContain('ドメイン')
    expect(safeForX('www.example を見て')).toContain('ドメイン')
  })

  it('版の告知の確かめにも効く', () => {
    expect(checkReleasePost(`【更新 v1.23.0】@all 見て\n\n${CHANGELOG_URL}`, '1.23.0')).toContain('メンション')
  })
})

describe('知らせる版の日付', () => {
  const NOW = Date.parse('2026-10-08T12:00:00+09:00')
  it('7日以内で、未来ではないものだけ', () => {
    const e = (date: string) => ({ version: '1.0.0', date, body: '' })
    expect(recentReleases([e('2026-10-08'), e('2026-10-02'), e('2026-09-30'), e('2026-10-09')], NOW).map((x) => x.date)).toEqual([
      '2026-10-08',
      '2026-10-02',
    ])
  })

  it('1回の本数の上限がある（比べる元が壊れたときに全部を流さない）', () => {
    expect(MAX_RELEASES_PER_RUN).toBeLessThanOrEqual(3)
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
})
