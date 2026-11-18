/**
 * みんなでライブ停止中に開催する回のボーダー予測（特別モデル solo-special-v1、2026-11-19）。
 *
 * 2026-11-18 23:00 から公式が「みんなでライブ」を止めたまま、226「ワンダーランズ×ショウタイム Memories」（11/20 15:00〜・102時間）を開く。
 * Nori（11/18 23 時台）「次回イベントの予測は従来と完全に別のモデルを特別に組んで場当たり的に対処する。予測は目安であることを置きつつ広めに出す」
 * 「学習からは外しましょう」。過去の回はどれもみんなでライブのある回なので、ふだんのモデル（過去の伸び方の形）をそのまま当てられない。
 *
 * 考え方: 水準はこの回の実測（直近の窓の伸び）から取り、時間の形（夜に落ちる・21〜24時に増える）は率モデル（rate.ts）から借りる。
 * 終盤の追い込みの大きさは前例が無いので、点には入れきらず、帯の端として扱う。
 *   S_spurt(p) … 率モデル（経過・残り・時刻）のシェア表＝ふだんの回と同じ追い込み
 *   S_flat(p)  … 率モデルから「残り時間」の折れ線を外したシェア表＝追い込みなし
 *   水準       … 直近の窓 [p0, p]（開始から窓の長さまでは開始から）で F_x = B(p) + (B(p) − B(p0)) / (S_x(p) − S_x(p0)) × (1 − S_x(p))
 *   点         … F_spurt^w × F_flat^(1−w)（w = spurtWeight。既定 0.75。0.5 なら幾何平均）
 *   帯         … 下 = max(B(p), min(F) × (1 − m))、上 = max(F) × (1 + m)。m は残りの割合とともに縮める
 *   確度       … 常に「目安」。帯が 80 ポイントを超えても出す（わざと広げた予測が丸ごと消えないように）
 *
 * ★ 一覧の正本は SOLO_ONLY_EVENTS。解析ジョブがこれを読んで、曲線と一緒にモデルの JSON（model.special）に焼く。
 *   Worker が予測に使うのは model.special だけ（このファイルの一覧は見ない）。だから
 *     古い Worker ＋ special 入りの JSON … special を読まない。今と同じ
 *     新しい Worker ＋ special の無い JSON … 今と同じ
 *     新しい Worker ＋ special 入りの JSON … 一覧の回だけ特別モデル
 *   回を足すのは「一覧に足してマージ → 解析ジョブを回す」だけで済み、Worker の反映は要らない。
 * ★ 曲線・窓・m は「確かめようがない」回のための仮置き。過去の回で当て直して分かるのは「壊れていない」「帯がふだんより狭くない」ことだけ。
 */
import { GRID, RANKS, chooseTable, durationHours, interpGrid, progressAt, type EventMeta, type Model, type Prediction, type ReferenceSource, type Sample, type ThinDuration } from './model.ts'

/**
 * みんなでライブ停止中に開催した回（学習から外し、特別モデルで当てる）。正本はここ1か所。
 * 227（Leo/need Memories、11/25〜）は停止のままか未定（2026-11-19 時点）。決まったらここに足してマージし、解析ジョブを回す
 */
export const SOLO_ONLY_EVENTS: readonly number[] = [226]

/**
 * 特別扱いの回か（Worker の判定は全部これ1つ。2026-11-19 検分 G1）: このファイルの一覧 ∪ 有効な版の model.special.events。
 * extra は JSON から来た値（model.special.events や D1 の json_extract の結果）なので、整数だけ拾う
 */
export function soloEventIds(extra: unknown): Set<number> {
  const out = new Set<number>(SOLO_ONLY_EVENTS)
  if (Array.isArray(extra)) for (const x of extra) if (Number.isInteger(x)) out.add(x as number)
  return out
}

/**
 * 特別扱いの回なのに特別モデルの曲線が使えない（まだ焼いていない・壊れている・日程がずれた）ときの予測ログの版の印。
 * ふだんの版の後ろに付ける（例 share-median-v1@e225-abcd1234+solo-fallback）。数字はふだんの predict() で出し、帯を広げ、確度は目安・隠さない
 */
