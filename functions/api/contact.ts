/**
 * /api/contact — 問い合わせの受け口（Cloudflare Pages Functions）。
 *
 * 画面（src/pages/contact）から同一オリジンで受け、Turnstile の確認を通ったものだけを
 * 運営者（noribot70）の Google フォームの formResponse へ中継する。届いたことは Discord に知らせる。
 * 作り方を選んだ理由と運用は、指揮の指示書（border-research の features/contact-2026-11）にある。
 *
 * ★ フォームの ID と entry の番号は **Pages の秘密にだけ置く**。リポジトリは公開なので、
 *   コード・テスト・ログに書くと、Turnstile を飛ばしてフォームへ直接送れてしまう。
 * ★ 運営者のコードは IP を扱わない。siteverify に remoteip を送らない（プライバシーポリシー第4項のまま）。
 * ★ ログは失敗の種類の符号だけ。例外の文には Google の URL（＝フォームの ID）が入ることがあるので
 *   err をそのまま出さない。内容・返信先も出さない。応答にも外の応答の本文や環境変数を返さない。
 * ★ CPU の枠（10ms）: 重い処理はしない。fetch の待ちは数えない。
 */
import {
  CONTACT_REPLY_MAX,
  CONTACT_REQUEST_MAX_BYTES,
  bodyProblem,
  charCount,
  normalizeKind,
  normalizePage,
  normalizeVersion,
  type ContactKind,
} from '../../src/lib/contactRules.ts'
import { SITE_URL } from '../../src/lib/site.ts'

export interface ContactEnv {
  /** Turnstile の秘密の鍵。 */
  TURNSTILE_SECRET?: string
  /** 回答用の URL（https://docs.google.com/forms/d/e/<ここ>/viewform）の ID。 */
  CONTACT_FORM_ID?: string
  /** JSON {"kind":"<数字>","body":"<数字>","reply":"<数字>","page":"<数字>","ver":"<数字>"}。番号は文字列で書く。 */
  CONTACT_FORM_ENTRIES?: string
  /** 届いたことの知らせ先（任意）。 */
  CONTACT_DISCORD_WEBHOOK?: string
  /** "1" で受付を止める（任意）。画面は代わりの窓口を出す。 */
  CONTACT_DISABLED?: string
}

const ENTRY_KEYS = ['kind', 'body', 'reply', 'page', 'ver'] as const
type EntryKey = (typeof ENTRY_KEYS)[number]

interface RelayConfig {
  secret: string
  formId: string
  entries: Record<EntryKey, string>
}

interface Submission {
  kind: ContactKind
  /** 送る内容（種類が選択肢の外なら、頭に元の値を添えたもの）。 */
  body: string
  reply: string
  page: string
  ver: string
  token: string
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const FETCH_TIMEOUT_MS = 8000
const TOKEN_MAX = 2048
/** Google の 5 問は全部必須。空の欄はこれで埋める（entry の取り違えが必ず 400 になるように）。 */
const EMPTY = '（なし）'

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (status: number, error: string) => json({ ok: false, error }, status)

/** 環境変数を読む。欠け・壊れは null（＝受け付けていない）。 */
export function readConfig(env: ContactEnv): RelayConfig | null {
  if (env.CONTACT_DISABLED === '1') return null
  const secret = env.TURNSTILE_SECRET?.trim()
  const formId = env.CONTACT_FORM_ID?.trim()
  if (!secret || !formId || !/^[A-Za-z0-9_-]{10,200}$/.test(formId)) return null
  const entries = parseEntries(env.CONTACT_FORM_ENTRIES)
  return entries ? { secret, formId, entries } : null
}

function parseEntries(raw: string | undefined): Record<EntryKey, string> | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const out = {} as Record<EntryKey, string>
  for (const key of ENTRY_KEYS) {
    const v = obj[key]
    if (typeof v !== 'string' || !/^\d{1,20}$/.test(v)) return null
    out[key] = v
  }
  return out
}

export function handleGet(env: ContactEnv): Response {
  return json({ accepting: readConfig(env) !== null })
}

/**
 * 本文を上限つきで読む。超えたら null。
 * Content-Length を先に見るが、無い（chunked）こともあるので、読みながらも数える。
 */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(bytes)
}

type Parsed = { ok: true; sub: Submission } | { ok: false; status: number; error: string }

/** 入力を確かめる。内容・返信先だけが 400 の理由になる。種類・ページ・版は寄せるか空にする（レビュー 中-3）。 */
function parseSubmission(obj: Record<string, unknown>): Parsed {
  if (typeof obj.body !== 'string' || bodyProblem(obj.body)) return { ok: false, status: 400, error: 'invalid' }
  const reply = obj.reply ?? ''
  if (typeof reply !== 'string' || charCount(reply.trim()) > CONTACT_REPLY_MAX) {
    return { ok: false, status: 400, error: 'invalid' }
  }
  const token = obj.token
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) {
    return { ok: false, status: 403, error: 'verify' }
  }
  const { kind, original } = normalizeKind(obj.kind)
  const body = obj.body.trim()
  return {
    ok: true,
    sub: {
      kind,
      body: original ? `（種類: ${original}）\n${body}` : body,
      reply: reply.trim(),
      page: normalizePage(obj.page),
      ver: normalizeVersion(obj.ver),
      token,
    },
  }
}

