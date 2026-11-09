/**
 * 機能紹介を X に積む。1回のイベントに1本、イベントの段（ガチャの日か、その翌日）の 12:00 に出す。5分ごとの見回り（start.ts と同じ Cron）から呼ぶ。
 *
 * 2026-10-31 Nori「各機能の紹介画像をストックして定期に自動で出す」（毎イベント末のアナライザーではなく、少しずつ色々な機能を）。
 * 2026-11-09 Nori「方針変更で多少人捕まえに行きましょう」で、毎週水曜の固定をやめてイベントの段に合わせた（docs/x-operations.md 第0節・第7節）。
 *   ツールごとに要る時期が違う（編成はガチャが開く 12:00、走り方は走り始めてから。第5節）のに、曜日で決めると刺さらない日に出る
 *   （11/4 のアナライザーは 223 の5日目に出た）
 * - 段は2つ。gacha＝イベントの開始日（日本時間）の 12:00（ガチャは種別によらず開始日の 12:00 に開く。marathon は 15:00 開始、world_bloom は 20:00 開始）、
 *   running＝その翌日の 12:00。その回の gacha の日に gacha の紹介を出せればそれを出し、出せなければ翌日に running の紹介を出す。
 *   その回に1本出したら、その回ではもう出さない
 *   - 1回に1本にしたのは、告知の本数を増やさないため（歯止め。段ごとに出すと週1回より4割増える。2026-11-10 の破壊者レビュー）
 *   - gacha を先にするのは、編成の話はガチャが開いた日でないと刺さらない（翌日には多くの人が組み終わっている）から。走り方の話は翌日でも間に合う
 *   - 集計日の前日は使わない。アナライザーの案内は、同じ日の 21 時の日報（sekaimaster-bot）が受け持つ（半日のうちに同じツールを2回勧めない）
 *   - 「その回に出したか」は posts の event_id で見る（紹介の行にはその回の id を入れる。2026-11-09 までの水曜の行は 0）。
 *     id の形（`intro:YYYY-MM-DD:slug`）と payload は Bot が読むので変えない
 * - どれを出すか: その段の紹介（intros.json の phase。無い・不正な紹介は running）のうち、直近 INTRO_GAP_DAYS 日に出していないもの。
 *   まだ一度も出していないものを一覧の順で先に、全部出したことがあれば最後に出したのがいちばん古いもの。無ければその段は出さない
 *   - 28日（イベント約3回分）あけるのは、同じ紹介が続いて告知に見えないように。gacha の紹介は2本なので、3回に1回ほどは翌日の running に回る
 *   - 比べるのは id の日付（日本時間）どうし。ミリ秒で比べると、11:05 に積んだ回と 11:00 の見回りの5分の差で1回分ずれる
 * - 対象の回: events の marathon・cheerful_carnival・world_bloom で、テストの回でないもの。複数の回に段があれば開始の早い回。
 *   次の回が events に入っていない（日程の取り込み〈dispatch.ts〉が 11 時までに済んでいない）と、その日の gacha は出ない
 * - ガチャの日は 12:00 の紹介と開始15分前の告知、翌日は 12:00 の紹介と 24 時間の予測・21時の日報が同じ日に出る。
 *   紹介は id の頭が日付なので同じ日に2本は出ず、Bot の X の間隔（10分）ともぶつからない
 * - 出す時刻（postAt）の1時間前から積む（Bot が画像を先に取り、時刻のタイマーを掛けられるように。start.ts と同じ）
 * - 中身（本文・画像・代替テキスト）はサイトの /intro/intros.json が正。画像は /intro/<slug>/ に置いた PNG（手で作って PR で入れる）。
 *   紹介を足すのはサイトの PR だけで済み、Worker を入れ直さなくてよい
 * - X にだけ出す（告知なので本文の末尾に #プロセカ。Discord は積んだ時点で送信済みにする。scripts/claude/queue.ts の xOnly と同じ）
 * ★ CPU 10ms の枠: 11:00〜11:59（日本時間）以外は D1 も引かずに返す。その1時間は、その日の分を積んだか（posts の主キーの範囲）→
 *   events を1回（開始日で絞り LIMIT 5）→ 段のある日だけ直近の紹介（posts の主キーの範囲）の順に引く。積んだ後の見回りは最初の1回で終わる。
 *   intros.json（約27KB）の parse は、段があってその回にまだ出していない日だけ
 */
import type { Env } from './env.ts'
import { isTestEvent } from './history.ts'
import { xWeight } from './posts.ts'
import type { PostPayload } from './snapshot.ts'

const M = 60_000
const H = 60 * M
const DAY = 24 * H
/** 出す時刻（日本時間の時） */
export const INTRO_HOUR = 12
/** 出す時刻のこの時間前から積む */
const QUEUE_AHEAD_MS = H
/** 同じ紹介はこの日数をあけて出す（日本時間の日付で数える。前に出した日から28日たてば出せる） */
export const INTRO_GAP_DAYS = 28
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
/** 同じ日に段のある回をこの数まで引く（テストの回は SQL でなく JS で除くので、1件だとテストの回に本番の回を隠される） */
const EVENT_LIMIT = 5
/** 紹介の行の id の範囲（頭は `intro:`。':' の次の文字 ';' までが範囲） */
const INTRO_ID_FROM = 'intro:'
const INTRO_ID_UNTIL = 'intro;'

