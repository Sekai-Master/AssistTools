/**
 * ボーダー予測の自己改善ループの関所と見張り（純粋関数。I/O なし）。
 *
 * - checkModel: 学習した新しい版を有効にする前の検査。問題があれば解析ジョブは版を切り替えない（analyze.ts）
 * - scoreboard: 答え合わせの積み上げから、本番の当たり率と「検証が楽観的でないか」を見張る。警告だけで止めない
 *
 * 自動で版が替わるので、壊れた版や悪くなった版が人の目に触れる前に止める最後の網。
 * 閾値は実測（当たり率 80〜85%、|誤差|中央 0.5 で 3〜8%・0.9 で 1.4〜3.6%、新÷旧 0.85〜1.25）より十分ゆるく取り、
 * 正常な版を止めずに、壊れた版・明らかに悪化した版だけを止める。
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import { GRID, RANKS, median, type Model } from '../../workers/border/src/model.ts'
import type { ProspectiveScore, Report } from './report.ts'

export interface GuardResult {
  /** 問題が1つも無い。false なら版を有効にしない */
  ok: boolean
  problems: string[]
  notes: string[]
}

// --- G1 構造 ---------------------------------------------------------------

/** シェア表の上限。累積 ÷ 終値は 1 を超えないが、中央値の誤差と丸めで 1 を少し超えうる。これ以上は壊れている */
export const TABLE_MAX = 1.05
/** 表の隣の点との下がり幅の上限。疎な表で正常でも -0.024 まで下がる。これ以上は表が崩れている */
export const TABLE_MAX_DROP = 0.05
/** 帯が入っている格子点の下限（経過率 BAND_FROM〜BAND_TO の中で）。これより少ないと表に出せる範囲が無い */
export const BAND_MIN_POINTS = 10
/** 帯として数える幅の上限（hi − lo）。実測の広い序盤でも 0.8 は超えない。超える帯は出しても意味が無い */
export const BAND_MAX_WIDTH = 0.8
/** 帯の格子点を数える経過率の範囲（表に出し始める 0.04 から、採点の終わり 0.96 まで） */
export const BAND_FROM = 0.04
export const BAND_TO = 0.96

// --- G2 要約の健全さ -------------------------------------------------------

/** 当たり率を測る標本数の下限。これより少ないと当たり率がぶれるので見ない */
export const COVERAGE_MIN_TOTAL = 30
/** 帯の当たり率（全体）の下限。目標 80% に対し、実測は 80〜85%。70% 未満は帯が効いていない */
export const COVERAGE_MIN = 0.7
/** 帯の当たり率（全体）の上限。97% 超は帯が広すぎて情報が無い（または検証がおかしい） */
export const COVERAGE_MAX = 0.97
/** 経過 50% の |誤差| 中央の上限。実測 3〜8% の2倍超は予測として使えない */
export const MAE_P50_MAX = 0.2
/** 経過 90% の |誤差| 中央の上限。実測 1.4〜3.6% の約3倍。終盤でこれを超えるのは壊れている */
export const MAE_P90_MAX = 0.1

// --- G3 有効な版との比べ ---------------------------------------------------

/** 1つの順位でも、有効な版の |誤差|（経過 90% まで）がこの倍率を超えたら止める。実測の新÷旧は 0.85〜1.25 */
export const REGRESSION_ONE = 1.6
/** この倍率を超えた順位が REGRESSION_MANY_COUNT 以上なら止める（全体にじわっと悪化した版） */
export const REGRESSION_MANY = 1.3
export const REGRESSION_MANY_COUNT = 3
/** 比べる経過率の上限（終盤は |誤差| が小さく、比が荒れる） */
const REGRESSION_P_MAX = 0.9

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
const pct = (v: number | null, digits = 1) => (v == null ? '-' : `${(v * 100).toFixed(digits)}%`)

/** 表の中身の検査。壊れ方ごとに1件だけ問題にする（同じ表で何十件も出さない） */
function checkTable(label: string, t: readonly (number | null)[], problems: string[]) {
  if (t.length !== GRID.length) {
    problems.push(`${label}: 表の長さが ${t.length}（格子は ${GRID.length}）`)
    return
  }
  for (let i = 0; i < t.length; i++) {
    const v = t[i]
    if (v == null) continue
    // 経過 0%（i = 0）だけは 0 が正常（率モデルの表を混ぜた期間の表は、まだ何も積んでいない点を 0 で焼く）。ほかは 0 も壊れ
    if (!Number.isFinite(v) || v < 0 || (v === 0 && i > 0) || v > TABLE_MAX) {
      problems.push(`${label}: 経過 ${Math.round(GRID[i] * 100)}% の値 ${v} が (0, ${TABLE_MAX}] の外`)
      break
    }
  }
  // 疎な表の小さな谷は正常。大きな谷は表の崩れ
  for (let i = 2; i < t.length; i++) {
    const a = t[i - 1]
    const b = t[i]
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue
    if (b - a < -TABLE_MAX_DROP) {
      problems.push(`${label}: 経過 ${Math.round(GRID[i - 1] * 100)}%→${Math.round(GRID[i] * 100)}% で ${(b - a).toFixed(3)} 下がる（下限 -${TABLE_MAX_DROP}）`)
      break
    }
  }
}

