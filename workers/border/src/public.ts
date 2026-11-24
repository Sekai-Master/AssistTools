/**
 * 公開の読み出し（GET のみ）。Worker と、サイトの Pages Functions（functions/api/border）の両方がここを使う。
 *
 * ★ サイトの画面は Pages Functions 経由（同一オリジン）で読む。workers.dev を直接叩かせると
 *   「ページを開いただけで外部に接続しない」というプライバシーポリシー第5項が嘘になる。
 * ★ D1 の読み取り行数も無料枠（500万行/日・SAWAYAKA と共有）を食うので、
 *   事前に組み立てた1行（kv）を返す。予測ログの表を毎回なめない。
 */
import { activeModelSummary, allReports, eventAsset, kvGet, nextEventAfter, shapesOf } from './db.ts'

/** 形の順位の数（50・100・200・500・1000・2000） */
const SHAPE_RANKS = 6

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

/** /upcoming で返す回。名前と期間だけ */
interface UpcomingEvent {
  id: number
  name: string
  startAt: number
  aggregateAt: number
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** kv の current の回（id・名前・期間）。読めなければ null */
function currentEventOf(raw: string | null): UpcomingEvent | null {
  if (!raw) return null
  try {
    const ev = (JSON.parse(raw) as { event?: Record<string, unknown> }).event
    if (!ev || !isNum(ev.id) || !isNum(ev.startAt) || !isNum(ev.aggregateAt)) return null
    return { id: ev.id, name: typeof ev.name === 'string' ? ev.name : '', startAt: ev.startAt, aggregateAt: ev.aggregateAt }
  } catch {
    return null
  }
}

/**
 * 次に集計を迎える回（サイトのリフレッシュゲージ・周回プランの「イベ乙までに、あと合計何分休めば」の行）。
 * - current の回がまだ集計前ならその回
 * - 終わっていれば、events 表のその回より後（主キーの範囲）で集計前の、いちばん早く始まる回。マラソンでなければ出さない
 * ★ 次の回は今の回が終わってから返す（始まる前の回を早く出しすぎない。2 つ先の回も返さない）。
 *   events 表は解析ジョブがマスタの日程から入れる（collect.ts の parseSchedule・scripts/border/analyze.ts）
 * ★ 読むのは kv の current の 1 行と、events のこれからの回の数行。キャッシュ 5 分
 */
async function upcomingResponse(db: D1Database, now: number): Promise<Response> {
  const notFound = () =>
    new Response(JSON.stringify({ error: 'no upcoming event' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    })
  const cur = currentEventOf(await kvGet(db, 'current'))
  if (!cur) return notFound()
  if (cur.aggregateAt > now) return rawJson(JSON.stringify({ event: cur }), 300)
  const next = await nextEventAfter(db, cur.id, now)
  if (!next || next.eventType !== 'marathon') return notFound()
  const event: UpcomingEvent = { id: next.id, name: next.name, startAt: next.startAt, aggregateAt: next.aggregateAt }
  return rawJson(JSON.stringify({ event }), 300)
}

/**
 * path は "/current" "/upcoming" "/track-record" "/finals" "/events/{id}/history" "/events/{id}/shape" のどれか。該当しなければ null。
 * 返す JSON の形はサイト側の src/pages/border/types.ts と揃える。
 */
export async function publicBorderResponse(db: D1Database, path: string, now: number = Date.now()): Promise<Response | null> {
  if (path === '/upcoming') return upcomingResponse(db, now)

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

  // 終わった回の伸び方（経過率 2% 刻み 51 点の 値÷終値。解析ジョブが書く shapes 表）。歴代ボーダーの推移のグラフが読む。
  // 主キーで1回ぶん（最大6行）だけ読む。終わった回は変わらないので1日キャッシュ。まだ無い回は、解析ジョブの後に出るよう短く
  const shape = /^\/events\/(\d{1,6})\/shape$/.exec(path)
  if (shape) {
    const id = Number(shape[1])
    const ranks = (await shapesOf(db, id)).map((s) => ({ rank: s.rank, final: s.final, share: s.share }))
    // 1日キャッシュするのは6順位そろったときだけ。形の投入（upsertShapes）は50行ずつの batch に分けて書くので、
    // 書いている途中に読むと回の一部の順位だけが返りうる（#189 レビュー L4）。順位の欠けた古い回は5分のまま（6行読むだけ）
    return rawJson(JSON.stringify({ eventId: id, ranks }), ranks.length >= SHAPE_RANKS ? 86_400 : 300)
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
