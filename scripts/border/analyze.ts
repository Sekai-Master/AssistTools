/**
 * ボーダー予測の自己改善ジョブ（GitHub Actions から1日2回。手で回してもよい）。
 *
 *   node scripts/border/analyze.ts [--dry-run] [--series-cache <dir>] [--backfill] [--now <ms>] [--force-model]
 *
 * 1. 終わったイベントの時系列を sekai.best から取り、形（シェア列）にして D1 へ入れる
 * 2. 全履歴で前向き検証をやり直し、候補モデルの王者と帯を決める。関所（guard.ts）を通れば新しい版を有効にする
 * 3. 終わったマラソンの予測ログを実測で採点してレポートにし、答え合わせのポストを積む。本番の成績も見張る
 *
 * 環境変数: BORDER_API（Worker の URL）, BORDER_ADMIN_TOKEN（管理トークン）,
 *   BORDER_MODEL_PIN（版の名前。入れると新しい版を有効にしない）, BORDER_MODEL_FORCE=1（関所で止まった版も有効にする。--force-model と同じ）
 * 設計の正本: docs/border-prediction.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { fitModel, type ModelSummary } from '../../workers/border/src/fit.ts'
import { RANKS, buildShape, durationHours, eventEndMs, type EventMeta, type Sample, type Shape } from '../../workers/border/src/model.ts'
import { pacePoints } from '../../workers/border/src/pace.ts'
import { resultText, type ResultRank } from '../../workers/border/src/posts.ts'
import type { PostPayload, ResultPostRank } from '../../workers/border/src/snapshot.ts'
import { buildReport, type PredictionLog, type Report } from './report.ts'
import { checkModel, scoreboard, scoreboardLines } from './guard.ts'
import { FINAL_RANKS, announceAt, confirmedFinal, historyMeta, historyPostText, isTestEvent, mergeSeed, parseHistory, unknownMemories, type HistoryEvent, type MasterEvent } from './history.ts'
import { addInsights } from '../claude/border-insight-run.ts'

const SITE = 'https://sekaimaster.pages.dev'
const GRAPH = (id: number, rank: number) => `https://api.sekai.best/event/${id}/rankings/graph?rank=${rank}`
const UA = 'sekaimaster-border-analyze/1.0 (+https://sekaimaster.pages.dev)'
/** sekai.best の graph が遡れる最初のイベント（123 以前は空が返る。brain log 2026-09-02 §6） */
const FIRST_EVENT = 124
/** 最終サンプル（終了の約16分後）が入るまで待つ */
const SETTLE_MS = 90 * 60_000
/** 通常運転で形を取り直しに行く範囲。これより古い欠けは --backfill のときだけ埋める */
const RECENT_MS = 30 * 86_400_000
/** 答え合わせのポストを積むのは、終了からこの期間内のイベントだけ */
const POST_WINDOW_MS = 3 * 86_400_000

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = flag('--dry-run')
const BACKFILL = flag('--backfill')
/** 日程だけを Worker へ入れて終わる（border-schedule.yml。Worker の dispatch.ts が、次の回が未登録のあいだ1時間に1回起動する） */
const SCHEDULE_ONLY = flag('--schedule-only')
/** 関所で止まった版を、中身を確かめたうえで有効にする */
const FORCE_MODEL = flag('--force-model') || process.env.BORDER_MODEL_FORCE === '1'
/** 版の固定。入っていれば、新しい版ができても有効にしない（旧版に戻して様子を見るとき） */
const MODEL_PIN = (process.env.BORDER_MODEL_PIN ?? '').trim()
const CACHE = opt('--series-cache')
const NOW = Number(opt('--now') ?? Date.now())
const API = process.env.BORDER_API ?? ''
const TOKEN = process.env.BORDER_ADMIN_TOKEN ?? ''

const log: string[] = []
function say(line: string) {
  console.log(line)
  log.push(line)
}

