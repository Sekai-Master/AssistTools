import { SCORE_STEP, maxScoreNOf } from "./constants";
import type { MultiLiveUnit } from "./multiLiveAdjust";

/**
 * スコア帯の実行難易度バッジ（ブリーフ P1-4）。
 *
 * ## なぜこの3値か
 *
 * 「スコア 700,000〜719,999」のような中間帯は、総合力が高いプレイヤーほど
 * 意図的にスコアを抑える必要があり難しい。一方 `0〜19,999`（放置）や
 * ユーザー設定のスコア上限付近（全力）は、狙いを外す必要がなく容易。
 * この難易度差は計算結果（MultiLiveUnit のスコア帯）だけでは見えないので、
 * 提示側でバッジとして明示する（診断4）。
 *
 * ## 判定根拠（マジックナンバー禁止）
 *
 * - 放置: unit.minScore === 0（スコア係数0＝帯 [0, SCORE_STEP-1]）。
 *   スコアをまったく気にしなくていい唯一の帯なので単独判定にする。
 * - 全力: unit の帯がユーザー設定のスコア上限が属する帯（maxScoreNOf(maxScore)）から
 *   FULL_POWER_BAND_MARGIN 帯以内。上限ぎりぎりまで出し切る必要がある帯。
 * - 狙い撃ち: 上記どちらでもない中間帯。総合力が高いほど意図的に抑える必要がある。
 *
 * 閾値は SCORE_STEP・maxScoreNOf（constants.ts の既存導出）から出すので、
 * スコア刻みやユーザーのスコア上限設定が変わっても追随する。
 *
 * ## 「全力」の範囲を最上帯1つから広げた理由（弱点5の解消）
 *
 * 最上帯だけを「全力」にすると、上限のすぐ下の帯（例: 上限110万なら
 * 1,080,000〜1,099,999）が「狙い撃ち」表示になる。しかしソロライブのスコアは
 * ノーツ判定・コンボの揺れで1帯（SCORE_STEP=20,000点）程度は普通にブレるため、
 * 上限のすぐ下を安定して確保するには、実質的に上限そのものを狙うのとほぼ同じ
 * 実力が要る。一方、上限から2帯以上離れると平均的なプレイでも十分届くため
 * 「狙い撃ち」相当の難易度に戻る。よって「全力」は最上帯からマージン1帯まで
 * とする（下の FULL_POWER_BAND_MARGIN）。
 *
 * このマージンはゲーム仕様の定数ではなく、上記の製品判断を明文化した
 * 提示ポリシー定数（MAX_PLANS 等と同種）。ゲーム側の値ではないため
 * calcLivePt 側からの導出はできないが、マジックナンバーとして散在させず
 * ここに集約し、判断根拠をコメントで示すことで弱点7と同型の再発を防ぐ。
 */
export type ScoreBandBadge = "放置" | "全力" | "狙い撃ち";

/** 「全力」とみなす、最上帯からのマージン（帯数）。根拠は上のコメント参照。 */
export const FULL_POWER_BAND_MARGIN = 1;

export function scoreBandBadge(
  unit: Pick<MultiLiveUnit, "minScore">,
  maxScore: number
): ScoreBandBadge {
  if (unit.minScore <= 0) return "放置";

  const topN = maxScoreNOf(maxScore); // ユーザー設定のスコア上限が属する帯の係数
  const unitN = Math.floor(unit.minScore / SCORE_STEP); // unit 自身の帯の係数

  if (unitN >= topN - FULL_POWER_BAND_MARGIN) return "全力";
  return "狙い撃ち";
}
