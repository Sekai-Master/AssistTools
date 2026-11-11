/**
 * /api/contact（問い合わせの受け口）。
 *
 * ★ フォームの ID・entry の番号は架空の値（TESTFORMID・111〜555）。本物はリポジトリに書かない
 *  （公開リポジトリ。書くと Turnstile を飛ばして Google フォームへ直接送られる）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGet, handlePost, type ContactEnv } from './contact.ts'

const ORIGIN = 'https://sekaimaster.pages.dev'
const URL_ = `${ORIGIN}/api/contact`
const WEBHOOK = 'https://discord.com/api/webhooks/0/TESTWEBHOOK'
const ENTRIES = { kind: '111', body: '222', reply: '333', page: '444', ver: '555' }

const ENV: ContactEnv = {
  TURNSTILE_SECRET: 'TESTSECRET',
  CONTACT_FORM_ID: 'TESTFORMID',
  CONTACT_FORM_ENTRIES: JSON.stringify(ENTRIES),
  CONTACT_DISCORD_WEBHOOK: WEBHOOK,
}

const BODY_TEXT = '計算結果がおかしい。秘密の本文'
const REPLY_TEXT = 'secret-reply@example.com'
const VALID = { kind: '不具合の報告', body: BODY_TEXT, reply: REPLY_TEXT, page: '/border', ver: '1.31.0', token: 'TOKEN' }

type Call = { url: string; init: RequestInit }

/** 外への fetch の差し替え。siteverify・Google・Discord を URL で振り分ける。 */
function stubFetch(o: {
  verify?: () => Response | Promise<Response>
  google?: () => Response | Promise<Response>
  discord?: () => Response | Promise<Response>
} = {}) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      return o.verify ? o.verify() : Response.json({ success: true, hostname: 'sekaimaster.pages.dev', 'error-codes': [] })
    }
    if (url.startsWith('https://docs.google.com/')) return o.google ? o.google() : new Response('ok', { status: 200 })
    if (url.startsWith('https://discord.com/')) return o.discord ? o.discord() : new Response(null, { status: 204 })
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  const of = (prefix: string) => calls.filter((c) => c.url.startsWith(prefix))
  return {
    calls,
    verifyCalls: () => of('https://challenges.cloudflare.com/'),
    googleCalls: () => of('https://docs.google.com/'),
    discordCalls: () => of('https://discord.com/'),
  }
}

