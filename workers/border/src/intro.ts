/**
 * 機能紹介を週1回 X に積む。5分ごとの見回り（start.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-31 Nori「各機能の紹介画像をストックして定期に自動で出す」（毎イベント末のアナライザーではなく、少しずつ色々な機能を）。
 * - 中身（本文・画像・代替テキスト）はサイトの /intro/intros.json が正。画像は /intro/<slug>/ に置いた PNG（手で作って PR で入れる）。
 *   紹介を足すのはサイトの PR だけで済み、Worker を入れ直さなくてよい
 * - 毎週 INTRO_WEEKDAY の INTRO_HOUR 時ちょうど（postAt）に出す。積むのはその1時間前から（Bot が画像を先に取り、時刻のタイマーを掛けられるように。start.ts と同じ）
 * - どれを出すか: 一覧の順で、まだ出していないもの → 全部出し終えたら、いちばん前に出したもの。一覧に足した紹介は次の週に回る
 * - X にだけ出す（告知なので本文の末尾に #プロセカ。Discord は積んだ時点で送信済みにする。scripts/claude/queue.ts の xOnly と同じ）
 * ★ CPU 10ms の枠: 出す曜日・時刻の1時間以外は D1 も引かずに返す。その1時間も、積んだ後は posts を1回引いて終わる
 */
import type { Env } from './env.ts'
import { xWeight } from './posts.ts'
import type { PostPayload } from './snapshot.ts'

const M = 60_000
const H = 60 * M
/** 出す曜日（日本時間。0 = 日曜）。水曜はマラソンの開始・終了の日と重なりにくい */
export const INTRO_WEEKDAY = 3
/** 出す時刻（日本時間の時） */
export const INTRO_HOUR = 12
/** 出す時刻のこの時間前から積む */
const QUEUE_AHEAD_MS = H
/**
 * X の本文の上限（Bot は機能紹介の本文に何も足さない）。ちょうど 280 は避ける（数え方が X と少しずれると投稿ボタンが押せない。
 * 開始の告知の 244＋ハッシュタグ＝275 と同じ余裕）
 */
export const INTRO_TEXT_MAX_WEIGHT = 275
/** 代替テキストの上限（字。Bot の parseIntroPayload と同じ。ずれると Bot が payload ごと捨てる） */
export const INTRO_ALT_MAX = 1000
/** 1本に付ける画像の上限（X の上限） */
const MAX_IMAGES = 4
/** 直近の機能紹介をこの本数まで見て、出した順を決める（紹介の数より多ければよい） */
const RECENT_LIMIT = 100

export type IntroResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'queued' | 'exists'; id: string }

export interface IntroEntry {
  slug: string
  text: string
  images: { url: string; alt: string }[]
}

export type IntroPayload = Extract<PostPayload, { kind: 'intro' }>

const SLUG = /^[a-z0-9-]+$/
const FILE = /^[a-z0-9-]+\.png$/

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
/** Bot の shortText と同じ（前後の空白を除いて空でなく、INTRO_ALT_MAX 字以内） */
const isAlt = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '' && [...x].length <= INTRO_ALT_MAX

/** 日本時間のその日の0時（UTC の ms） */
const jstDay = (ms: number) => Math.floor((ms + 9 * H) / 86_400_000) * 86_400_000 - 9 * H

/** now が積む時間帯なら、その週の出す時刻。外なら null */
export function introSlotOf(now: number): number | null {
  const postAt = jstDay(now) + INTRO_HOUR * H
  if (new Date(postAt + 9 * H).getUTCDay() !== INTRO_WEEKDAY) return null
  return now >= postAt - QUEUE_AHEAD_MS && now < postAt ? postAt : null
}

/** その週の投稿の id の頭（`intro:2026-11-11:`）。後ろに slug が付く */
export function introIdPrefix(postAt: number): string {
  return `intro:${new Date(postAt + 9 * H).toISOString().slice(0, 10)}:`
}