export type IntroPhase = 'gacha' | 'running'

export type IntroResult = { status: 'idle' } | { status: 'skip'; reason: string } | { status: 'queued' | 'exists'; id: string }

export interface IntroEntry {
  slug: string
  /** 出す段（intros.json の phase。無い・不正なら running） */
  phase: IntroPhase
  text: string
  images: { url: string; alt: string }[]
}

export type IntroPayload = Extract<PostPayload, { kind: 'intro' }>

const SLUG = /^[a-z0-9-]+$/
const FILE = /^[a-z0-9-]+\.png$/
const ID_DATE = /^intro:(\d{4}-\d{2}-\d{2}):/

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
/** Bot の shortText と同じ（前後の空白を除いて空でなく、INTRO_ALT_MAX 字以内） */
const isAlt = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '' && [...x].length <= INTRO_ALT_MAX

/** 日本時間のその日の0時（UTC の ms） */
const jstDay = (ms: number) => Math.floor((ms + 9 * H) / DAY) * DAY - 9 * H
/** 日本時間の日付（YYYY-MM-DD） */
const jstDate = (ms: number) => new Date(ms + 9 * H).toISOString().slice(0, 10)

/** now が積む時間帯（毎日 11:00〜11:59）なら、その日の出す時刻（12:00）。外なら null */
export function introSlotOf(now: number): number | null {
  const postAt = jstDay(now) + INTRO_HOUR * H
  return now >= postAt - QUEUE_AHEAD_MS && now < postAt ? postAt : null
}

/** その日の投稿の id の頭（`intro:2026-11-11:`）。後ろに slug が付く */
export function introIdPrefix(postAt: number): string {
  return `intro:${jstDate(postAt)}:`
}

/**
 * その回の、postAt（その日の 12:00）の段。無ければ null。
 * gacha＝開始日（日本時間）の 12:00、running＝その翌日の 12:00。どちらもその時刻に回が終わっていないこと（翌日の 12:00 より前に終わる短い回に running は無い）
 */
export function introPhaseOf(ev: { startAt: number; aggregateAt: number }, postAt: number): IntroPhase | null {
  if (postAt >= ev.aggregateAt) return null
  const gachaAt = jstDay(ev.startAt) + INTRO_HOUR * H
  if (postAt === gachaAt) return 'gacha'
  if (postAt === gachaAt + DAY) return 'running'
  return null
}