export const SOLO_FALLBACK_SUFFIX = '+solo-fallback'

export const SPECIAL_ALGORITHM = 'solo-special-v1' as const
/** スナップショット・予測に付ける印（サイトが読む） */
export type SpecialKind = 'solo'

export interface SpecialParams {
  /** 水準を測る直近の窓（時間）。開始からこの時間までは開始から */
  windowHours: number
  /** 帯の余白 m = marginBase + marginSlope × (1 − 経過率) */
  marginBase: number
  marginSlope: number
  /**
   * 点の取り方の重み w。点 = F_spurt^w × F_flat^(1−w)。0.5 で幾何平均、1 で追い込みありの水準そのもの。
   * 帯（min(F)・max(F) から作る）には効かない（2026-11-19 指揮。決めるのは指揮で、当て直しの表は PR #267）
   */
  spurtWeight: number
}

/**
 * 仮の値（2026-11-19 2時台に指揮が置いた。11/19 の公式の追記と当て直しを見て直す。直すのはここ1か所）。
 *   窓: 直近24時間（開始から24時間までは開始から）
 *   m = 0.06 + 0.20 × (1 − p)（経過 4% で約 0.25、50% で 0.16、90% で 0.08）
 *   点の重み w = 0.75（2026-11-19 指揮が決定。ひとりでライブだけの回は上位ほど部屋の強さで稼げないので、最終日の伸びはふだんより小さめと見る）
 * 解析ジョブが model.special.params に書き、Worker はそれを読む（Worker を反映し直さなくても、マージと解析ジョブで値を変えられる）
 */
export const SPECIAL_DEFAULT_PARAMS: Readonly<SpecialParams> = { windowHours: 24, marginBase: 0.06, marginSlope: 0.2, spurtWeight: 0.75 }

/** 表に出し始める経過率（ふだんの MIN_VISIBLE_PROGRESS と同じ。102h で開始約4時間） */
export const SPECIAL_MIN_PROGRESS = 0.04

/** 窓の始まりの実測として、補間に使う2点の間隔の上限（model.ts の MAX_GAP_MS と同じ考え） */
const ANCHOR_MAX_GAP_MS = 2 * 3_600_000
/** 補間できないとき、窓の始まりの近くの1点をそのまま使ってよいずれの幅 */
const ANCHOR_TOLERANCE_MS = 3_600_000
/** 窓の中の積み上がり（シェアの差）がこれより小さいと割り算が荒れるので、開始からの窓に戻す */
const MIN_WINDOW_SHARE = 0.02

export interface SpecialCurves {
  spurt: (number | null)[]
  flat: (number | null)[]
}

/** 一覧の1回ぶんの曲線。日程（startAt・aggregateAt）はこの日程で焼いたという記録で、Worker は events の日程と一致するときだけ使う */
export interface SpecialEventCurves {
  eventId: number
  startAt: number
  aggregateAt: number
  ranks: Record<string, SpecialCurves>
}

export interface SpecialModel {
  algorithm: typeof SPECIAL_ALGORITHM
  /** 予測ログの版。`solo-special-v1@<一覧・値・曲線のハッシュ>`。ふだんの版と混ざらない */
  version: string
  /** 一覧（曲線の無い回＝日程がまだわからない回も含む） */
  events: number[]
  params: SpecialParams
  curves: SpecialEventCurves[]
}

