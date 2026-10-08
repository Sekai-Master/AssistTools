/**
 * Claude API（Messages）を依存パッケージなしで呼ぶ。GitHub Actions のジョブから使う（Node で .ts をそのまま動かす）。
 *
 * - 鍵は ANTHROPIC_API_KEY（GitHub の Secrets）。**無ければ呼ばない**（呼ぶ側が hasKey で確かめて飛ばす）
 * - 費用は Max プランの毎月の API クレジット（2026-10〜、月 $100・繰り越し無し）から出る。
 *   使い切っても買い足しのクレジットに流れないよう、Console で自動チャージを切ってある前提
 * - ★ 鍵とプロンプトの中身はログに出さない。出すのは使ったトークン数だけ（Actions のログは公開）
 */
export const MODEL = 'claude-sonnet-5'
const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 120_000

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export interface Ask {
  /** ログに出す呼び出しの名前（中身は出さない） */
  label: string
  system: string
  user: string
  maxTokens: number
}

interface MessagesResponse {
  content?: { type?: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { type?: string }
}

export async function askClaude(a: Ask, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY が無い')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: a.maxTokens,
        system: a.system,
        messages: [{ role: 'user', content: a.user }],
      }),
      signal: ctrl.signal,
    })
    const body = (await res.json().catch(() => null)) as MessagesResponse | null
    // 失敗の文面には状態と種類だけ載せる（鍵や本文は載せない）
    if (!res.ok) throw new Error(`Claude API ${res.status}${body?.error?.type ? ` (${body.error.type})` : ''}`)
    const text = (body?.content ?? [])
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('')
      .trim()
    console.log(`[claude] ${a.label}: 入力 ${body?.usage?.input_tokens ?? '?'}・出力 ${body?.usage?.output_tokens ?? '?'} トークン`)
    if (!text) throw new Error('Claude API の応答に文が無い')
    return text
  } finally {
    clearTimeout(timer)
  }
}
