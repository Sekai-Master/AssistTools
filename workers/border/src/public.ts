/**
 * 公開の読み出し（GET のみ）。Worker と、サイトの Pages Functions（functions/api/border）の両方がここを使う。
 *
 * ★ サイトの画面は Pages Functions 経由（同一オリジン）で読む。workers.dev を直接叩かせると
 *   「ページを開いただけで外部に接続しない」というプライバシーポリシー第5項が嘘になる。
 * ★ D1 の読み取り行数も無料枠（500万行/日・SAWAYAKA と共有）を食うので、
 *   事前に組み立てた1行（kv）を返す。予測ログの表を毎回なめない。
 */
import { activeModelSummary, allReports, kvGet } from './db.ts'

function rawJson(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  })
}

/**
 * path は "/current" "/track-record" "/events/{id}/history" のどれか。該当しなければ null。
 * 返す JSON の形はサイト側の src/pages/border/types.ts と揃える。
 */
export async function publicBorderResponse(db: D1Database, path: string): Promise<Response | null> {
  if (path === '/current') {
    const v = await kvGet(db, 'current')
    return v ? rawJson(v, 60) : new Response(JSON.stringify({ error: 'no data yet' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  const hist = /^\/events\/(\d+)\/history$/.exec(path)
  if (hist) {
    const id = Number(hist[1])
    const v = await kvGet(db, `history:${id}`)
    // 行: [sampleAt, progress, [[rank, current, predicted, low, high, visible], ...]]
    return rawJson(`{"eventId":${id},"rows":[${v ?? ''}]}`, 60)
  }

  if (path === '/track-record') {
    const [summary, reports] = await Promise.all([activeModelSummary(db), allReports(db)])
    return rawJson(`{"model":${summary ?? 'null'},"reports":[${reports.join(',')}]}`, 600)
  }

  return null
}
