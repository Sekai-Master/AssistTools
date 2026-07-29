/**
 * 楽曲の効率ランキング。用途によって「効率」の定義も、使うスコア式も変わるのが要点。
 *
 *   手動周回 : 協力ライブ  律速は時間     → Pt / 時間
 *   オート周回: ソロ(オート) 律速はライボ   → Pt / プレイ（放置なので時間はコストにならない）
 *   チャレライ: ソロ        1日1回        → スコア / プレイ
 *
 * 同じ「効率」という言葉で3つとも別物を指すので、混ぜて並べると必ず誤読される。
 * 実際、手動1位の独りんぼエンヴィーはオートでは3600位台、
 * オート1位級のメルト・初音天地開闢神話は手動では3600位台に沈む。
 *
 * ## スコアの式（xfl03/sekai-calculator に準拠）
 *
 *   rate  = base + Σ(各枠の実効スコアアップ% × skillScore[i] / 100)
 *   score = floor(rate × 総合力 × 4)
 *
 * base には難易度係数とコンボ係数が畳み込み済みなので、別途掛けない。
 * ライブ種別で base と skillScore の組が変わる:
 *
 *   ソロ/チャレライ : baseScore                     × skillScoreSolo
 *   協力ライブ      : baseScore + feverScore × 0.5  × skillScoreMulti
 *   オート          : baseScoreAuto                 × skillScoreAuto
 *
 * ## スキルの効き方がソロと協力でまるで違う（ここが混乱の元）
 *
 * どちらも1曲につき6枠発動するが、その中身が別物:
 *
 *   ソロ  … 編成5枚が1枠ずつ ＋ 6枠目にリーダー（編成の一番左）がもう1回。
 *           1〜5枠の発動順は選べないので、5枚は平均値（期待値）で置く。
 *   協力  … 自分の編成の「リーダー100% ＋ サブ4枚が各20%」を合算した1つの実効値が、
 *           6枠すべてに同じだけ掛かる。**他人のスキルは自分のスコアには乗らない**。
 *
 * 協力で他人が効くのはスコアではなくイベントPtの側（下記）。「ついぼで強い人を呼ぶと
 * 単価が上がる」のは、自分のスコアが伸びるからではなく他4人の合計スコアが伸びるから。
 *
 * ## イベントポイント
 *
 * 丸めの作法は calcLivePt.ts に集約（ゲーム内実測で確定済み）。ここでは係数だけ差し替える。
 *
 *   ソロ/オート : 100 + floor(スコア / 20000)
 *   協力        : 110 + floor(自スコア / 17000) + min(13, floor(他4人合計 / 340000))
 *
 * スコアが式に入るため、**総合力が変わるとランキングの順位が入れ替わる**。
 * 総合力が低いと定数項が支配的で「基礎点 ÷ 曲長」がほぼ全て、
 * 総合力が高くなるほど譜面そのものの質（baseScore）が順位を動かす。
 */

import { calcLivePt, calcMultiLivePt } from "../../analyzer/lib/calcLivePt";

/** ランキングの種類。 */
export type RankingMode = "manual" | "auto" | "challenge";

/** スコア式の種別。ランキングの種類から一意に決まる。 */
export type LiveType = "multi" | "solo" | "auto";

export const LIVE_BY_MODE: Record<RankingMode, LiveType> = {
  manual: "multi",
  auto: "auto",
  challenge: "solo",
};

/** 協力ライブのフィーバー加点。sekai-calculator と同じく base に 0.5 倍で足す。 */
export const FEVER_RATE = 0.5;

/** 協力ライブでサブ（リーダー以外の4枚）のスキルが効く割合。 */
export const MULTI_SUB_RATE = 0.2;

/** スキル発動枠の数。ソロも協力も6。 */
export const SKILL_SLOTS = 6;

/** 1曲1難易度ぶんの入力。 */
export interface EfficiencyEntry {
  musicId: string;
  title: string;
  difficulty: string;
  playLevel: number | null;
  noteCount: number | null;
  /** スキル無しでAPしたときのスコア率（ソロ）。 */
  baseScore: number | null;
  /** スキル発動6枠それぞれの重み（ソロ）。 */
  skillScoreSolo: number[] | null;
  /** オート時のスコア率。 */
  baseScoreAuto: number | null;
  /** オート時のスキル枠重み。 */
  skillScoreAuto: number[] | null;
  /** 協力ライブのスキル枠重み。 */
  skillScoreMulti: number[] | null;
  /** 協力ライブのフィーバー加点ぶん。 */
  feverScore: number | null;
  /** 曲長（秒）。難易度によらず同じ。 */
  musicTime: number | null;
  /** イベント基礎点。難易度によらず同じ。 */
  eventRate: number | null;
}

export interface EfficiencyParams {
  /** 総合力。 */
  power: number;
  /** イベントボーナス（%）。0.5刻みを取りうるので小数を許す。 */
  bonus: number;
  /** 焚き数（0〜10）。 */
  taki: number;
  /** リーダー（編成の一番左）のスコアアップ（%）。 */
  skillLeader: number;
  /** サブ4枚の平均スコアアップ（%）。 */
  skillSub: number;
  /** ロード・リザルト等の固定オーバーヘッド（秒）。 */
  overheadSec: number;
}

/**
 * 入力なしで開いたときの前提値。
 * 「だいたいこのへんの人が回している」という想定で、順位の目安を出すためだけのもの。
 * 画面には必ずこの値を明示して、ユーザーが自分の条件に差し替えられるようにする。
 */