/** サイトの intros.json を読む。形の崩れた紹介は落とす（ほかの紹介は出す） */
export function parseIntros(raw: unknown, site: string): IntroEntry[] {
  if (!isRecord(raw) || !Array.isArray(raw.intros)) return []
  const out: IntroEntry[] = []
  for (const e of raw.intros) {
    if (!isRecord(e) || typeof e.slug !== 'string' || !SLUG.test(e.slug) || typeof e.text !== 'string' || !Array.isArray(e.images)) continue
    if (!e.text.trim() || xWeight(e.text) > INTRO_TEXT_MAX_WEIGHT) continue
    const images = e.images.filter((i): i is { file: string; alt: string } => isRecord(i) && typeof i.file === 'string' && FILE.test(i.file) && isAlt(i.alt))
    if (images.length === 0 || images.length !== e.images.length || images.length > MAX_IMAGES) continue
    if (out.some((o) => o.slug === e.slug)) continue
    out.push({ slug: e.slug, text: e.text, images: images.map((i) => ({ url: `${site}/intro/${e.slug}/${i.file}`, alt: i.alt })) })
  }
  return out
}

/**
 * 次に出す紹介。recentIds は直近の機能紹介の id（新しい順）。
 * 一覧の順でまだ出していないもの、全部出していれば最後に出したのがいちばん古いもの
 */
export function pickIntro(entries: readonly IntroEntry[], recentIds: readonly string[]): IntroEntry | null {
  const lastIndex = (slug: string) => recentIds.findIndex((id) => id.endsWith(`:${slug}`))
  const fresh = entries.find((e) => lastIndex(e.slug) < 0)
  if (fresh) return fresh
  let best: IntroEntry | null = null
  for (const e of entries) if (!best || lastIndex(e.slug) > lastIndex(best.slug)) best = e
  return best
}

export async function runIntro(env: Env, now: number, fetcher: typeof fetch = fetch): Promise<IntroResult> {
  const postAt = introSlotOf(now)
  if (postAt == null) return { status: 'idle' }
  const prefix = introIdPrefix(postAt)
  // その週の分を積んだかは主キーの範囲で引く（積んだ後の見回りは posts を読まずに済む。頭は ':' で終わるので次の文字 ';' までが範囲）
  const done = await env.DB.prepare('SELECT id FROM posts WHERE id >= ?1 AND id < ?2 LIMIT 1')
    .bind(prefix, `${prefix.slice(0, -1)};`)
    .first<{ id: string }>()
  if (done) return { status: 'exists', id: done.id }
  const recent = await env.DB.prepare("SELECT id FROM posts WHERE kind = 'intro' ORDER BY created_at DESC LIMIT ?1").bind(RECENT_LIMIT).all<{ id: string }>()
  const recentIds = recent.results.map((r) => r.id)

  // 読めなければ次の見回り（5分後）にまた読む。出す時刻を過ぎたらその週は出さない
  let raw: unknown
  try {
    const res = await fetcher(`${env.SITE_ORIGIN}/intro/intros.json`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return { status: 'skip', reason: `intros.json が読めない（${res.status}）` }
    raw = await res.json()
  } catch (err) {
    return { status: 'skip', reason: `intros.json が読めない（${err instanceof Error ? err.message : String(err)}）` }
  }
  const entry = pickIntro(parseIntros(raw, env.SITE_ORIGIN), recentIds)
  if (!entry) return { status: 'skip', reason: '出せる紹介が無い' }

  const id = `${prefix}${entry.slug}`
  const payload: IntroPayload = { kind: 'intro', postAt, slug: entry.slug, images: entry.images }
  // 投稿の行・画像用のデータ・Discord の送信済みを1つのトランザクションで（db.ts の queuePost と同じ理由）
  const [, post] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)').bind(`post:${id}`, JSON.stringify(payload), now),
    env.DB.prepare('INSERT OR IGNORE INTO posts (id, event_id, kind, text, created_at, sent_discord_at) VALUES (?1, 0, ?2, ?3, ?4, ?4)').bind(id, 'intro', entry.text, now),
  ])
  return { status: (post.meta.changes ?? 0) > 0 ? 'queued' : 'exists', id }
}