/** サイトの intros.json を読む。形の崩れた紹介は落とす（ほかの紹介は出す）。phase が無い・不正なら running（落とさない） */
export function parseIntros(raw: unknown, site: string): IntroEntry[] {
  if (!isRecord(raw) || !Array.isArray(raw.intros)) return []
  const out: IntroEntry[] = []
  for (const e of raw.intros) {
    if (!isRecord(e) || typeof e.slug !== 'string' || !SLUG.test(e.slug) || typeof e.text !== 'string' || !Array.isArray(e.images)) continue
    if (!e.text.trim() || xWeight(e.text) > INTRO_TEXT_MAX_WEIGHT) continue
    const images = e.images.filter((i): i is { file: string; alt: string } => isRecord(i) && typeof i.file === 'string' && FILE.test(i.file) && isAlt(i.alt))
    if (images.length === 0 || images.length !== e.images.length || images.length > MAX_IMAGES) continue
    if (out.some((o) => o.slug === e.slug)) continue
    const phase: IntroPhase = e.phase === 'gacha' ? 'gacha' : 'running'
    out.push({ slug: e.slug, phase, text: e.text, images: images.map((i) => ({ url: `${site}/intro/${e.slug}/${i.file}`, alt: i.alt })) })
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

/** id の日付どうしの日数（today − その id の日付）。日付が読めない id は null */
function daysSince(id: string, today: string): number | null {
  const m = ID_DATE.exec(id)
  if (!m) return null
  const d = (Date.parse(today) - Date.parse(m[1])) / DAY
  return Number.isFinite(d) ? d : null
}

/**
 * その段に出す紹介。today は出す日（日本時間の YYYY-MM-DD）。
 * その段の紹介のうち、前に出した日から INTRO_GAP_DAYS 日たっているもの（一度も出していないものを含む）から pickIntro で選ぶ
 */
export function pickIntroFor(entries: readonly IntroEntry[], phase: IntroPhase, recentIds: readonly string[], today: string): IntroEntry | null {
  const rested = (slug: string) => {
    const last = recentIds.find((id) => id.endsWith(`:${slug}`))
    if (last == null) return true
    const d = daysSince(last, today)
    return d == null || d >= INTRO_GAP_DAYS
  }
  return pickIntro(
    entries.filter((e) => e.phase === phase && rested(e.slug)),
    recentIds,
  )
}

interface PhaseEvent {
  id: number
  phase: IntroPhase
}

/** その日（postAt）に段のある本番の回（開始の早い順）。events を1回引く */
async function phaseEventsOf(db: D1Database, postAt: number): Promise<PhaseEvent[]> {
  // gacha は開始日が今日、running は開始日が昨日の回。開始日（日本時間）で絞る
  const today = jstDay(postAt)
  const rows = await db
    .prepare(
      "SELECT id, name, asset, start_at, aggregate_at FROM events WHERE start_at >= ?1 AND start_at < ?2 AND type IN ('marathon', 'cheerful_carnival', 'world_bloom') ORDER BY start_at LIMIT ?3",
    )
    .bind(today - DAY, today + DAY, EVENT_LIMIT)
    .all<Record<string, unknown>>()
  const out: PhaseEvent[] = []
  for (const r of rows.results) {
    if (!r || typeof r.id !== 'number' || typeof r.name !== 'string' || typeof r.start_at !== 'number' || typeof r.aggregate_at !== 'number') continue
    if (isTestEvent({ name: r.name, asset: typeof r.asset === 'string' ? r.asset : null })) continue
    const phase = introPhaseOf({ startAt: r.start_at, aggregateAt: r.aggregate_at }, postAt)
    if (phase) out.push({ id: r.id, phase })
  }
  return out
}

/** 直近の機能紹介（新しい日付の順）。主キーの範囲で紹介の行だけ読む */
async function recentIntros(db: D1Database): Promise<{ id: string; eventId: number }[]> {
  const rows = await db
    .prepare('SELECT id, event_id FROM posts WHERE id >= ?1 AND id < ?2 ORDER BY id DESC LIMIT ?3')
    .bind(INTRO_ID_FROM, INTRO_ID_UNTIL, RECENT_LIMIT)
    .all<Record<string, unknown>>()
  return rows.results.flatMap((r) => (r && typeof r.id === 'string' && typeof r.event_id === 'number' ? [{ id: r.id, eventId: r.event_id }] : []))
}

export async function runIntro(env: Env, now: number, fetcher: typeof fetch = fetch): Promise<IntroResult> {
  const postAt = introSlotOf(now)
  if (postAt == null) return { status: 'idle' }
  const prefix = introIdPrefix(postAt)
  // その日の分を積んだかは主キーの範囲で最初に引く（積んだ後の見回りはこの1回で終わる。頭は ':' で終わるので次の文字 ';' までが範囲）
  const done = await env.DB.prepare('SELECT id FROM posts WHERE id >= ?1 AND id < ?2 LIMIT 1')
    .bind(prefix, `${prefix.slice(0, -1)};`)
    .first<{ id: string }>()
  if (done) return { status: 'exists', id: done.id }

  const events = await phaseEventsOf(env.DB, postAt)
  if (events.length === 0) return { status: 'idle' }
  const recent = await recentIntros(env.DB)
  // その回にもう1本出していれば、その回の段は使わない（1回に1本）
  const ev = events.find((e) => !recent.some((r) => r.eventId === e.id))
  if (!ev) return { status: 'idle' }

  // 読めなければ次の見回り（5分後）にまた読む。出す時刻を過ぎたらその日は出さない（gacha の日なら翌日の running に回る）
  let raw: unknown
  try {
    const res = await fetcher(`${env.SITE_ORIGIN}/intro/intros.json`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return { status: 'skip', reason: `intros.json が読めない（${res.status}）` }
    raw = await res.json()
  } catch (err) {
    return { status: 'skip', reason: `intros.json が読めない（${err instanceof Error ? err.message : String(err)}）` }
  }
  const entries = parseIntros(raw, env.SITE_ORIGIN)
  if (entries.length === 0) return { status: 'skip', reason: '出せる紹介が無い' }
  const entry = pickIntroFor(
    entries,
    ev.phase,
    recent.map((r) => r.id),
    jstDate(postAt),
  )
  if (!entry) {
    const next = ev.phase === 'gacha' ? '。翌日の running に回す' : ''
    return { status: 'skip', reason: `${ev.phase} の紹介は直近${INTRO_GAP_DAYS}日に出し切った${next}` }
  }

  const id = `${prefix}${entry.slug}`
  const payload: IntroPayload = { kind: 'intro', postAt, slug: entry.slug, images: entry.images }
  // 投稿の行・画像用のデータ・Discord の送信済みを1つのトランザクションで（db.ts の queuePost と同じ理由）
  const [, post] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO kv (k, v, updated_at) VALUES (?1, ?2, ?3)').bind(`post:${id}`, JSON.stringify(payload), now),
    env.DB.prepare('INSERT OR IGNORE INTO posts (id, event_id, kind, text, created_at, sent_discord_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(
      id,
      ev.id,
      'intro',
      entry.text,
      now,
    ),
  ])
  return { status: (post.meta.changes ?? 0) > 0 ? 'queued' : 'exists', id }
}