async function admin<T>(method: string, p: string, body?: unknown): Promise<T> {
  if (!API || !TOKEN) throw new Error('BORDER_API と BORDER_ADMIN_TOKEN が要る')
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 200)}`)
  return JSON.parse(text) as T
}

async function write<T>(method: string, p: string, body: unknown): Promise<T | null> {
  if (DRY) {
    say(`(dry-run) ${method} ${p}`)
    return null
  }
  return admin<T>(method, p, body)
}

/** GitHub Actions の注釈（ログと実行画面に出る）。メッセージの改行と % は決められた形に直す */
function annotate(level: 'error' | 'warning', title: string, message: string) {
  console.log(`::${level} title=${title}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`)
}

/**
 * サイトに出している成績（有効な版の要約と、答え合わせ全件）。公開 API なので鍵は要らない。
 * 取れなくても解析ジョブは止めない（関所は有効な版との比べだけ飛ばし、見張りは出さない）
 */
async function fetchTrackRecord(): Promise<{ model: ModelSummary | null; reports: Report[] } | null> {
  try {
    if (!API) throw new Error('BORDER_API が無い')
    const res = await fetch(`${API}/v1/border/track-record`)
    if (!res.ok) throw new Error(`track-record → ${res.status}`)
    const body = (await res.json()) as { model?: ModelSummary | null; reports?: Report[] }
    return { model: body.model ?? null, reports: Array.isArray(body.reports) ? body.reports : [] }
  } catch (err) {
    say(`- 成績の取得: 失敗（${err instanceof Error ? err.message : String(err)}）`)
    return null
  }
}

/** マスタ（sekai-master-db-diff）の events.json。サイトの bonuses.json より早く新しいイベントが載る */
const MASTER_EVENTS = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/events.json'

/** events.json（eventType）と bonuses.json（type）のどちらの形でも読む */
export function parseEvents(list: unknown): EventMeta[] {
  if (!Array.isArray(list)) return []
  const out: EventMeta[] = []
  for (const e of list as Record<string, unknown>[]) {
    if (!e || typeof e.id !== 'number' || typeof e.startAt !== 'number' || typeof e.aggregateAt !== 'number') continue
    const type = typeof e.eventType === 'string' ? e.eventType : typeof e.type === 'string' ? e.type : 'unknown'
    // 素材名はマスタでは assetbundleName、bonuses.json では asset
    const asset = typeof e.assetbundleName === 'string' ? e.assetbundleName : typeof e.asset === 'string' ? e.asset : null
    out.push({
      id: e.id,
      name: typeof e.name === 'string' ? e.name : `event ${e.id}`,
      eventType: type,
      unit: typeof e.unit === 'string' ? e.unit : 'none',
      startAt: e.startAt,
      aggregateAt: e.aggregateAt,
      asset: asset != null && /^[a-z0-9_]+$/.test(asset) ? asset : null,
    })
  }
  return out
}

/**
 * イベントの一覧。マスタを正にし、読めなければサイトの bonuses.json に落ちる。
 * ★ bonuses.json はカードデータの自動更新（テストが門番）が止まると古いまま残る。
 *   2026-09-30 の周年アップデートでその更新が止まり、当日開始の event 219 が載らなかった
 */
async function loadEvents(): Promise<{ events: EventMeta[]; source: string }> {
  try {
    const res = await fetch(MASTER_EVENTS, { headers: { 'User-Agent': UA } })
    if (res.ok) {
      const events = parseEvents(await res.json())
      if (events.length > 0) return { events, source: 'master' }
    }
  } catch (err) {
    say(`- マスタの events.json を読めなかった（${err instanceof Error ? err.message : String(err)}）。サイトの bonuses.json を使う`)
  }
  const res = await fetch(`${SITE}/CardDatas/bonuses.json`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`bonuses.json ${res.status}`)
  const raw = (await res.json()) as { events?: unknown }
  const events = parseEvents(raw.events)
  if (events.length === 0) throw new Error('bonuses.json に events が無い')
  return { events, source: 'bonuses' }
}

/** graph API の応答から [ts, score] だけを取り出す（userName などの第三者情報は捨てる） */
export function parseGraph(raw: unknown): Sample[] {
  const rows = (raw as { data?: { eventRankings?: unknown } })?.data?.eventRankings
  if (!Array.isArray(rows)) return []
  const out: Sample[] = []
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r.timestamp !== 'string') continue
    const score = typeof r.score === 'string' ? Number(r.score) : r.score
    const ts = Date.parse(r.timestamp)
    if (typeof score !== 'number' || !Number.isFinite(score) || Number.isNaN(ts)) continue
    out.push([ts, score])
  }
  return out.sort((a, b) => a[0] - b[0])
}

async function loadSeries(id: number, rank: number): Promise<Sample[]> {
  if (CACHE) {
    const f = path.join(CACHE, `${id}_${rank}.json`)
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) as Sample[]
  }
  const res = await fetch(GRAPH(id, rank), { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`graph ${id}/${rank} → ${res.status}`)
  await new Promise((r) => setTimeout(r, 500))
  return parseGraph(await res.json())
}

async function collectShapes(events: readonly EventMeta[], have: readonly Shape[]): Promise<Shape[]> {
  const haveKey = new Set(have.map((s) => `${s.eventId}:${s.rank}`))
  const ended = events.filter(
    (e) => e.id >= FIRST_EVENT && e.aggregateAt + SETTLE_MS < NOW && (BACKFILL || e.aggregateAt > NOW - RECENT_MS),
  )
  const fresh: Shape[] = []
  for (const e of ended) {
    for (const rank of RANKS) {
      if (haveKey.has(`${e.id}:${rank}`)) continue
      const shape = buildShape(e, rank, await loadSeries(e.id, rank))
      if (shape) fresh.push(shape)
    }
  }
  return fresh
}

function resultRanks(report: Report): (ResultRank & ResultPostRank)[] {
  // 投稿には「経過85%前後で出していた予測」を使う（開催中に積んだマイルストーンと同じ時点）
  const out: (ResultRank & ResultPostRank)[] = []
  for (const r of report.ranks) {
    const at = r.prospective.find((x) => x.checkpoint === 0.85) ?? r.prospective[r.prospective.length - 1]
    if (!at || !at.visible) continue
    out.push({ rank: r.rank, final: r.final, predicted: at.predicted, progress: at.progress, error: at.error, inBand: at.inBand, low: at.low, high: at.high })
  }
  return out
}

/**
 * 歴代ボーダーの投稿を自動で積むのは、この id の回から。221 は 2026-10-25 に手で出す（Bot の4枚の対応〈sekaimaster-bot #13〉と
 * X で4枚を付ける操作の確かめが済む前に積むと、古い Bot が画像なしの文字だけで出してしまうため）
 */
const HISTORY_POSTS_FROM = 222

/** 1回に足す回の上限（初回や長く止まっていたあとに sekai.best を叩きすぎない） */
const FINALS_ADD_LIMIT = 10
/**
 * 自分で取りに行くのは、終わってからこの期間内の回だけ。それより古い回は種の表が受け持つ
 *（記録の無い 112・118 を毎回取りに行って「次の回にやり直す」と出し続けていた。2026-10-25）
 */
const FINALS_LOOKBACK_MS = 30 * 86_400_000

/**
 * 歴代ボーダーの表（Worker の kv `finals`）に、順位発表を過ぎた回を足す。
 * 表がまだ無ければ、2026-10-25 にまとめた種（data/finals-seed.json、1〜220）から始める。
 * 終値は sekai.best の確定後の点だけ（history.ts の confirmedFinal）。揃わない回は次の回にやり直す
 */
async function updateFinals(retried = false): Promise<void> {
  const res = await fetch(MASTER_EVENTS, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`マスタ ${res.status}`)
  const master = (await res.json()) as MasterEvent[]
  if (!Array.isArray(master)) throw new Error('マスタが配列でない')
  let stored: HistoryEvent[] = []
  // 読んだときの表の更新時刻。書き戻すときに渡し、あいだに Worker の見回りが回を足していたら 409 で読み直す
  let stamp: number | undefined
  if (!(DRY && !TOKEN)) {
    const raw = await admin<{ events?: unknown[]; updatedAt?: unknown }>('GET', '/admin/finals')
    if (typeof raw?.updatedAt === 'number') stamp = raw.updatedAt
    stored = parseHistory(raw)
    // 壊れた行を黙って捨てて書き戻さない（レビュー LOW-3）
    const rawCount = Array.isArray(raw?.events) ? raw.events.length : 0
    if (stored.length !== rawCount) throw new Error(`保存済みの表に読めない行がある（${rawCount - stored.length} 行）。書き戻さない`)
  }
  const seed = parseHistory(JSON.parse(fs.readFileSync(new URL('./data/finals-seed.json', import.meta.url), 'utf8')))
  // 種から足りない回・順位を書き足す（空の表なら種そのもの）
  const merged = mergeSeed(stored, seed)
  const table = merged.events
  if (merged.changed > 0) say(`- 歴代ボーダー: 種から ${merged.changed} 回ぶんを書き足す`)
  const have = new Set(table.map((e) => e.id))
  const added: HistoryEvent[] = []
  for (const e of [...master].filter((x) => x && typeof x.id === 'number').sort((a, b) => a.id - b.id)) {
    if (added.length >= FINALS_ADD_LIMIT) break
    if (have.has(e.id) || announceAt(e) > NOW || e.aggregateAt < NOW - FINALS_LOOKBACK_MS) continue
    if (unknownMemories(e)) {
      // 知らない Memories の略称は、マラソンとして確定させずに保留（対応表を足してから入れる。レビュー MEDIUM-2）
      say(`- 歴代ボーダー: ${e.id} ${e.name} は知らない Memories の素材名（${e.assetbundleName}）。history.ts の対応表に足すまで入れない`)
      continue
    }
    const meta = historyMeta(e)
    if (!meta) continue
    // 1回の取得の失敗で、ほかの回を巻き込まない（レビュー MEDIUM-1）
    try {
      const finals: Record<string, number> = {}
      const sources: Record<string, string> = {}
      for (const rank of FINAL_RANKS) {
        const v = confirmedFinal(await loadSeries(e.id, rank), e)
        if (v == null) break
        finals[String(rank)] = v
        sources[String(rank)] = 'sekai.best'
      }
      if (Object.keys(finals).length === FINAL_RANKS.length) added.push({ ...meta, finals, sources })
      else say(`- 歴代ボーダー: ${e.id} ${e.name} は確定後の点がまだ無い（次の回にやり直す）`)
    } catch (err) {
      say(`- 歴代ボーダー: ${e.id} ${e.name} は取得に失敗（${err instanceof Error ? err.message : String(err)}）。次の回にやり直す`)
    }
  }
  if (added.length === 0 && merged.changed === 0) {
    say(`- 歴代ボーダー: 足す回なし（${stored.length} 回）`)
    return
  }
  const events = [...table, ...added].sort((a, b) => a.id - b.id)
  try {
    await write('PUT', '/admin/finals', { events, expectUpdatedAt: stamp })
  } catch (err) {
    // あいだに Worker の見回りが書いた。1回だけ読み直してやり直す（#159 レビュー MEDIUM-2）
    if (!retried && /→ 409/.test(err instanceof Error ? err.message : String(err))) {
      say('- 歴代ボーダー: 読んだあとに表が書き換わったので読み直す')
      return updateFinals(true)
    }
    throw err
  }
  say(`- 歴代ボーダー: ${added.map((e) => `${e.id} ${e.name}`).join('・') || '種を入れた・書き足した'}（${events.length} 回）`)

  // 足した回のうち、終わって間もない回は歴代ボーダーの投稿（画像4枚）を積む。描くのと本文は Bot（sekaimaster-bot の historyCard.ts）
  for (const e of added) {
    const ended = master.find((m) => m.id === e.id)
    // ワールドリンクは Bot の画像に載らない（historyCard.ts の parseHistory が除く）ので積まない。積むと画像が作れず、2時間の先送りのあと文字だけで出てしまう
    if (!ended || ended.aggregateAt < NOW - POST_WINDOW_MS || e.id < HISTORY_POSTS_FROM || e.type === 'world_bloom') continue
    const text = historyPostText(e.name, e.id, SITE)
    await write('PUT', '/admin/posts', { id: `${e.id}:history`, eventId: e.id, kind: 'history', text, payload: { kind: 'history', eventId: e.id } })
    say(`- 歴代ボーダー: ${e.id} の投稿を積んだ`)
  }
}

/**
 * 日報（毎日21時・Worker の daily.ts）の「歴代ペース」の下ごしらえ。日報を出す時刻ごとに、過去の回のその経過率での日速を並べて
 * Worker の kv `pace:{id}` に置く（pace.ts）。過去の回の伸び方は、本番の形（D1 の shapes）を正にして、無い回（1〜85 など）は種で補う
 */
async function updatePace(events: readonly EventMeta[], shapes: readonly Shape[]) {
  const daily = (e: EventMeta) => (e.eventType === 'marathon' || e.eventType === 'cheerful_carnival') && !isTestEvent(e)
  const targets = events.filter((e) => daily(e) && e.startAt - 2 * 86_400_000 <= NOW && NOW < e.aggregateAt)
  if (targets.length === 0) {
    say('- 日報の歴代ペース: 対象の回なし')
    return
  }
  const seed = (JSON.parse(fs.readFileSync(new URL('./data/pace-seed.json', import.meta.url), 'utf8')) as { shapes: Shape[] }).shapes
  const byKey = new Map<string, Shape>()
  for (const x of [...seed, ...shapes]) byKey.set(`${x.eventId}:${x.rank}`, x)
  const hoursOf = new Map(events.filter(daily).map((e) => [e.id, (eventEndMs(e) - e.startAt) / 3_600_000] as const))
  for (const t of targets) {
    const points = pacePoints(t, [...byKey.values()], hoursOf)
    await write('PUT', '/admin/pace', { eventId: t.id, points })
    const sizes = points[0] ? Object.values(points[0].ranks).map((xs) => xs.length) : []
    const n = sizes.length > 0 ? Math.min(...sizes) : 0
    say(`- 日報の歴代ペース: ${t.id} ${t.name}（${points.length} 回ぶん・比べる回 ${n}〜）`)
  }
}

function writeSummary() {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) fs.appendFileSync(summaryFile, log.join('\n') + '\n')
}

async function main() {
  // 関所で版を止めたら true。ほかの処理を全部終えたあと、最後にジョブを失敗にして気づかせる
  let blocked = false
  say(`# ボーダー予測 解析ジョブ ${new Date(NOW).toISOString()}${DRY ? '（dry-run）' : ''}`)
  const { events, source } = await loadEvents()

  // 0. 日程を Worker へ（直近と、これからのイベント）。Worker はこれを見て収集を始める
  const upcoming = events.filter((e) => e.aggregateAt >= NOW - 3 * 86_400_000)
  const sched = await write<{ count: number; changed: number }>('PUT', '/admin/events', {
    // 素材名も渡す（Worker が終了直後に歴代の表へ足すとき、Memories の判定とロゴに使う。finals.ts）
    events: upcoming.map((e) => ({ id: e.id, name: e.name, type: e.eventType, unit: e.unit, startAt: e.startAt, aggregateAt: e.aggregateAt, asset: e.asset ?? null })),
  })
  say(`- 日程: ${source} から ${upcoming.length} 件（${upcoming.map((e) => e.id).join(', ')}）${sched ? `・変更 ${sched.changed} 行` : ''}`)
  if (SCHEDULE_ONLY) {
    writeSummary()
    return
  }

  // 1. 形
  const have = DRY && !TOKEN ? [] : (await admin<{ shapes: Shape[] }>('GET', '/admin/shapes')).shapes
  const fresh = await collectShapes(events, have)
  say(`- 形: 既存 ${have.length} 本 ＋ 新規 ${fresh.length} 本`)
  for (let i = 0; i < fresh.length; i += 100) await write('PUT', '/admin/shapes', { shapes: fresh.slice(i, i + 100) })
  const shapes = [...have, ...fresh]

  // 1.5 日報の歴代ペースの下ごしらえ（始まる2日前から開催中の回）。失敗しても解析ジョブは止めない
  await updatePace(events, shapes).catch((err) => say(`- 日報の歴代ペース: 失敗（${err instanceof Error ? err.message : String(err)}）`))

  // 2. 学習
  const { model, summary } = fitModel(events, shapes, NOW)
  say(`- モデル: ${summary.version}（学習 ${summary.poolSize} 件・期間 ${summary.durations.join('/')}h）`)
  const thin = summary.thinDurations ?? []
  if (thin.length > 0) say(`- 標本1〜2件の長さ（直近の回を混ぜた参考値の表）: ${thin.map((t) => `${t.duration}h（${t.samples}件・${t.latestEventId}）`).join('・')}`)
  for (const r of summary.ranks) {
    const mae = r.medianAbsError.map((x) => `${x.p}:${x.value == null ? '-' : (x.value * 100).toFixed(1)}`).join(' ')
    const cov = r.coverage.map((x) => `${x.covered}/${x.total}`).join(' ')
    const until = r.earlyBlend?.switchAt
    const blend = until == null ? 'なし' : `経過 ${Math.round(until * 100)}% まで`
    say(`  - ${r.rank}位: 王者 ${r.champion}／序盤の差し替え ${blend}／表に出すのは経過 ${Math.round(r.minProgress * 100)}% から／|誤差|中央 ${mae}／帯の的中 ${cov}`)
  }

  // 2.5 関所。有効な版の要約と比べ、壊れた版・悪くなった版は有効にしない（取れなければ構造と要約だけ見る）
  const active = (await fetchTrackRecord())?.model ?? null
  const guard = checkModel(model, summary, active)
  say(`- 関所: ${guard.ok ? '通った' : `止める理由 ${guard.problems.length} 件`}（有効な版 ${active?.version ?? '不明'} → 新しい版 ${summary.version}）`)
  for (const p of guard.problems) say(`  - 問題: ${p}`)
  for (const n of guard.notes) say(`  - ${n}`)

  if (MODEL_PIN) {
    say(`- 版の切り替え: しない（版を ${MODEL_PIN} に固定している〈BORDER_MODEL_PIN〉。有効にするはずだった版 ${summary.version} は関所を${guard.ok ? '通っていた' : '通らなかった'}）`)
  } else if (!guard.ok && !FORCE_MODEL) {
    say(`- 版の切り替え: しない（関所で止めた。中身を確かめて有効にするなら --force-model か BORDER_MODEL_FORCE=1）`)
    for (const p of guard.problems) annotate('error', 'ボーダー予測の版を止めた', `${summary.version}: ${p}`)
    blocked = true
  } else {
    if (!guard.ok) say('- 関所を通らなかったが、--force-model（BORDER_MODEL_FORCE）なので有効にする')
    const put = await write<{ changed: boolean }>('PUT', '/admin/model', { model, summary })
    if (put) say(`- 版の切り替え: ${put.changed ? 'した' : '同じ版なので無し'}`)
  }
  if (DRY) fs.writeFileSync('border-model.dry.json', JSON.stringify({ model, summary }, null, 1))

  // 3. 答え合わせ
  const reported = new Set(DRY && !TOKEN ? [] : (await admin<{ eventIds: number[] }>('GET', '/admin/reports')).eventIds)
  const finals = new Map<string, number>(shapes.map((s) => [`${s.eventId}:${s.rank}`, s.final]))
  const targets = events.filter(
    (e) => e.eventType === 'marathon' && e.aggregateAt + SETTLE_MS < NOW && e.aggregateAt > NOW - RECENT_MS && !reported.has(e.id),
  )
  for (const e of targets) {
    if (!RANKS.some((r) => finals.has(`${e.id}:${r}`))) continue
    const preds = DRY && !TOKEN ? [] : (await admin<{ predictions: PredictionLog[] }>('GET', `/admin/predictions?event=${e.id}`)).predictions
    const report = buildReport(e, finals, preds, summary, NOW)
    await write('PUT', '/admin/reports', { eventId: e.id, report })
    say(`- 答え合わせ: ${e.id} ${e.name}（予測ログ ${preds.length} 行・${durationHours(e)}h）`)
    const ranks = resultRanks(report)
    let posted = false
    if (ranks.length > 0 && e.aggregateAt > NOW - POST_WINDOW_MS) {
      const text = resultText(e.name, ranks)
      const payload: PostPayload = {
        kind: 'result',
        event: { id: e.id, name: e.name, type: e.eventType, unit: e.unit, startAt: e.startAt, aggregateAt: e.aggregateAt, durationHours: durationHours(e) },
        ranks: ranks.map(({ rank, final, predicted, progress, error, inBand, low, high }) => ({ rank, final, predicted, progress, error, inBand, low, high })),
      }
      if (text) {
        await write('PUT', '/admin/posts', { id: `${e.id}:result`, eventId: e.id, kind: 'result', text, payload })
        posted = true
      }
    }
    // ③ 一言解説・④ 改善案（Claude）。失敗しても解析ジョブは止めない
    if (!DRY) {
      await addInsights({ report, summary, posted, queue: (p) => write('PUT', '/admin/posts', p), say }).catch((err) =>
        say(`- Claude の補足: 失敗（${err instanceof Error ? err.message : String(err)}）`),
      )
    }
  }
  if (targets.length === 0) say('- 答え合わせ: 対象なし')

  // 3.5 本番の成績の見張り（いま積んだレポートも入る）。警告だけでジョブは止めない
  try {
    const record = await fetchTrackRecord()
    if (record) {
      const sb = scoreboard(record.reports)
      say('- 本番の成績（直近の答え合わせ）')
      for (const line of scoreboardLines(sb)) say(line)
      for (const a of sb.alarms) annotate('warning', 'ボーダー予測の見張り', a)
    }
  } catch (err) {
    say(`- 本番の成績: 失敗（${err instanceof Error ? err.message : String(err)}）`)
  }

  // 4. 歴代ボーダー（終値の表）に、終わった回を書き足す。失敗しても解析ジョブは止めない
  await updateFinals().catch((err) => say(`- 歴代ボーダー: 失敗（${err instanceof Error ? err.message : String(err)}）`))

  writeSummary()
  // 関所で版を止めた。ステップサマリーを書いたあとに失敗にする（途中で落とすと答え合わせなどが止まる）
  if (blocked) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
