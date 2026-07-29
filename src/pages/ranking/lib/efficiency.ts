/**
 * 楽曲の効率ランキング。用途によって「効率」の定義が変わるのが要点。
 *
 *   手動周回 : 律速は時間     → Pt / 時間
 *   オート周回: 律速はライボ   → Pt / プレイ（放置なので時間はコストにならない）
 *   チャレライ: 1日1回        → スコア / プレイ
 *
 * 同じ「効率」という言葉で3つとも別物を指すので、混ぜて並べると必ず誤読される。
 * 実際、手動1位の独りんぼエンヴィーはオートでは3608位、
 * オート1位級のメルト・初音天地開闢神話は手動では3600位台に沈む。
 *
 * ## スコアの式（sekai-calculator の高速版と同じ）
 *
 *   rate  = baseScore + Σ(各枠のスコアアップ% × skillScoreSolo[i] / 100)
 *   score = floor(rate × 総合力 × 4)
 *
 * baseScore には難易度係数とコンボ係数が畳み込み済みなので、別途掛けない。
 *
 * ## イベントポイントの式
 *
 *   スコア係数 = floor(スコア / 20000)
 *   獲得Pt    = floor( floor((スコア係数 + 100) × (ボーナス + 100) / 100) × 基礎点 / 100 ) × 焚き倍率
 *
 * スコアが式に入るため、**総合力が変わるとランキングの順位が入れ替わる**。
 * 総合力が低いと定数項 +100 が支配的で「基礎点 ÷ 曲長」がほぼ全て、
 * 総合力が高いとスコア項が効いて譜面の質（baseScore）が順位を動かす。
 */

import { LIVE_BONUS_MULTIPLIERS } from "../../analyzer/lib/calcLivePt";

/** ランキングの種類。 */
export type RankingMode = "manual" | "auto" | "challenge";

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
  /** 曲長（秒）。難易度によらず同じ。 */
  musicTime: number | null;
  /** イベント基礎点。難易度によらず同じ。 */
  eventRate: number | null;
}

export interface EfficiencyParams {
  /** 総合力。 */
  power: number;
  /** イベントボーナス（%）。 */
  bonus: number;
  /** 焚き数（0〜10）。 */
  taki: number;
  /** 各スキル枠のスコアアップ（%）。単一値で全枠に適用する。 */
  skillUp: number;
  /** ロード・リザルト等の固定オーバーヘッド（秒）。 */
  overheadSec: number;
}

/** 計算で足すフィールド。入力側の型は呼び出し元のものを保つ（ジャケット等を落とさない）。 */
export interface EfficiencyMetrics {
  /** 1プレイのスコア。 */
  score: number;
  /** 1プレイのイベントポイント（焚き倍率込み）。 */
  eventPt: number;
  /** 1プレイの所要秒（曲長＋オーバーヘッド）。 */
  cycleSec: number;
  /** 並べ替えに使う値。モードによって意味が変わる。 */
  metric: number;
  /** 参考: 時間あたりのイベントポイント。 */
  ptPerHour: number;
}

export type EfficiencyResult = EfficiencyEntry & EfficiencyMetrics;

/** スコアを出す。データが欠けていれば null。 */
export function calcScore(
  e: EfficiencyEntry,
  power: number,
  skillUp: number,
  auto: boolean,
): number | null {
  const base = auto ? e.baseScoreAuto : e.baseScore;
  const weights = auto ? e.skillScoreAuto : e.skillScoreSolo;
  if (base == null || !weights?.length) return null;
  const rate = base + weights.reduce((s, w) => s + (skillUp * w) / 100, 0);
  return Math.floor(rate * power * 4);
}

/** イベントポイント。ゲーム側の丸めを再現するため floor の位置を守る。 */
export function calcEventPt(score: number, bonus: number, eventRate: number, taki: number): number {
  const scoreCoef = Math.floor(score / 20000);
  const step = Math.floor(((scoreCoef + 100) * (bonus + 100)) / 100);
  const mult = LIVE_BONUS_MULTIPLIERS[taki] ?? 1;
  return Math.floor((step * eventRate) / 100) * mult;
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
  const auto = mode === "auto";
  const out: (T & EfficiencyMetrics)[] = [];

  for (const e of entries) {
    if (e.musicTime == null || e.eventRate == null) continue;
    const score = calcScore(e, params.power, params.skillUp, auto);
    if (score == null) continue;

    const cycleSec = e.musicTime + params.overheadSec;
    const eventPt = calcEventPt(score, params.bonus, e.eventRate, params.taki);
    const ptPerHour = cycleSec > 0 ? (eventPt / cycleSec) * 3600 : 0;

    const metric = mode === "manual" ? ptPerHour : mode === "auto" ? eventPt : score;
    out.push({ ...e, score, eventPt, cycleSec, metric, ptPerHour });
  }

  // 同値のときは曲が短い順（実運用で有利な方を上に）、それも同じならID順で安定させる。
  return out.sort(
    (a, b) =>
      b.metric - a.metric ||
      (a.musicTime ?? 0) - (b.musicTime ?? 0) ||
      a.musicId.localeCompare(b.musicId),
  );
}

/**
 * 手持ちライブボーナスで稼げる総ポイント。オートタブ用。
 * 焚き数ぶんLBを消費するので、回せる回数は floor(LB / 焚き数)。
 */
export function totalWithLb(eventPt: number, lb: number, taki: number): { plays: number; total: number } {
  if (taki <= 0 || lb <= 0) return { plays: 0, total: 0 };
  const plays = Math.floor(lb / taki);
  return { plays, total: plays * eventPt };
}