/** 特別モデルで当てると決まった回の、使う版・値・曲線 */
export interface SpecialSelection {
  version: string
  params: SpecialParams
  curves: SpecialEventCurves
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/**
 * 特別モデルの曲線として使えるか。率モデルのシェア表（rate.ts の rateShareTable）は欠けの無い 0 → 1 の単調増加なので、
 * 格子の51点がすべて数で、最初が 0・最後が 1・途中で下がらないものだけ通す（形だけ合って中身の壊れた曲線で、全順位の予測が消えないように）
 */
export function isCurve(x: unknown): x is number[] {
  if (!Array.isArray(x) || x.length !== GRID.length || !x.every((v) => finite(v) && v >= 0 && v <= 1)) return false
  if (x[0] !== 0 || Math.abs((x[x.length - 1] as number) - 1) > 1e-6) return false
  for (let i = 1; i < x.length; i++) if ((x[i] as number) < (x[i - 1] as number)) return false
  return true
}

/** 焼いたときの日程と events の日程のずれをここまで許す（同じマスタから来るので、ふつうは一致する。秒の丸めの違いで外れないように） */
const SCHEDULE_TOLERANCE_MS = 5 * 60_000

/**
 * JSON から来た値を確かめる。おかしければ既定の値（SPECIAL_DEFAULT_PARAMS）。
 * spurtWeight は後から足した欄なので、無ければそこだけ既定の値（それより前に焼いた版でも、ほかの値は使う）
 */
export function paramsOf(x: unknown): SpecialParams {
  if (!isRecord(x)) return { ...SPECIAL_DEFAULT_PARAMS }
  const { windowHours, marginBase, marginSlope } = x
  const spurtWeight = x.spurtWeight === undefined ? SPECIAL_DEFAULT_PARAMS.spurtWeight : x.spurtWeight
  if (!finite(windowHours) || windowHours < 1 || windowHours > 240) return { ...SPECIAL_DEFAULT_PARAMS }
  if (!finite(marginBase) || marginBase < 0 || marginBase > 1) return { ...SPECIAL_DEFAULT_PARAMS }
  if (!finite(marginSlope) || marginSlope < 0 || marginSlope > 2) return { ...SPECIAL_DEFAULT_PARAMS }
  if (!finite(spurtWeight) || spurtWeight < 0 || spurtWeight > 1) return { ...SPECIAL_DEFAULT_PARAMS }
  return { windowHours, marginBase, marginSlope, spurtWeight }
}

/**
 * この回を特別モデルで当てるか。model.special の一覧に入っていて、この回の曲線が6順位ぶん壊れずにあり、
 * 焼いたときの日程が events の日程と一致する（5分以内）ときだけ。どれかが欠けたら null（ふだんの predict() で今と同じに出す）。
 * ★ モデルの JSON は D1 から読んで as Model しているだけなので、ここで1つずつ確かめる
 */
export function specialSelection(model: Model, meta: Pick<EventMeta, 'id' | 'startAt' | 'aggregateAt'>): SpecialSelection | null {
  const sp: unknown = model.special
  if (!isRecord(sp) || sp.algorithm !== SPECIAL_ALGORITHM || typeof sp.version !== 'string' || !sp.version.startsWith(`${SPECIAL_ALGORITHM}@`)) return null
  if (!Array.isArray(sp.events) || !sp.events.includes(meta.id) || !Array.isArray(sp.curves)) return null
  const curves: unknown = sp.curves.find((c: unknown) => isRecord(c) && c.eventId === meta.id)
  if (!isRecord(curves) || !finite(curves.startAt) || !finite(curves.aggregateAt) || !isRecord(curves.ranks)) return null
  if (Math.abs(curves.startAt - meta.startAt) > SCHEDULE_TOLERANCE_MS || Math.abs(curves.aggregateAt - meta.aggregateAt) > SCHEDULE_TOLERANCE_MS) return null
  const ranks = curves.ranks
  const ok = RANKS.every((r) => {
    const c = ranks[String(r)]
    return isRecord(c) && isCurve(c.spurt) && isCurve(c.flat)
  })
  if (!ok) return null
  return { version: sp.version, params: paramsOf(sp.params), curves: curves as unknown as SpecialEventCurves }
}

/** 帯の余白 m（経過率 p。0〜1 に収める） */
export function specialMargin(params: SpecialParams, p: number): number {
  return params.marginBase + params.marginSlope * (1 - Math.min(1, Math.max(0, p)))
}

const H = 3_600_000

/**
 * 窓の始まりの時刻。開始から窓の長さまでは null（窓を開始から取るので、過去の実測は要らない）
 */
export function specialWindowStart(meta: Pick<EventMeta, 'startAt'>, params: SpecialParams, t: number): number | null {
  const t0 = t - params.windowHours * H
  return t0 <= meta.startAt ? null : t0
}

/**
 * Worker が D1 から引く実測の範囲（窓の始まりの前後）。開始から窓の長さまでは null。
 * t は全順位の最新の取得時刻（順位ごとの取得時刻は数分しかずれない）
 */
export function specialAnchorRange(meta: Pick<EventMeta, 'startAt'>, params: SpecialParams, t: number): [number, number] | null {
  const t0 = specialWindowStart(meta, params, t)
  return t0 == null ? null : [t0 - ANCHOR_MAX_GAP_MS, t0 + ANCHOR_TOLERANCE_MS]
}

export interface Anchor {
  ts: number
  value: number
}

/**
 * 時刻 t0 の実測。前後の2点（間隔 2時間以内）があれば線形補間、無ければ t0 から1時間以内の最も近い1点をその時刻のまま使う。
 * どちらも無ければ null（呼ぶ側は開始からの窓に戻す）
 */
export function anchorAt(samples: readonly Sample[], t0: number): Anchor | null {
  let before: Sample | null = null
  let after: Sample | null = null
  for (const s of samples) {
    if (s[0] <= t0 && (!before || s[0] > before[0])) before = s
    if (s[0] >= t0 && (!after || s[0] < after[0])) after = s
  }
  if (before && after) {
    if (before[0] === after[0]) return { ts: t0, value: before[1] }
    if (after[0] - before[0] <= ANCHOR_MAX_GAP_MS) return { ts: t0, value: before[1] + ((after[1] - before[1]) * (t0 - before[0])) / (after[0] - before[0]) }
  }
  const near = [before, after]
    .filter((s): s is Sample => s != null && Math.abs(s[0] - t0) <= ANCHOR_TOLERANCE_MS)
    .sort((a, b) => Math.abs(a[0] - t0) - Math.abs(b[0] - t0))[0]
  return near ? { ts: near[0], value: near[1] } : null
}

/**
 * 窓の伸びから終値を出す: F = B + (B − B0) ÷ (S − S0) × (1 − S)。開始からの窓（S0 = 0・B0 = 0）なら F = B ÷ S（ふだんのモデルと同じ割り算）。
 * 途中からの窓で、窓の中の積み上がり（S − S0）が小さすぎる・値がおかしいときは null（呼ぶ側は開始からの窓に戻す）
 */
export function windowForecast(b: number, b0: number, s: number, s0: number): number | null {
  const minShare = s0 > 0 ? MIN_WINDOW_SHARE : 0
  if (!(s > 0) || !(s <= 1.0001) || !(s0 >= 0) || !(s - s0 > minShare) || !(b > 0) || !(b0 >= 0) || b0 > b) return null
  const f = b + ((b - b0) / (s - s0)) * (1 - Math.min(1, s))
  return Number.isFinite(f) ? Math.max(f, b) : null
}

/**
 * 参考値の札の欄。古い Bot（sekaimaster-bot）は special を読まないので、extrapolatedFrom を付けて「参考値」と出させる。
 * 文面が事実と食い違わないよう、ふだんのモデルがこの長さで選ぶ表の出どころをそのまま写す（226 = 102h は thin:「同じ長さの回が2回」）。
 * ふだんのモデルが参考値にしない長さ（標本3件以上）は、札を出すために extrapolatedFrom に長さそのものを入れる
 * （古い Bot はその回を「過去に無い長さ」と書いてしまう。そういう長さの回を一覧に入れるときは Bot も直す）
 */
function referenceFields(model: Model, rank: number, meta: EventMeta): { extrapolatedFrom: number; thin: ThinDuration | null; source: ReferenceSource } {
  const d = durationHours(meta)
  const rm = model.ranks?.[String(rank)]
  const choice = rm ? chooseTable(model, rm, d) : null
  if (choice && choice.extrapolatedFrom != null && choice.source != null) return { extrapolatedFrom: choice.extrapolatedFrom, thin: choice.thin, source: choice.source }
  return { extrapolatedFrom: d, thin: null, source: 'borrow' }
}

/**
 * 特別モデルの予測（純粋関数）。nearby は、この順位の窓の始まりの前後の実測（specialAnchorRange の範囲。開始からの窓なら空でよい）。
 * 予測の形は predict() と同じ（Worker・予測ログ・スナップショットがそのまま使える）で、special: 'solo' が付く
 */
export function predictSpecial(
  model: Model,
  sel: SpecialSelection,
  meta: EventMeta,
  rank: number,
  current: number,
  t: number,
  nearby: readonly Sample[],
): Prediction | null {
  const c = sel.curves.ranks[String(rank)]
  if (!c || !(current > 0)) return null
  const p = progressAt(meta, t)
  if (!(p > 0) || p > 1.001) return null
  const pc = Math.min(p, 1)
  const sSpurt = interpGrid(c.spurt, pc)
  const sFlat = interpGrid(c.flat, pc)
  if (sSpurt == null || sFlat == null) return null

  // 窓の始まり。開始から窓の長さまでは開始（B0 = 0・S0 = 0）。実測が無い・おかしいときも開始に戻す
  const t0 = specialWindowStart(meta, sel.params, t)
  const anchor = t0 == null ? null : anchorAt(nearby, t0)
  const forecast = (b0: number, p0: number) => {
    const s0Spurt = p0 > 0 ? interpGrid(c.spurt, p0) : 0
    const s0Flat = p0 > 0 ? interpGrid(c.flat, p0) : 0
    if (s0Spurt == null || s0Flat == null) return null
    const fs = windowForecast(current, b0, sSpurt, s0Spurt)
    const ff = windowForecast(current, b0, sFlat, s0Flat)
    return fs == null || ff == null ? null : { fs, ff }
  }
  const p0 = anchor ? progressAt(meta, anchor.ts) : 0
  const f = (anchor && p0 > 0 && p0 < pc ? forecast(anchor.value, p0) : null) ?? forecast(0, 0)
  if (!f) return null

  // 点 = F_spurt^w × F_flat^(1−w)（対数で重み付き平均。w = 0.5 で幾何平均）
  const w = sel.params.spurtWeight
  const predicted = Math.exp(w * Math.log(f.fs) + (1 - w) * Math.log(f.ff))
  const m = specialMargin(sel.params, pc)
  // 仕様は 下 = F_flat × (1 − m)・上 = F_spurt × (1 + m)。ふつうは F_flat ≤ F_spurt だが、並びは決めつけない
  const low = Math.max(current, Math.min(f.fs, f.ff) * (1 - m))
  const high = Math.max(f.fs, f.ff) * (1 + m)
  const ref = referenceFields(model, rank, meta)
  return {
    rank,
    progress: p,
    current,
    share: current / predicted,
    predicted,
    low,
    high,
    // ★ 確度は常に「目安」。帯の幅では決めない（ふだんの 80 ポイントで隠す決まりも外す）
    confidence: 'rough',
    extrapolatedFrom: ref.extrapolatedFrom,
    thin: ref.thin,
    referenceSource: ref.source,
    visible: p >= SPECIAL_MIN_PROGRESS,
    special: 'solo',
  }
}

/**
 * 特別モデルで出した回の答え合わせか（見張り・サイトの「幅の外」の数・Claude の補足から外す）。
 * 一覧の回か、予測ログに特別モデルの版が入っている回。答え合わせ（scripts/border/report.ts の Report）の形のうち、この2つだけを見る
 */
export function isSpecialReport(rep: { eventId: number; modelVersions?: readonly unknown[] }, list: readonly number[] = SOLO_ONLY_EVENTS): boolean {
  return (
    list.includes(rep.eventId) ||
    (rep.modelVersions ?? []).some((v) => typeof v === 'string' && (v.startsWith(`${SPECIAL_ALGORITHM}@`) || v.endsWith(SOLO_FALLBACK_SUFFIX)))
  )
}
