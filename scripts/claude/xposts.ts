/**
 * ② 公式 X の投稿の自動作成（純粋関数）。実行は x-auto-post.ts（毎日 12:05 JST）。
 *
 * ★ 事実（曲名・版番号）はデータから埋める。Claude に任せるのは更新履歴の要約の言い回しだけ。
 *   承認なしで出すので（2026-09-30 Nori）、Claude の答えが型に合わなければ決まった型の文面に落とす。
 * ★ 文面の型は docs/x-operations.md 第7節。PATCH の版は出さない（同節）。
 */
import { xWeight } from '../../workers/border/src/posts.ts'

const SITE = 'https://sekaimaster.pages.dev'
export const CHANGELOG_URL = `${SITE}/changelog`
export const RANKING_URL = `${SITE}/ranking`
/** Bot が末尾のハッシュタグの候補の窓を閉じるために空白を1つ足すことがあるので、280 から余裕を取る */
export const X_BUDGET = 276

export interface ChangelogEntry {
  version: string
  date: string
  body: string
}

/** CHANGELOG.md の「## [x.y.z] - YYYY-MM-DD」ごとに分ける */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  const parts = md.split(/^## \[/m).slice(1)
  for (const part of parts) {
    const head = part.match(/^(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/)
    if (!head) continue
    const body = part.slice(part.indexOf('\n') + 1).split(/^## /m)[0].trim()
    out.push({ version: head[1], date: head[2], body })
  }
  return out
}

/** 新しく足された版のうち、知らせるもの（MINOR 以上＝PATCH が 0） */
export function newAnnounceable(before: readonly ChangelogEntry[], after: readonly ChangelogEntry[]): ChangelogEntry[] {
  const known = new Set(before.map((e) => e.version))
  return after.filter((e) => !known.has(e.version) && e.version.split('.')[2] === '0')
}

export const RELEASE_SYSTEM = `あなたはプロセカのツールサイト「Sekai-Master」の公式 X の中の人です。更新履歴の1つの版の本文を渡すので、告知の投稿を1本書いてください。

決まり:
- 1行目は「【更新 vX.Y.Z】」で始め、続けて使う人から見て何ができるようになったかを1〜2文。版番号や内部の話から始めない
- 最後の行は ${CHANGELOG_URL} だけ（前に空行を1つ）
- 全体で日本語 140 字くらいまで。絵文字・ハッシュタグは使わない
- 本文に無いことは書かない。数字・機能名は本文の書き方のまま
- 投稿の文面だけを出す（前置き・説明・引用符を付けない）`

export function releaseUser(e: ChangelogEntry): string {
  return `版: ${e.version}（${e.date}）\n\n${e.body}`
}

/** Claude の答えが型に合っているか。合っていなければ理由を返す */
export function checkReleasePost(text: string, version: string): string | null {
  if (!text.startsWith(`【更新 v${version}】`)) return '1行目が【更新 vX】で始まっていない'
  const urls = text.match(/https?:\/\/\S+/g) ?? []
  if (urls.length !== 1 || urls[0] !== CHANGELOG_URL) return 'URL が更新履歴の1本だけになっていない'
  if (/[#＃]/.test(text)) return 'ハッシュタグが入っている'
  if (xWeight(text) > X_BUDGET) return `長すぎる（${xWeight(text)}）`
  return safeForX(text)
}

/** 型に合わなかったときの文面: 本文の最初の段落を、入るところまで */
export function fallbackReleasePost(e: ChangelogEntry): string {
  const lead = e.body.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim()
  const build = (s: string) => `【更新 v${e.version}】${s}\n\n${CHANGELOG_URL}`
  if (xWeight(build(lead)) <= X_BUDGET) return build(lead)
  const chars = [...lead]
  for (let n = chars.length - 1; n > 0; n -= 1) {
    const t = build(`${chars.slice(0, n).join('')}…`)
    if (xWeight(t) <= X_BUDGET) return t
  }
  return build('')
}

export interface Song {
  id: string
  title: string
  published?: boolean
  publishedAt?: number
  artistName?: unknown
  /** "0_VS" など */
  Unit?: unknown
  /** "jacket_s_775.webp"（public/MusicDatas/jacket/ の中のファイル名） */
  jacketLink?: unknown
}

/** その時刻に公開済みの曲か（公開前の曲は書かない） */
const releasedAt = (s: Song, t: number) => s.published !== false && (s.publishedAt == null || s.publishedAt <= t)

/**
 * 新しく公開された曲（効率曲ランキングに出せるもの）。
 * ★ 「比べる元の時点で公開済みだった曲」との差で見る。id の有無で見ると、公開前から楽曲データに
 *   入っていた曲が公開されたときに告知されない（レビュー M1）
 */
export function newSongs(
  before: readonly Song[],
  beforeAt: number,
  after: readonly Song[],
  now: number,
  rankable: ReadonlySet<string>,
): Song[] {
  const known = new Set(before.filter((s) => releasedAt(s, beforeAt)).map((s) => s.id))
  return after.filter((s) => !known.has(s.id) && releasedAt(s, now) && rankable.has(s.id))
}

/** 新曲の告知（1曲1本。型だけで書く。曲名はデータのまま） */
export function songPost(song: Song): string | null {
  const t = ['【更新】新しい曲を追加しました。効率曲ランキングと周回プランで選べます。', `「${song.title}」`, '', RANKING_URL].join('\n')
  return xWeight(t) <= X_BUDGET && safeForX(t) == null ? t : null
}

/**
 * 投稿に添える画像の指示（投稿キューの payload）。描くのは Bot（sekaimaster-bot の src/border/songCard.ts・image.ts）。
 * 2026-10-10 Nori「曲もジャケ写と一緒に出せるといいね」「新機能追加の告知とかも基本画像付きで」。
 * Bot は本番のサイトの中しか読まないので、ここでも同じ形に絞る（外れたら画像なしで積む＝文字だけで出る）
 */
export type AnnouncePayload =
  | { kind: 'song'; title: string; artist: string | null; unit: string | null; jacketUrl: string; alt: string }
  | { kind: 'page'; path: string; alt: string; width: number; height: number }

const shortString = (x: unknown, max: number) => (typeof x === 'string' && x.trim() && [...x].length <= max ? x.trim() : null)

/** 新曲カードの指示。ジャケ写のファイル名が読めなければ null（文字だけで出す） */
export function songPayload(song: Song): AnnouncePayload | null {
  const file = typeof song.jacketLink === 'string' ? song.jacketLink : ''
  if (!/^[A-Za-z0-9_-]+\.(webp|png|jpg)$/.test(file) || [...song.title].length > 100) return null
  return {
    kind: 'song',
    title: song.title,
    artist: shortString(song.artistName, 100),
    unit: shortString(song.Unit, 20),
    jacketUrl: `${SITE}/MusicDatas/jacket/${file}`,
    alt: `新しく追加した曲「${song.title}」のジャケットと曲名のカード。効率曲ランキングと周回プランで選べます。`,
  }
}

export interface ToolRef {
  path: string
  name: string
}

/**
 * 版の告知に添えるページ。更新履歴の本文でいちばん先に名前が出てくるツールの画面を撮る
 * （「追加」の節を先に見る。ついでに名前が出るだけのツールより、足したツールを選ぶため）。
 * どのツールの名前も無ければ、更新履歴のページ（いちばん上がその版）
 */
export function releasePayload(e: ChangelogEntry, tools: readonly ToolRef[]): AnnouncePayload {
  const added = e.body.match(/^### 追加\s*\n([\s\S]*?)(?=^### |(?![\s\S]))/m)?.[1] ?? ''
  const first = (text: string) =>
    tools
      .map((t) => ({ t, at: text.indexOf(t.name) }))
      .filter((x) => x.at >= 0 && /^\/[A-Za-z0-9_-]+$/.test(x.t.path))
      .sort((a, b) => a.at - b.at)[0]?.t
  const tool = first(added) ?? first(e.body)
  if (tool) return { kind: 'page', path: tool.path, alt: `${tool.name}の画面（Sekai-Master v${e.version}）`, width: 1600, height: 900 }
  return { kind: 'page', path: '/changelog', alt: `Sekai-Master の更新履歴のページ（いちばん上が v${e.version}）`, width: 1600, height: 900 }
}

/**
 * 承認なしで出す文面の安全の確かめ。問題があれば理由を返す（レビュー M3）。
 * - メンション（@ ＠）・山かっこ（Discord の <@…>）を通さない
 * - 自分のサイト以外のリンク（https:// が無くても X はドメインをリンクにする）を通さない
 */
export function safeForX(text: string): string | null {
  if (/[@＠<>]/.test(text)) return 'メンションか山かっこが入っている'
  const rest = text.replace(/https:\/\/sekaimaster\.pages\.dev[^\s]*/g, '')
  if (/https?:\/\//i.test(rest)) return '自分のサイト以外の URL が入っている'
  if (/\bwww\.|[a-z0-9-]+\.(?:com|net|org|jp|io|co|me|ly|gg|dev|app|xyz|info|link|site|page)\b/i.test(rest)) return 'ドメインらしい文字列が入っている'
  return null
}

/** 1回に出す本数の上限（比べる元が壊れていて全部を「新しい」とみなす事故を止める。レビュー H1） */
export const MAX_RELEASES_PER_RUN = 2
export const MAX_SONGS_PER_RUN = 3
/** 版の告知は、更新履歴の日付がこの日数以内のものだけ */
export const RELEASE_MAX_AGE_DAYS = 7

/** 知らせる版を、日付で絞る（未来の日付と古い版は出さない） */
export function recentReleases(entries: readonly ChangelogEntry[], now: number): ChangelogEntry[] {
  return entries.filter((e) => {
    const t = Date.parse(`${e.date}T00:00:00+09:00`)
    return Number.isFinite(t) && t <= now && now - t <= RELEASE_MAX_AGE_DAYS * 86_400_000
  })
}

/** 投稿の id。中身から決める（入れ直しても Worker が二重にしない） */
export const releasePostId = (version: string) => `x-release-v${version}`
export const songPostId = (song: Song) => `x-song-${song.id}`
