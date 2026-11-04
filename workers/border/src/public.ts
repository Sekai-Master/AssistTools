/**
 * 公開の読み出し（GET のみ）。Worker と、サイトの Pages Functions（functions/api/border）の両方がここを使う。
 *
 * ★ サイトの画面は Pages Functions 経由（同一オリジン）で読む。workers.dev を直接叩かせると
 *   「ページを開いただけで外部に接続しない」というプライバシーポリシー第5項が嘘になる。
 * ★ D1 の読み取り行数も無料枠（500万行/日・SAWAYAKA と共有）を食うので、
 *   事前に組み立てた1行（kv）を返す。予測ログの表を毎回なめない。
 */
import { activeModelSummary, allReports, eventAsset, kvGet } from './db.ts'

function rawJson(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  })
}

/**
 * current の回にロゴの素材名を足す（トップの開催中のイベントに出す）。
 *
 * kv の current は Worker が30分ごとに組む。ここで足せば、Worker を出し直さなくても
 * サイトの Pages Functions だけで載る。読み取りは events の主キーで1行だけ。
 * ★ 失敗してもロゴが出ないだけにする。予測そのものを巻き添えで落とさない。
 */
async function withEventAsset(db: D1Database, body: string): Promise<string> {
  try {
    const snap = JSON.parse(body) as { event?: { id?: unknown; asset?: unknown } }
    const ev = snap.event
    if (!ev || typeof ev.id !== 'number' || ev.asset !== undefined) return body
    return JSON.stringify({ ...snap, event: { ...ev, asset: await eventAsset(db, ev.id) } })
  } catch (err) {
    console.error('current: 素材名を足せなかった', err)
    return body
  }
}

/**
 * path は "/current" "/track-record" "/events/{id}/history" のどれか。該当しなければ null。
 * 返す JSON の形はサイト側の src/pages/border/types.ts と揃える。
 */
export async function publicBorderResponse(db: D1Database, path: string): Promise<Response | null> {
  if (path === '/current') {
    const v = await kvGet(db, 'current')
    return v ? rawJson(await withEventAsset(db, v), 60) : new Response(JSON.stringify({ error: 'no data yet' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  const hist = /^\/events\/(\d+)\/history$/.exec(path)
  if (hist) {
    const id = Number(hist[1])
    const v = await kvGet(db, `history:${id}`)
    // 行: [sampleAt, progress, [[rank, current, predicted, low, high, visible], ...]]
    return rawJson(`{"eventId":${id},"rows":[${v ?? ''}]}`, 60)
  }

  // 歴代ボーダー（終値の表）。Worker の見回り（終了15分後）と解析ジョブが終わった回を書き足す kv の1行（約90KB）。
  // サイトの「歴代ボーダー」と Bot の画像が読む。終了20分後の投稿のリンクから開いて新しい回が出るよう、キャッシュは5分（#159 レビュー MEDIUM-4）
  if (path === '/finals') {
    const v = await kvGet(db, 'finals')
    return v ? rawJson(v, 300) : new Response(JSON.stringify({ error: 'no data yet' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  if (path === '/track-record') {
    const [summary, reports] = await Promise.all([activeModelSummary(db), allReports(db)])
    return rawJson(`{"model":${summary ?? 'null'},"reports":[${reports.join(',')}]}`, 600)
  }

  return null
}
