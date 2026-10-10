import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askClaude, MODEL } from './client.ts'
import { localImports, scriptPaths, tail } from './diagnose.ts'
import { upsertIssue } from './github.ts'
import { queuePost } from './queue.ts'

type Call = { url: string; init: RequestInit }
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
  return { f, calls }
}

const saved = { ...process.env }
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-key'
  process.env.GH_TOKEN = 'gh-test'
  process.env.GITHUB_REPOSITORY = 'o/r'
  process.env.BORDER_API = 'https://w.example'
  process.env.BORDER_ADMIN_TOKEN = 'adm'
})
afterEach(() => {
  process.env = { ...saved }
})

describe('askClaude', () => {
  it('モデルと鍵を付けて呼び、文だけを返す', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { content: [{ type: 'text', text: ' こんにちは ' }], usage: { input_tokens: 1, output_tokens: 2 } } }])
    expect(await askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f)).toBe('こんにちは')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.model).toBe(MODEL)
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('sk-test-key')
  })

  // ★ Actions のログは公開。失敗の文面に鍵を載せない
  it('失敗の文面に鍵を載せない', async () => {
    const { f } = fakeFetch([{ status: 401, body: { error: { type: 'authentication_error' } } }])
    const err = await askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f).catch((e: Error) => e)
    expect(String(err)).toContain('401')
    expect(String(err)).not.toContain('sk-test-key')
  })

  // 2026-10-10 の 219 の改善案: thinking が上限を使い切り、thinking の塊だけが返った（文が空）
  it('考える段階で上限に達して文が無いときは、そうと分かる失敗にする', async () => {
    const { f } = fakeFetch([
      { status: 200, body: { content: [{ type: 'thinking', thinking: '' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 10 } } },
    ])
    await expect(askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f)).rejects.toThrow('考える段階で上限')
  })

  it('本文の途中で上限に達したものは使わない（切れた文を出さない）', async () => {
    const { f } = fakeFetch([
      { status: 200, body: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '途中まで' }], stop_reason: 'max_tokens' } },
    ])
    await expect(askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f)).rejects.toThrow('本文の途中で上限')
  })

  it('thinking の塊があっても、最後まで書けた文だけを返す', async () => {
    const { f } = fakeFetch([
      { status: 200, body: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '答え' }], stop_reason: 'end_turn' } },
    ])
    expect(await askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f)).toBe('答え')
  })

  it('鍵が無ければ呼ばない', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { f, calls } = fakeFetch([{ status: 200, body: {} }])
    await expect(askClaude({ label: 't', system: 's', user: 'u', maxTokens: 10 }, f)).rejects.toThrow('ANTHROPIC_API_KEY')
    expect(calls).toHaveLength(0)
  })
})

describe('一次診断の材料', () => {
  it('ワークフローから動かすスクリプトを拾い、相対 import を1段たどる', () => {
    expect(scriptPaths('run: node scripts/refresh-music-data.js\n  run: node scripts/lib/a.mjs && node scripts/refresh-music-data.js')).toEqual([
      'scripts/refresh-music-data.js',
      'scripts/lib/a.mjs',
    ])
    expect(localImports("import x from './lib/musicRelease.mjs'\nimport y from '../src/z.ts'", 'scripts/refresh-music-data.js')).toEqual([
      'scripts/lib/musicRelease.mjs',
      'src/z.ts',
    ])
  })

  it('長いログは失敗の書いてある末尾を残す', () => {
    expect(tail('abcdef', 3)).toBe('…（前略 3 字）\ndef')
    expect(tail('abc', 3)).toBe('abc')
  })
})

describe('upsertIssue', () => {
  it('同じ件が開いていれば追記する', async () => {
    const { f, calls } = fakeFetch([
      { status: 422, body: {} },
      { status: 200, body: [{ number: 7, title: '[自動診断] Refresh music data が失敗（2026-10-01）', html_url: 'https://g/7' }] },
      { status: 201, body: {} },
    ])
    const url = await upsertIssue({ title: '[自動診断] Refresh music data が失敗（2026-10-08）', dedupePrefix: '[自動診断] Refresh music data が失敗', label: 'auto-diagnosis', body: 'b' }, f)
    expect(url).toBe('https://g/7')
    expect(calls[2].url).toContain('/issues/7/comments')
  })

  it('無ければ新しく作る', async () => {
    const { f, calls } = fakeFetch([
      { status: 201, body: {} },
      { status: 200, body: [] },
      { status: 201, body: { html_url: 'https://g/9' } },
    ])
    expect(await upsertIssue({ title: 't', dedupePrefix: 't', label: 'l', body: 'b' }, f)).toBe('https://g/9')
    expect(calls[2].url).toMatch(/\/repos\/o\/r\/issues$/)
  })
})

describe('queuePost', () => {
  it('X だけのときは Discord 側を送信済みにする', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { queued: true } }])
    expect(await queuePost({ id: 'x1', eventId: 0, kind: 'announce', text: 't', xOnly: true }, f)).toBe(true)
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual(['PUT https://w.example/admin/posts', 'POST https://w.example/admin/posts/sent'])
  })

  it('両方に出すときは送信済みにしない', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { queued: true } }])
    await queuePost({ id: 'x1', eventId: 0, kind: 'insight', text: 't', xOnly: false }, f)
    expect(calls).toHaveLength(1)
  })
})