function post(body: unknown, headers: Record<string, string> = {}, url = URL_) {
  return new Request(url, {
    method: 'POST',
    headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** waitUntil に渡された約束を集め、応答のあとで待てるようにする。 */
function waiter() {
  const pending: Promise<unknown>[] = []
  return { waitUntil: (p: Promise<unknown>) => void pending.push(p), settle: () => Promise.all(pending) }
}

async function send(req: Request, env: ContactEnv = ENV) {
  const w = waiter()
  const res = await handlePost(req, env, w.waitUntil)
  await w.settle()
  return { res, data: (await res.json()) as Record<string, unknown> }
}

const formOf = (c: Call) => new URLSearchParams(String(c.init.body))
const discordJson = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>

let errorLog: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * ログに出た文字を全部つなげる。
 * ★ JSON.stringify では Error の message・stack が落ちる（列挙できないため {} になる）ので、自分で文字にする。
 *   これを使わないと「err をそのまま出す」実装をテストが見逃す（実際に見逃した）。
 */
const loggedText = () =>
  errorLog.mock.calls
    .flat()
    .map((a: unknown) => (a instanceof Error ? `${a.name} ${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)))
    .join('\n')

describe('GET（受け付けているか）', () => {
  const accepting = async (env: ContactEnv) => ((await handleGet(env).json()) as { accepting: unknown }).accepting

  it('環境変数がそろっていれば true。キャッシュさせない', async () => {
    const res = handleGet(ENV)
    expect(await res.json()).toEqual({ accepting: true })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('ウェブフックは任意（無くても受け付ける）', async () => {
    expect(await accepting({ ...ENV, CONTACT_DISCORD_WEBHOOK: undefined })).toBe(true)
  })

  it('CONTACT_DISABLED=1 で止まる（1 以外では止まらない）', async () => {
    expect(await accepting({ ...ENV, CONTACT_DISABLED: '1' })).toBe(false)
    expect(await accepting({ ...ENV, CONTACT_DISABLED: '0' })).toBe(true)
  })

  /*
   * ★ 止めた（disabled）のか、設定が壊れている（misconfigured）のかを分ける（検分 中-2）。
   *   どの変数が欠けたか・値そのものは出さない。壊れているときはログに符号を出す
   */
  it('受け付けない理由の符号を返す。止めたときと設定の壊れを分け、変数の名前や値は出さない', async () => {
    expect(await handleGet({ ...ENV, CONTACT_DISABLED: '1' }).json()).toEqual({ accepting: false, reason: 'disabled' })
    expect(errorLog).not.toHaveBeenCalled()
    const res = handleGet({ ...ENV, CONTACT_FORM_ENTRIES: '{' })
    const raw = await res.text()
    expect(JSON.parse(raw)).toEqual({ accepting: false, reason: 'misconfigured' })
    for (const s of ['CONTACT_FORM_ENTRIES', 'TESTSECRET', 'TESTFORMID']) expect(raw).not.toContain(s)
    expect(loggedText()).toContain('misconfigured')
  })

  it.each([
    ['秘密が無い', { TURNSTILE_SECRET: undefined }],
    ['秘密が空', { TURNSTILE_SECRET: '  ' }],
    ['フォームの ID が無い', { CONTACT_FORM_ID: undefined }],
    ['フォームの ID の形が違う', { CONTACT_FORM_ID: 'a/b?c' }],
    ['entry が無い', { CONTACT_FORM_ENTRIES: undefined }],
    ['entry が JSON でない', { CONTACT_FORM_ENTRIES: '{kind:111' }],
    ['entry が null', { CONTACT_FORM_ENTRIES: 'null' }],
    ['entry が配列', { CONTACT_FORM_ENTRIES: '["111"]' }],
    ['entry の欄が欠ける', { CONTACT_FORM_ENTRIES: JSON.stringify({ ...ENTRIES, ver: undefined }) }],
    ['entry の番号が数字でない', { CONTACT_FORM_ENTRIES: JSON.stringify({ ...ENTRIES, body: 'entry.222' }) }],
    ['entry の番号が文字列でない', { CONTACT_FORM_ENTRIES: JSON.stringify({ ...ENTRIES, kind: 111 }) }],
  ])('%s → false', async (_, patch) => {
    expect(await accepting({ ...ENV, ...patch })).toBe(false)
  })
})

describe('POST の門（Origin・受付・大きさ・形）', () => {
  it('Origin がリクエストの URL と違えば 403。外へは何も送らない', async () => {
    const f = stubFetch()
    const { res } = await send(post(VALID, { Origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(f.calls).toHaveLength(0)
  })

  it('Origin が無ければ 403', async () => {
    const f = stubFetch()
    const req = new Request(URL_, { method: 'POST', body: JSON.stringify(VALID) })
    const { res } = await send(req)
    expect(res.status).toBe(403)
    expect(f.calls).toHaveLength(0)
  })

  it('プレビューの枝のホストでも、同じ式で通る', async () => {
    stubFetch({ verify: () => Response.json({ success: true, hostname: 'feat-contact.sekaimaster.pages.dev' }) })
    const { res } = await send(post(VALID, {}, 'https://feat-contact.sekaimaster.pages.dev/api/contact'))
    expect(res.status).toBe(200)
  })

  it('受け付けていなければ 503', async () => {
    const f = stubFetch()
    const { res } = await send(post(VALID), { ...ENV, CONTACT_DISABLED: '1' })
    expect(res.status).toBe(503)
    expect(f.calls).toHaveLength(0)
  })

  it('entry の設定が壊れていれば 503（500 にしない）', async () => {
    stubFetch()
    const { res } = await send(post(VALID), { ...ENV, CONTACT_FORM_ENTRIES: '{' })
    expect(res.status).toBe(503)
  })

  it('Content-Length が 16KB を超えれば 413', async () => {
    const f = stubFetch()
    const { res } = await send(post(VALID, { 'Content-Length': String(16 * 1024 + 1) }))
    expect(res.status).toBe(413)
    expect(f.calls).toHaveLength(0)
  })

  it('Content-Length が無くても、読んだバイト数が 16KB を超えれば 413', async () => {
    stubFetch()
    const big = JSON.stringify({ ...VALID, pad: 'あ'.repeat(6000) }) // UTF-8 で 18KB
    const stream = new Blob([big]).stream()
    const req = new Request(URL_, { method: 'POST', headers: { Origin: ORIGIN }, body: stream, duplex: 'half' } as RequestInit)
    const { res } = await send(req)
    expect(res.status).toBe(413)
  })

  it.each([
    ['JSON でない', '{body:'],
    ['null', 'null'],
    ['配列', '[]'],
    ['文字列', '"x"'],
  ])('%s → 400', async (_, raw) => {
    const f = stubFetch()
    const { res } = await send(post(raw))
    expect(res.status).toBe(400)
    expect(f.calls).toHaveLength(0)
  })
})

describe('POST の入力の検査', () => {
  it.each([
    ['内容が無い', { body: undefined }],
    ['内容が文字列でない', { body: 12 }],
    ['内容が空', { body: '' }],
    ['内容が空白だけ', { body: ' \n　' }],
    ['内容が 2,001 字', { body: 'あ'.repeat(2001) }],
    ['返信先が 101 字', { reply: 'a'.repeat(101) }],
    ['返信先が文字列でない', { reply: 5 }],
  ])('%s → 400、確認の前に止める', async (_, patch) => {
    const f = stubFetch()
    const { res, data } = await send(post({ ...VALID, ...patch }))
    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(f.verifyCalls()).toHaveLength(0)
  })

  it('内容は 2,000 字ちょうど（前後の空白は除く）なら通る', async () => {
    stubFetch()
    const { res } = await send(post({ ...VALID, body: `\n ${'あ'.repeat(2000)} \n` }))
    expect(res.status).toBe(200)
  })

  it('種類が選択肢の外なら「その他」で送り、内容の頭に元の値を添える（400 にしない）', async () => {
    const f = stubFetch()
    const { res } = await send(post({ ...VALID, kind: '消えた選択肢' }))
    expect(res.status).toBe(200)
    const form = formOf(f.googleCalls()[0])
    expect(form.get('entry.111')).toBe('その他')
    expect(form.get('entry.222')).toBe(`（種類: 消えた選択肢）\n${BODY_TEXT}`)
  })

  it('ページ・版の形が崩れていれば「（なし）」で送る（400 にしない）', async () => {
    const f = stubFetch()
    const { res } = await send(post({ ...VALID, page: 'https://evil.example/', ver: 'v1' }))
    expect(res.status).toBe(200)
    const form = formOf(f.googleCalls()[0])
    expect(form.get('entry.444')).toBe('（なし）')
    expect(form.get('entry.555')).toBe('（なし）')
  })

  it('token が無ければ 403。siteverify を呼ばない', async () => {
    const f = stubFetch()
    const { res } = await send(post({ ...VALID, token: undefined }))
    expect(res.status).toBe(403)
    expect(f.verifyCalls()).toHaveLength(0)
  })
})

describe('POST の Turnstile の確認', () => {
  it('secret と response だけを送る（remoteip は送らない）。時間切れを付ける', async () => {
    const f = stubFetch()
    await send(post(VALID, { 'CF-Connecting-IP': '203.0.113.9' }))
    const c = f.verifyCalls()[0]
    expect(c.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect([...formOf(c).keys()].sort()).toEqual(['response', 'secret'])
    expect(formOf(c).get('response')).toBe('TOKEN')
    expect(String(c.init.body)).not.toContain('203.0.113.9')
    expect(c.init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([['invalid-input-response'], ['timeout-or-duplicate'], ['missing-input-response']])(
    '利用者の token の問題（%s）は 403。Google にも Discord にも送らず、ログに符号だけ出す',
    async (code) => {
      const f = stubFetch({ verify: () => Response.json({ success: false, 'error-codes': [code] }) })
      const { res, data } = await send(post(VALID))
      expect(res.status).toBe(403)
      expect(data.error).toBe('verify')
      expect(f.googleCalls()).toHaveLength(0)
      expect(f.discordCalls()).toHaveLength(0)
      expect(loggedText()).toContain(code)
    },
  )

  it('hostname がリクエストのホストと違えば 403', async () => {
    const f = stubFetch({ verify: () => Response.json({ success: true, hostname: 'evil.example' }) })
    const { res } = await send(post(VALID))
    expect(res.status).toBe(403)
    expect(f.googleCalls()).toHaveLength(0)
  })

  /*
   * ★ 運営者の側の失敗（秘密の誤り・失効）を、利用者の「確認に失敗」（403）に化けさせない（検分 高-2）。
   *   利用者には「いまは送れません」（503・代わりの窓口）、運営者には Discord で知らせる
   */
  it.each([['invalid-input-secret'], ['missing-input-secret']])(
    '秘密の設定の誤り（%s）は 503。Google には送らず、Discord に符号を知らせる',
    async (code) => {
      const f = stubFetch({ verify: () => Response.json({ success: false, 'error-codes': [code] }) })
      const { res, data } = await send(post(VALID))
      expect(res.status).toBe(503)
      expect(data.error).toBe('unavailable')
      expect(f.googleCalls()).toHaveLength(0)
      const msg = discordJson(f.discordCalls()[0])
      expect(msg.content).toContain('Turnstile の秘密')
      expect(msg.content).toContain(code)
      expect(String(f.discordCalls()[0].init.body)).not.toContain(BODY_TEXT)
      expect(loggedText()).toContain(code)
    },
  )

  const TESTING = { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } }

  it.each([['http://localhost:8788/api/contact'], ['http://127.0.0.1:3012/api/contact']])(
    '試験用の鍵の結果（hostname が example.com）は、手元（%s）でだけ hostname を比べずに通す',
    async (url) => {
      stubFetch({ verify: () => Response.json(TESTING) })
      const { res } = await send(post(VALID, {}, url))
      expect(res.status).toBe(200)
    },
  )

  /*
   * ★ 試験用の秘密は、どんな token も通す（2026-11-12 に検分が実測）。本番やプレビューに貼られたら、
   *   確認がすり抜けないよう止めて知らせる（検分 中-1）
   */
  it('試験用の鍵の結果が本番・プレビューのホストで返ったら、通さずに 503。Discord に「試験用の秘密」を知らせる', async () => {
    const f = stubFetch({ verify: () => Response.json(TESTING) })
    const { res, data } = await send(post(VALID))
    expect(res.status).toBe(503)
    expect(data.error).toBe('unavailable')
    expect(f.googleCalls()).toHaveLength(0)
    expect(discordJson(f.discordCalls()[0]).content).toContain('試験用の秘密')
    expect(loggedText()).toContain('verify_testing_key')
  })

  it('試験用の鍵で success が false でも、本番のホストなら設定の誤りとして知らせる', async () => {
    const f = stubFetch({ verify: () => Response.json({ ...TESTING, success: false, 'error-codes': ['invalid-input-response'] }) })
    const { res } = await send(post(VALID))
    expect(res.status).toBe(503)
    expect(discordJson(f.discordCalls()[0]).content).toContain('試験用の秘密')
  })

  it.each([
    ['fetch の例外', () => Promise.reject(new Error('network'))],
    ['5xx', () => new Response('bad', { status: 503 })],
    ['internal-error', () => Response.json({ success: false, 'error-codes': ['internal-error'] })],
    ['JSON でない', () => new Response('<html>', { status: 200 })],
  ])('siteverify 自体の失敗（%s）は 502', async (_, verify) => {
    const f = stubFetch({ verify })
    const { res, data } = await send(post(VALID))
    expect(res.status).toBe(502)
    expect(data.error).toBe('unavailable')
    expect(f.googleCalls()).toHaveLength(0)
  })
})

describe('POST の Google フォームへの中継', () => {
  it('5 つの entry を全部、form-urlencoded（UTF-8）で送る。リダイレクトを追わない', async () => {
    const f = stubFetch()
    const { res, data } = await send(post(VALID))
    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: true })
    const c = f.googleCalls()[0]
    expect(c.url).toBe('https://docs.google.com/forms/d/e/TESTFORMID/formResponse')
    expect(c.init.method).toBe('POST')
    expect(c.init.redirect).toBe('manual')
    expect(c.init.signal).toBeInstanceOf(AbortSignal)
    expect(new Headers(c.init.headers).get('Content-Type')).toMatch(/^application\/x-www-form-urlencoded/)
    expect(Object.fromEntries(formOf(c))).toEqual({
      'entry.111': '不具合の報告',
      'entry.222': BODY_TEXT,
      'entry.333': REPLY_TEXT,
      'entry.444': '/border',
      'entry.555': '1.31.0',
    })
  })

  it('空の欄は「（なし）」で送る（Google の 5 問は全部必須）', async () => {
    const f = stubFetch()
    await send(post({ kind: 'その他', body: '  本文  ', token: 'TOKEN' }))
    expect(Object.fromEntries(formOf(f.googleCalls()[0]))).toEqual({
      'entry.111': 'その他',
      'entry.222': '本文',
      'entry.333': '（なし）',
      'entry.444': '（なし）',
      'entry.555': '（なし）',
    })
  })

  it.each([
    ['400', () => new Response('bad', { status: 400 })],
    ['302', () => new Response(null, { status: 302, headers: { Location: 'https://accounts.google.com/' } })],
    ['500', () => new Response('bad', { status: 500 })],
    // 2xx でも 200 以外は成功にしない（res.ok で判定すると通ってしまう。検分のテストの穴）
    ['204', () => new Response(null, { status: 204 })],
  ])('Google が %s なら 502', async (_, google) => {
    stubFetch({ google })
    const { res, data } = await send(post(VALID))
    expect(res.status).toBe(502)
    expect(data.error).toBe('unavailable')
  })

  it('Google への fetch が例外なら 502。ログに例外の文（フォームの URL）を出さない', async () => {
    stubFetch({ google: () => Promise.reject(new Error('fetch failed https://docs.google.com/forms/d/e/TESTFORMID/formResponse')) })
    const { res } = await send(post(VALID))
    expect(res.status).toBe(502)
    expect(loggedText()).not.toContain('TESTFORMID')
  })
})

describe('Discord への知らせ', () => {
  it('成功したら種類だけを知らせる。内容・返信先・ページは流さない', async () => {
    const f = stubFetch()
    await send(post(VALID))
    const [c] = f.discordCalls()
    expect(c.url).toBe(WEBHOOK)
    const msg = discordJson(c)
    expect(msg.content).toContain('種類: 不具合の報告')
    expect(msg.username).toBe('SekaiMaster')
    expect(msg.avatar_url).toBe('https://sekaimaster.pages.dev/images/icon.png')
    expect(msg.allowed_mentions).toEqual({ parse: [] })
    const raw = String(c.init.body)
    for (const secret of [BODY_TEXT, REPLY_TEXT, '/border', '1.31.0']) expect(raw).not.toContain(secret)
  })

  it('中継に失敗したら、理由の符号を知らせる（運営者が止まったことに気づけるように）', async () => {
    const f = stubFetch({ google: () => new Response('bad', { status: 400 }) })
    await send(post(VALID))
    const msg = discordJson(f.discordCalls()[0])
    expect(msg.content).toContain('中継に失敗')
    expect(msg.content).toContain('relay_status_400')
    expect(String(f.discordCalls()[0].init.body)).not.toContain(BODY_TEXT)
  })

  it('確認に失敗しただけ（403）では知らせない', async () => {
    const f = stubFetch({ verify: () => Response.json({ success: false }) })
    await send(post(VALID))
    expect(f.discordCalls()).toHaveLength(0)
  })

  it('Discord が失敗しても、利用者への応答は 200 のまま', async () => {
    stubFetch({ discord: () => Promise.reject(new Error('down')) })
    expect((await send(post(VALID))).res.status).toBe(200)
    stubFetch({ discord: () => new Response('x', { status: 500 }) })
    expect((await send(post(VALID))).res.status).toBe(200)
  })

  it('ウェブフックが未設定なら知らせだけ飛ばす', async () => {
    const f = stubFetch()
    const { res } = await send(post(VALID), { ...ENV, CONTACT_DISCORD_WEBHOOK: undefined })
    expect(res.status).toBe(200)
    expect(f.discordCalls()).toHaveLength(0)
  })
})

describe('ログ・応答に中身を出さない', () => {
  it('どの失敗でも、ログに内容・返信先・秘密を出さない', async () => {
    stubFetch({ google: () => Promise.reject(new Error(BODY_TEXT)), discord: () => Promise.reject(new Error(REPLY_TEXT)) })
    await send(post(VALID))
    stubFetch({ verify: () => Promise.reject(new Error('TESTSECRET')) })
    await send(post(VALID))
    const logged = loggedText()
    expect(errorLog).toHaveBeenCalled()
    for (const s of [BODY_TEXT, REPLY_TEXT, 'TESTSECRET', 'TESTFORMID', 'TESTWEBHOOK']) expect(logged).not.toContain(s)
  })

  it('応答に環境変数・外の応答の本文を返さない', async () => {
    stubFetch({ google: () => new Response('GOOGLE_BODY TESTFORMID', { status: 400 }) })
    const { data } = await send(post(VALID))
    const raw = JSON.stringify(data)
    for (const s of ['GOOGLE_BODY', 'TESTFORMID', 'TESTSECRET', '111']) expect(raw).not.toContain(s)
  })
})
