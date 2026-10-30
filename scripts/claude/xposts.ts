/**
 * ② 公式 X の投稿の自動作成（純粋関数）。実行は x-auto-post.ts（毎日 12:17 JST）。
 *
 * ★ 曲名はデータから埋める（型で書く。Claude は使わない）。承認なしで出す（2026-09-30 Nori）。
 * ★ 版の告知は出さない。版を上げるときは Nori の手が入るので、告知も手で予約する（2026-10-31 Nori。
 *   以前の自動の版の告知は git の履歴にある）。文面の型は docs/x-operations.md 第7節。
 */
import { xWeight } from '../../workers/border/src/posts.ts'

const SITE = 'https://sekaimaster.pages.dev'
export const RANKING_URL = `${SITE}/ranking`
/** Bot が末尾のハッシュタグの候補の窓を閉じるために空白を1つ足すことがあるので、280 から余裕を取る */
export const X_BUDGET = 276

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
export const MAX_SONGS_PER_RUN = 3
/** 投稿の id。中身から決める（入れ直しても Worker が二重にしない） */
export const songPostId = (song: Song) => `x-song-${song.id}`