function checkBand(label: string, lo: readonly (number | null)[], hi: readonly (number | null)[], problems: string[]) {
  if (lo.length !== GRID.length || hi.length !== GRID.length) {
    problems.push(`${label}: 帯の長さが ${lo.length}/${hi.length}（格子は ${GRID.length}）`)
    return
  }
  let usable = 0
  let bad = false
  for (let i = 0; i < GRID.length; i++) {
    const l = lo[i]
    const h = hi[i]
    if ((l != null && !Number.isFinite(l)) || (h != null && !Number.isFinite(h))) {
      problems.push(`${label}: 経過 ${Math.round(GRID[i] * 100)}% の帯が有限でない（${l}, ${h}）`)
      bad = true
      break
    }
    if (l == null || h == null) continue
    if (l > h) {
      problems.push(`${label}: 経過 ${Math.round(GRID[i] * 100)}% の帯が逆（下 ${l} ＞ 上 ${h}）`)
      bad = true
      break
    }
    if (GRID[i] >= BAND_FROM - 1e-9 && GRID[i] <= BAND_TO + 1e-9 && h - l <= BAND_MAX_WIDTH) usable++
  }
  if (!bad && usable < BAND_MIN_POINTS) {
    problems.push(`${label}: 使える帯が ${usable} 点（経過 ${BAND_FROM * 100}〜${BAND_TO * 100}% で幅 ${BAND_MAX_WIDTH} 以内。下限 ${BAND_MIN_POINTS} 点）`)
  }
}

