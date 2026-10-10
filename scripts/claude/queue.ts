/**
 * ボーダー予測の Worker の投稿キューに1本積む（Bot が拾って Discord・X へ出す）。
 * 環境変数: BORDER_API・BORDER_ADMIN_TOKEN（解析ジョブと同じ）。
 * 同じ id は Worker が INSERT OR IGNORE するので、入れ直しても二重には出ない。
 */
export interface QueuedPost {
  id: string
  eventId: number
  kind: string
  text: string
  /** true なら Discord 側を送信済みにして X にだけ出す */
  xOnly: boolean
  /** 添える画像の指示（xposts.ts の AnnouncePayload）。無ければ文字だけ */
  payload?: Record<string, unknown> | null
}

export async function queuePost(p: QueuedPost, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const api = process.env.BORDER_API
  const token = process.env.BORDER_ADMIN_TOKEN
  if (!api || !token) throw new Error('BORDER_API と BORDER_ADMIN_TOKEN が要る')
  const call = async (method: string, path: string, body: unknown) => {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
    return (await res.json()) as { queued?: boolean }
  }
  const r = await call('PUT', '/admin/posts', { id: p.id, eventId: p.eventId, kind: p.kind, text: p.text, ...(p.payload ? { payload: p.payload } : {}) })
  if (p.xOnly) await call('POST', '/admin/posts/sent', { id: p.id, channel: 'discord' })
  return r.queued === true
}