export const DEFAULT_PARAMS: EfficiencyParams = {
  power: 250_000,
  bonus: 400,
  taki: 5,
  skillLeader: 130,
  skillSub: 110,
  overheadSec: 20,
};

/** 計算で足すフィールド。入力側の型は呼び出し元のものを保つ（ジャケット等を落とさない）。 */
export interface EfficiencyMetrics {
  /** 1プレイのスコア。 */
  score: number;
  /** 1プレイのイベントポイント（焚き倍率込み）。チャレライでは 0。 */
  eventPt: number;
  /** 1プレイの所要秒（曲長＋オーバーヘッド）。 */
  cycleSec: number;
  /** 並べ替えに使う値。モードによって意味が変わる。 */
  metric: number;
  /** 1位を100としたときの相対値。入力なしで見るときの主役。 */
  index: number;
  /** 参考: 時間あたりのイベントポイント。 */
  ptPerHour: number;
}

export type EfficiencyResult = EfficiencyEntry & EfficiencyMetrics;

/** ライブ種別ごとの base（スキル無しのスコア率）。 */
export function baseRate(e: EfficiencyEntry, live: LiveType): number | null {
  if (live === "auto") return e.baseScoreAuto;
  if (e.baseScore == null) return null;
  if (live === "solo") return e.baseScore;
  // 協力はフィーバーぶんが乗る。無い曲は他と条件が揃わないので混ぜない。
  if (e.feverScore == null) return null;
  return e.baseScore + e.feverScore * FEVER_RATE;
}

/** ライブ種別ごとのスキル枠重み。長さ6でなければ計算しない（黙って偽スコアを出さない）。 */
export function skillWeights(e: EfficiencyEntry, live: LiveType): number[] | null {
  const w = live === "auto" ? e.skillScoreAuto : live === "multi" ? e.skillScoreMulti : e.skillScoreSolo;
  return w?.length === SKILL_SLOTS ? w : null;
}

/**
 * スコアを出す。データが欠けていれば null。
 *
 * ソロ: 1〜5枠は発動順が選べないので5枚の平均、6枠目だけリーダー。
 * 協力: リーダー100%＋サブ各20%を合算した実効値が6枠すべてに同じだけ掛かる。
 */
export function calcScore(e: EfficiencyEntry, params: EfficiencyParams, live: LiveType): number | null {
  const base = baseRate(e, live);
  const weights = skillWeights(e, live);
  if (base == null || weights == null) return null;

  let skillTerm: number;
  if (live === "multi") {
    const effective = params.skillLeader + 4 * params.skillSub * MULTI_SUB_RATE;
    skillTerm = effective * weights.reduce((s, w) => s + w, 0);
  } else {
    const avgFive = (params.skillLeader + 4 * params.skillSub) / 5;
    const head = weights.slice(0, 5).reduce((s, w) => s + w, 0);
    skillTerm = avgFive * head + params.skillLeader * weights[5];
  }

  return Math.floor((base + skillTerm / 100) * params.power * 4);
}

/** ライブ種別ごとのイベントポイント。丸めは実測で確定した calcLivePt 系に委ねる。 */
export function eventPtFor(
  live: LiveType,
  score: number,
  eventRate: number,
  params: EfficiencyParams
): number {
  if (live === "multi") return calcMultiLivePt(eventRate, params.bonus, score, params.taki);
  return calcLivePt(eventRate, params.bonus, score, params.taki);
}

/**
 * ランキングを作る。返り値は metric の降順。
 *
 * metric の定義:
 *   manual    … 時間あたりイベントPt
 *   auto      … 1プレイあたりイベントPt（放置前提なので時間を割らない）
 *   challenge … 1プレイあたりスコア
 */
export function rankSongs<T extends EfficiencyEntry>(
  entries: T[],
  params: EfficiencyParams,
  mode: RankingMode,
): (T & EfficiencyMetrics)[] {
  const live = LIVE_BY_MODE[mode];
  const scored: (T & Omit<EfficiencyMetrics, "index">)[] = [];

  for (const e of entries) {
    // 必須フィールドはモードごとに違う。チャレライは曲長も基礎点も metric に無関係なので、
    // それを理由に曲を落とすと「メタが揃っていない新曲だけ消える」ことになる。
    if (mode === "manual" && e.musicTime == null) continue;
    if (mode !== "challenge" && e.eventRate == null) continue;

    const score = calcScore(e, params, live);
    if (score == null) continue;

    const cycleSec = (e.musicTime ?? 0) + params.overheadSec;
    const eventPt = mode === "challenge" ? 0 : eventPtFor(live, score, e.eventRate!, params);
    const ptPerHour = cycleSec > 0 ? (eventPt / cycleSec) * 3600 : 0;

    const metric = mode === "manual" ? ptPerHour : mode === "auto" ? eventPt : score;
    scored.push({ ...e, score, eventPt, cycleSec, metric, ptPerHour });
  }

  // 同値のときは曲が短い順（実運用で有利な方を上に）、それも同じならID順で安定させる。
  scored.sort(
    (a, b) =>
      b.metric - a.metric ||
      (a.musicTime ?? 0) - (b.musicTime ?? 0) ||
      a.musicId.localeCompare(b.musicId),
  );

  // 指数は 1位=100。生の Pt を見せなくても差が読めるようにするための主指標。
  const top = scored.length > 0 ? scored[0].metric : 0;
  return scored.map((r) => ({ ...r, index: top > 0 ? (r.metric / top) * 100 : 0 }));
}
