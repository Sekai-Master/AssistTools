/**
 * マスタ（sekai-master-db-diff の events.json）の末尾だけを読んで、新しい回を events に入れる。5分ごとの見回りから呼ぶ。
 *
 * 2026-10-26（Nori が Claude に一任・案 A）: 開始直前の告知（start.ts）は、その回が開始75分前までに events に入っていることが前提。
 * events に入る道はこれまで「解析ジョブ（GitHub Actions、1日2回）」と「サイトの bonuses.json（これも Actions のカードデータ更新）」だけで、
 * 当日0時ごろにマスタへ載る回（216・217）は 10:47 の解析ジョブが1回止まるだけで告知が出なかった。Worker 自身がマスタを見る道を足す。
 * - **開催していない間だけ、1時間に1回**（毎時 0〜4分の見回り。状態を持たないので、そのための書き込みも無い）
 * - events.json は全体 2.9MB（1件約13KB の報酬の表を含む）。全部を parse すると CPU 10ms を超えうるので、**Range で末尾 64KB だけ**取る
 *   （新しい回は id 順で末尾に足される。raw.githubusercontent.com は 206 で答える。2026-10-26 確認）
 * - 末尾の切れ目は「行頭2文字の空白＋{」（配列の要素の始まり。マスタは2文字の字下げで整形されている）。そこから後ろを [ ] でくるんで parse する
 * - **206 でない（Range が効かずに全体が返る）・切れ目が見つからない・JSON が壊れている／途中で切れている** ときは何もしない（本文は読まない／書かない）
 * - 入れるのは解析ジョブの PUT /admin/events と同じ形（collect.ts の parseSchedule で検証）。upsertEvents は値の変わらない行を書かないので、
 *   ふだん（新しい回が無い）は D1 の書き込みは 0 行
 */
import { parseSchedule } from './collect.ts'
import { activeEvent, upsertEvents } from './db.ts'
import type { Env } from './env.ts'

export const MASTER_EVENTS_URL = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/events.json'
/** 末尾から読む長さ。1件約13KB なので最後の4件前後が入る */
export const MASTER_TAIL_BYTES = 64 * 1024
/** 毎時この分より前の見回りでだけ読む（5分ごとの Cron で1時間に1回） */
const RUN_MINUTES = 5

export type MasterTailResult =
  | { status: 'idle' }
  | { status: 'skip'; reason: string }
  | { status: 'checked'; events: number; changed: number; ids: number[] }

type Fetcher = typeof fetch

/**
 * 末尾の切れ端から、要素の始まり以降を配列として読む。切れ目が無い・JSON として読めなければ null。
 * 全体が届いた（先頭が [ ）ときもそのまま読む
 */
export function parseMasterTail(text: string): unknown[] | null {
  const trimmed = text.trimEnd()
  // 末尾は配列の閉じ。ここが無ければ途中で切れている
  if (!trimmed.endsWith(']')) return null
  let body: string
  if (trimmed.trimStart().startsWith('[')) {
    body = trimmed
  } else {
    const m = /\n {2}\{\n/.exec(trimmed)
    if (!m) return null
    body = `[${trimmed.slice(m.index + 1)}`
  }
  try {
    const v = JSON.parse(body) as unknown
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** マスタの1件（eventType・assetbundleName）を、PUT /admin/events と同じ形（type・asset）に直す */
export function toScheduleRows(list: readonly unknown[]): Record<string, unknown>[] {
  return list.filter(isRecord).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.eventType,
    unit: e.unit,
    startAt: e.startAt,
    aggregateAt: e.aggregateAt,
    asset: e.assetbundleName ?? null,
  }))
}

export async function runMasterTail(env: Env, now: number, fetcher: Fetcher = fetch): Promise<MasterTailResult> {
  // 1時間に1回（毎時 0〜4分の見回り）。ふだんの回はここで終わる（D1 も読まない）
  if (new Date(now).getUTCMinutes() >= RUN_MINUTES) return { status: 'idle' }
  // 開催中は読まない（開催中の回は入っている。次の回は終わってからで間に合う）
  if (await activeEvent(env.DB, now)) return { status: 'idle' }

  let res: Response
  try {
    res = await fetcher(MASTER_EVENTS_URL, { headers: { Range: `bytes=-${MASTER_TAIL_BYTES}`, 'User-Agent': 'sekaimaster-border/1.0 (+https://sekaimaster.pages.dev)' } })
  } catch (err) {
    return { status: 'skip', reason: `マスタを読めなかった（${err instanceof Error ? err.message : String(err)}）` }
  }
  if (res.status !== 206) {
    // Range が効かずに全体（2.9MB）が返ってきたら、本文は読まずに捨てる（CPU の枠を守る）
    await res.body?.cancel().catch(() => undefined)
    return { status: 'skip', reason: `マスタが ${res.status} を返した（末尾だけを返す 206 でない）` }
  }
  const text = await res.text()
  // 頼んだより大きく返ってきたら読まない（Range の扱いが変わったなど）
  if (text.length > MASTER_TAIL_BYTES * 2) return { status: 'skip', reason: `末尾が大きすぎる（${text.length} 文字）` }
  const list = parseMasterTail(text)
  if (!list) return { status: 'skip', reason: '末尾を JSON として読めなかった（切れ目が無い・壊れている・途中で切れている）' }
  const events = parseSchedule({ events: toScheduleRows(list) }, now)
  if (events.length === 0) return { status: 'checked', events: 0, changed: 0, ids: [] }
  const changed = await upsertEvents(env.DB, events)
  return { status: 'checked', events: events.length, changed, ids: events.map((e) => e.id) }
}
