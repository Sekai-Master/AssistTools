/**
 * 周回プランの点数計算。**タイムラインの模擬（timeline.ts）とは分けてある。**
 *
 * ── なぜ分けるか ──────────────────────────────────────────────
 * ゲージの模擬は「時間と%」だけで完結する純粋な物理で、点数は編成（総合力・
 * ボーナス・焚き数）が絡む別の話。1つの関数に混ぜると、片方を直すたびに
 * もう片方のテストが動いて根拠が追えなくなる。ここは result を受け取って
 * 点数だけを載せる層に徹する。
 *
 * ── 何が点になるか ────────────────────────────────────────────
 *   プレイ     … 点数時速 × 実働時間（100%到達後のムダ時間は加点しない）
 *   マイセカイ … メモリ数 × 単価（単価は総合力とボーナスから算出）
 *   休憩       … 0。ただし**オートを回していれば入る**（オートはゲージを増やさない
 *                 種別なので、休憩としての価値を保ったまま点だけ稼げる）
 */
import { LIVE_BONUS_MULTIPLIERS } from "../../analyzer/lib/calcLivePt";
import { mysekaiMemoriOf } from "./timeline";
import type { TimelineResult } from "./timeline";

/**
 * マイセカイ「全回収」1回ぶんのメモリ数の目安。
 *
 * 出典: event214 の実測（Sekai-Master-Private の public/wl214/params.json の mysekai）。総合力33.6万・ボーナス821%
 * のとき単価 7,500 Pt/メモリ で、全回収1回が 671,000 Pt。671,000 ÷ 7,500 = 89.5。
 * 1 LB = スタミナ1メモリぶんの回復なので、申告の「全回収で85〜90 LB」とも一致する。
 * ★ 資材の溜まり方で上下するので、あくまで初期値。ブロックごとに直せる。
 */
export const MYSEKAI_FULL_HARVEST_MEMORI = 89.5;

/** 焚き数での点数倍率比。基準時速×この比＝その焚き数の時速。 */
export function takiRate(hourlyRate: number, refTaki: number, taki: number): number {
  const ref = LIVE_BONUS_MULTIPLIERS[Math.max(0, Math.min(10, refTaki))] || 1;
  const m = LIVE_BONUS_MULTIPLIERS[Math.max(0, Math.min(10, taki))] || 1;
  return (hourlyRate * m) / ref;
}

/**
 * マイセカイ採取の獲得Pt。
 *
 * 単価はメモリ1つあたりで、採取物は 木石=1.0 / キラキラ=0.5 / 草花=0.2 メモリ。
 * 端数の畳み方は analyzer の allocateMySekai と同じ（0.1メモリ単位で持ってから割る）。
 */
export function mySekaiPoints(memori: number, unitBasePt: number): number {
  if (!(memori > 0) || !(unitBasePt > 0)) return 0;
  const units10x = Math.round(memori * 10);
  return Math.floor((units10x * unitBasePt) / 10);
}

export interface PlanPointsConfig {
  /** 起点となる現在ポイント */
  startPoints: number;
  /** 基準焚き数での点数時速(pt/時) */
  hourlyRate: number;
  /** 上の時速を出した焚き数 */
  refTaki: number;
  /** マイセカイ1メモリあたりのPt。0なら計上しない（総合力・ボーナス未入力時）。 */
  mySekaiUnitPt: number;
}

export interface PlanPointRow {
  /** このブロックで増えるポイント（丸め済み） */
  gained: number;
  /** ブロック終了時点の累積 */
  cumulative: number;
}

/**
 * 各ブロックの獲得ptと累積を出す。行数と順番は result.points と1対1。
 *
 * @param autoPointsByIndex 休憩ブロックで回したオートのPt（lib/autoPlan の結果）。
 *   オートは回数上限や休憩の尺で削られるので、**ここでは計算せず結果だけ受け取る**。
 */
export function computePlanPoints(
  result: TimelineResult,
  cfg: PlanPointsConfig,
  autoPointsByIndex?: ReadonlyMap<number, number>
): PlanPointRow[] {
  let cum = cfg.startPoints;
  return result.points.map((pt, i) => {
    const seg = pt.segment;
    let gained = 0;
    if (seg.kind === "play") {
      // 100%到達後は加点されない＝ゲージと点数が連動する。
      const effMin = Math.max(0, seg.minutes - pt.wastedMinutes);
      gained =
        takiRate(cfg.hourlyRate, cfg.refTaki, seg.taki ?? cfg.refTaki) * (effMin / 60);
    } else if (seg.kind === "mysekai") {
      gained = mySekaiPoints(mysekaiMemoriOf(seg), cfg.mySekaiUnitPt);
    } else if (seg.kind === "rest") {
      gained = autoPointsByIndex?.get(i) ?? 0;
    }
    cum += gained;
    return { gained: Math.round(gained), cumulative: Math.round(cum) };
  });
}