/** 本文を読んで JSON のオブジェクトにする。 */
async function readSubmission(request: Request): Promise<Parsed> {
  const text = await readCapped(request, CONTACT_REQUEST_MAX_BYTES)
  if (text === null) return { ok: false, status: 413, error: 'too_large' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, status: 400, error: 'bad_request' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, status: 400, error: 'bad_request' }
  }
  return parseSubmission(value as Record<string, unknown>)
}

const errorCode = (err: unknown) =>
  err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'error'

/**
 * Turnstile の siteverify。secret と response だけを送る（remoteip は送らない）。
 * - ok: 通った ／ rejected: 人の操作と確かめられなかった（403）／ unavailable: 確認そのものができない（502）
 * ★ 試験用の鍵の結果は hostname が example.com で返る（2026-11-12 に手元で実測）。その結果だけは
 *   hostname を比べない。本物の秘密の結果には result_with_testing_key が付かないので、本番の判定は緩まない。
 */
async function verifyTurnstile(secret: string, token: string, hostname: string): Promise<'ok' | 'rejected' | 'unavailable'> {
  let res: Response
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('contact', 'verify', errorCode(err))
    return 'unavailable'
  }
  if (!res.ok) {
    console.error('contact', 'verify_status', res.status)
    return 'unavailable'
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    console.error('contact', 'verify_json')
    return 'unavailable'
  }
  return judgeVerify(data, hostname)
}

function judgeVerify(data: unknown, hostname: string): 'ok' | 'rejected' | 'unavailable' {
  if (typeof data !== 'object' || data === null) return 'unavailable'
  const d = data as { success?: unknown; hostname?: unknown; 'error-codes'?: unknown; metadata?: unknown }
  const codes = Array.isArray(d['error-codes']) ? d['error-codes'] : []
  if (codes.includes('internal-error')) {
    console.error('contact', 'verify_internal')
    return 'unavailable'
  }
  if (d.success !== true) return 'rejected'
  const testing =
    typeof d.metadata === 'object' && d.metadata !== null &&
    (d.metadata as { result_with_testing_key?: unknown }).result_with_testing_key === true
  if (!testing && d.hostname !== hostname) {
    console.error('contact', 'verify_hostname')
    return 'rejected'
  }
  return 'ok'
}

/** Google フォームへ中継する。200 だけが成功。失敗は理由の符号を返す（ログと Discord に使う）。 */
async function relayToForm(config: RelayConfig, sub: Submission): Promise<string | null> {
  const fields: Record<EntryKey, string> = { kind: sub.kind, body: sub.body, reply: sub.reply, page: sub.page, ver: sub.ver }
  const form = new URLSearchParams()
  for (const key of ENTRY_KEYS) form.set(`entry.${config.entries[key]}`, fields[key] || EMPTY)
  let res: Response
  try {
    res = await fetch(`https://docs.google.com/forms/d/e/${config.formId}/formResponse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    return `relay_${errorCode(err)}`
  }
  // 本文は読まない（返すことも、ログに出すこともしない）
  await res.body?.cancel().catch(() => {})
  return res.status === 200 ? null : `relay_status_${res.status}`
}

/** Discord のウェブフックへ知らせる。失敗しても利用者への応答には影響させない。 */
async function notifyDiscord(webhook: string | undefined, content: string): Promise<void> {
  if (!webhook || !webhook.startsWith('https://')) return
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'SekaiMaster',
        avatar_url: `${SITE_URL}/images/icon.png`,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) console.error('contact', 'discord_status', res.status)
    await res.body?.cancel().catch(() => {})
  } catch (err) {
    console.error('contact', 'discord', errorCode(err))
  }
}

export async function handlePost(
  request: Request,
  env: ContactEnv,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response> {
  const url = new URL(request.url)
  // 本番・プレビュー・手元で同じ式。正規表現でホストを並べない（レビュー 中-1）
  if (request.headers.get('Origin') !== url.origin) return fail(403, 'origin')
  const config = readConfig(env)
  if (!config) return fail(503, 'closed')

  const parsed = await readSubmission(request)
  if (!parsed.ok) return fail(parsed.status, parsed.error)
  const { sub } = parsed

  const verdict = await verifyTurnstile(config.secret, sub.token, url.hostname)
  if (verdict === 'rejected') return fail(403, 'verify')
  if (verdict === 'unavailable') return fail(502, 'unavailable')

  const relayError = await relayToForm(config, sub)
  if (relayError) {
    console.error('contact', relayError)
    waitUntil(notifyDiscord(env.CONTACT_DISCORD_WEBHOOK, `問い合わせの中継に失敗しました（${relayError}）。利用者には代わりの窓口を出しています`))
    return fail(502, 'unavailable')
  }
  waitUntil(
    notifyDiscord(
      env.CONTACT_DISCORD_WEBHOOK,
      `SekaiMaster に問い合わせが 1 件届きました（種類: ${sub.kind}）。内容は 9:00・21:00 の巡回の下書きかシートで`,
    ),
  )
  return json({ ok: true })
}

export const onRequestGet: PagesFunction<ContactEnv> = ({ env }) => handleGet(env)

export const onRequestPost: PagesFunction<ContactEnv> = (context) =>
  handlePost(context.request, context.env, (p) => context.waitUntil(p))