/** 経過 p までの |誤差| 中央の平均。値が1つも無ければ null */
function meanMae(values: readonly { p: number; value: number | null }[]): number | null {
  const xs = values.filter((x) => x.p <= REGRESSION_P_MAX + 1e-9 && x.value != null && Number.isFinite(x.value)).map((x) => x.value as number)
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * 新しい版を有効にしてよいか。problems が1つでもあれば ok: false（版を切り替えない）。
 * active は今有効な版の要約（取れなければ null。そのときは比べない）
 */
export function checkModel(model: Model, summary: ModelSummary, active: ModelSummary | null): GuardResult {
  const problems: string[] = []
  const notes: string[] = []

  // G1 構造
  for (const rank of RANKS) {
    const rm = model.ranks[String(rank)]
    if (!rm) {
      problems.push(`${rank}位: モデルに順位の項目が無い`)
      continue
    }
    for (const d of model.knownDurations ?? []) {
      if (!rm.tables[String(d)]) problems.push(`${rank}位: 長さ ${d}h の表が無い`)
    }
    for (const [key, t] of Object.entries(rm.tables)) checkTable(`${rank}位 表 ${key}`, t, problems)
    checkBand(`${rank}位`, rm.band.lo, rm.band.hi, problems)
  }

  // G2 要約の健全さ
  for (const r of summary.ranks) {
    const cov = [...(r.coverage ?? []), ...(r.coverageEarly ?? [])]
    const total = cov.reduce((a, x) => a + x.total, 0)
    const covered = cov.reduce((a, x) => a + x.covered, 0)
    if (total >= COVERAGE_MIN_TOTAL) {
      const c = covered / total
      if (!(c >= COVERAGE_MIN && c <= COVERAGE_MAX)) {
        problems.push(`${r.rank}位: 帯の当たり率 ${pct(c)}（${covered}/${total}）が ${pct(COVERAGE_MIN, 0)}〜${pct(COVERAGE_MAX, 0)} の外`)
      }
    }
    for (const [p, max] of [[0.5, MAE_P50_MAX], [0.9, MAE_P90_MAX]] as const) {
      const v = (r.medianAbsError ?? []).find((x) => near(x.p, p))?.value
      if (v != null && !(v <= max)) problems.push(`${r.rank}位: 経過 ${p * 100}% の |誤差|中央 ${pct(v)} が上限 ${pct(max, 0)} を超える`)
    }
  }

  // G3 有効な版との比べ
  if (!active) {
    notes.push('有効な版の要約が無いので、悪化の比べはしない')
  } else if (active.version === summary.version) {
    notes.push('有効な版と同じ版なので、悪化の比べはしない')
  } else {
    const ratios: { rank: number; ratio: number | null }[] = []
    for (const r of summary.ranks) {
      const a = active.ranks.find((x) => x.rank === r.rank)
      const nv = meanMae(r.medianAbsError ?? [])
      const av = a ? meanMae(a.medianAbsError ?? []) : null
      ratios.push({ rank: r.rank, ratio: nv != null && av != null && av > 0 ? nv / av : null })
    }
    notes.push(`有効な版 ${active.version} との |誤差|（経過 ${REGRESSION_P_MAX * 100}% まで平均）の比 新÷旧: ${ratios.map((x) => `${x.rank}位 ${x.ratio == null ? '-' : x.ratio.toFixed(2)}`).join('・')}`)
    for (const x of ratios) {
      if (x.ratio != null && x.ratio > REGRESSION_ONE) problems.push(`${x.rank}位: |誤差| が有効な版の ${x.ratio.toFixed(2)} 倍（上限 ${REGRESSION_ONE} 倍）`)
    }
    const worse = ratios.filter((x) => x.ratio != null && x.ratio > REGRESSION_MANY)
    if (worse.length >= REGRESSION_MANY_COUNT) {
      problems.push(`${worse.length} 順位（${worse.map((x) => x.rank).join('・')}位）で |誤差| が有効な版の ${REGRESSION_MANY} 倍を超える（${REGRESSION_MANY_COUNT} 順位以上で止める）`)
    }
  }

  return { ok: problems.length === 0, problems, notes }
}

// ---------------------------------------------------------------------------
// 見張り（本番の予測の成績）
// ---------------------------------------------------------------------------

/** 見る直近の回数 */
export const SCOREBOARD_WINDOW = 8
/** 全体の当たり率を警告に使う点数の下限。少ないと1回の外れでぶれる */
export const ROLLING_MIN_POINTS = 60
/** 全体の当たり率の警告ライン。目標 80% に対し、これを割ると帯が効いていない */
export const ROLLING_COVERAGE_MIN = 0.65
/** 直近の何回続けて低いと警告するか */
export const RECENT_ROWS = 3
/** その回の当たり率を信じる点数の下限 */
export const RECENT_MIN_POINTS = 6
/** その回の当たり率の警告ライン（半分も入らない回が続く） */
export const RECENT_COVERAGE_MIN = 0.5
/** 本番と再現を比べる代表の経過率（序盤は予測が少なく、終盤は誤差が小さすぎて比が荒れる） */
export const OVERFIT_CHECKPOINTS = [0.5, 0.7] as const
/** 比を出す組の下限 */
export const OVERFIT_MIN_PAIRS = 10
/** 警告に使う組の下限 */
export const OVERFIT_ALARM_PAIRS = 30
/** 本番の外れ幅が再現の何倍を超えたら警告するか */
export const OVERFIT_RATIO_MAX = 1.5

export interface ScoreRow {
  eventId: number
  name: string
  hours: number
  versions: string[]
  /** 表に出して帯を採点できた予測の数（全順位・全時点） */
  points: number
  covered: number
  coverage: number | null
  /** 表に出した予測の |誤差| の中央値 */
  medAbsError: number | null
}

export interface Scoreboard {
  /** 新しい順 */
  rows: ScoreRow[]
  /** 直近 window 回の当たり率 */
  coverage: number | null
  points: number
  /** 本番の |誤差| 中央 ÷ 再現の |誤差| 中央（0.5・0.7 の組）。組が少なければ null */
  overfitRatio: number | null
  overfitPairs: number
  alarms: string[]
  notes: string[]
}

/** 採点に使える予測。表に出していて、帯がある */
const usable = (e: ProspectiveScore) => e.visible && e.inBand !== null

/**
 * 答え合わせの積み上げ（Worker の track-record の reports）から、直近 window 回の本番の成績を見る。
 * 警告は人に知らせるだけ（ジョブは止めない）。
 */
export function scoreboard(reports: readonly Report[], window: number = SCOREBOARD_WINDOW): Scoreboard {
  const picked: Report[] = []
  const rows: ScoreRow[] = []
  for (const rep of [...reports].sort((a, b) => b.aggregateAt - a.aggregateAt)) {
    if (picked.length >= window) break
    const entries = rep.ranks.flatMap((x) => x.prospective)
    const scored = entries.filter(usable)
    if (scored.length === 0) continue
    const covered = scored.filter((e) => e.inBand === true).length
    picked.push(rep)
    rows.push({
      eventId: rep.eventId,
      name: rep.name,
      hours: rep.durationHours,
      versions: rep.modelVersions,
      points: scored.length,
      covered,
      coverage: covered / scored.length,
      medAbsError: median(entries.filter((e) => e.visible && Number.isFinite(e.error)).map((e) => Math.abs(e.error))),
    })
  }

  const alarms: string[] = []
  const notes: string[] = []
  const points = rows.reduce((a, r) => a + r.points, 0)
  const covered = rows.reduce((a, r) => a + r.covered, 0)
  const coverage = points > 0 ? covered / points : null
  if (rows.length === 0) notes.push('採点できる回がまだ無い')

  if (coverage != null && points >= ROLLING_MIN_POINTS && coverage < ROLLING_COVERAGE_MIN) {
    alarms.push(`直近 ${rows.length} 回の当たり率が ${pct(coverage)}（${covered}/${points} 点）で、${pct(ROLLING_COVERAGE_MIN, 0)} を下回っている。帯は 8 割を狙っているので、帯か予測が現実とずれている`)
  }

  const recent = rows.slice(0, RECENT_ROWS)
  if (recent.length === RECENT_ROWS && recent.every((r) => r.points >= RECENT_MIN_POINTS && r.coverage != null && r.coverage < RECENT_COVERAGE_MIN)) {
    alarms.push(`直近 ${RECENT_ROWS} 回（${recent.map((r) => r.eventId).join('・')}）が続けて当たり率 ${pct(RECENT_COVERAGE_MIN, 0)} 未満（${recent.map((r) => pct(r.coverage, 0)).join('・')}）`)
  }

  // 過学習の見張り: 本番で出した予測と、同じ回・順位・経過率の前向き検証（再現）の外れ幅を比べる
  const served: number[] = []
  const replayed: number[] = []
  for (const rep of picked) {
    for (const rk of rep.ranks) {
      if (!rk.replay) continue
      for (const e of rk.prospective) {
        if (!e.visible || !Number.isFinite(e.error) || !OVERFIT_CHECKPOINTS.some((c) => near(c, e.checkpoint))) continue
        const r = rk.replay.find((x) => near(x.p, e.checkpoint))
        if (!r || r.error == null || !Number.isFinite(r.error)) continue
        served.push(Math.abs(e.error))
        replayed.push(Math.abs(r.error))
      }
    }
  }
  const overfitPairs = served.length
  const medServed = median(served)
  const medReplay = median(replayed)
  const overfitRatio = overfitPairs >= OVERFIT_MIN_PAIRS && medServed != null && medReplay != null && medReplay > 0 ? medServed / medReplay : null
  if (overfitRatio == null) {
    notes.push(`本番と再現を比べる組が足りない（${overfitPairs} 組・下限 ${OVERFIT_MIN_PAIRS}）`)
  } else {
    notes.push(`本番の |誤差| 中央 ${pct(medServed)} ÷ 再現の |誤差| 中央 ${pct(medReplay)} = ${overfitRatio.toFixed(2)}（経過 ${OVERFIT_CHECKPOINTS.map((c) => c * 100).join('・')}% の ${overfitPairs} 組）`)
  }
  if (overfitRatio != null && overfitPairs >= OVERFIT_ALARM_PAIRS && overfitRatio > OVERFIT_RATIO_MAX) {
    alarms.push(
      `本番で出した予測の外れ幅が、前向き検証（再現）の ${overfitRatio.toFixed(2)} 倍ある（${overfitPairs} 組・${OVERFIT_RATIO_MAX} 倍超）。` +
        '版を替えた直後なら旧版が悪かっただけのこともあるが、そうでなければ検証が楽観的（過学習）なおそれがある',
    )
  }

  return { rows, coverage, points, overfitRatio, overfitPairs, alarms, notes }
}

/** say() に流す行。表（新しい順）、全体の1行、補足 */
export function scoreboardLines(sb: Scoreboard): string[] {
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const out = ['', '| 回 | 長さ | 版 | 点 | 当たり率 | 外れ幅の中央値 |', '|---|---:|---|---:|---:|---:|']
  for (const r of sb.rows) {
    const versions = r.versions.map((v) => v.split('@').pop() ?? v).join(', ')
    out.push(`| ${cell(`${r.eventId} ${r.name}`)} | ${r.hours}h | ${cell(versions)} | ${r.points} | ${pct(r.coverage)} | ${pct(r.medAbsError)} |`)
  }
  out.push('')
  const ratio = sb.overfitRatio == null ? '-' : sb.overfitRatio.toFixed(2)
  out.push(`- 直近 ${sb.rows.length} 回の当たり率: ${pct(sb.coverage)}（${sb.points} 点）／本番÷再現の外れ幅: ${ratio}（${sb.overfitPairs} 組）`)
  for (const n of sb.notes) out.push(`- ${n}`)
  return out
}
