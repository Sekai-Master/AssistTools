import type { MultiLiveUnit } from "./multiLiveAdjust";

/**
 * スコア帯の実行難易度バッジ（R5 で「全力」を廃止し2値化）。
 *
 * ## なぜ2値か
 *
 * 「放置」（minScore===0＝スコアをまったく気にせず叩ける唯一の帯）は、
 * 実行が確定する実用情報なので残す。一方「全力」（上限付近）は
 * 「意味が伝わらない」ため削除した（docs/point-adjust-step3-and-envy-brief.md §5）。
 * 残りはすべて「狙い撃ち」（総合力が高いほど意図的にスコアを抑える必要がある帯）。
 *
 * ## 判定根拠（マジックナンバー禁止）
 *
 * - 放置: unit.minScore <= 0（スコア係数0＝帯 [0, SCORE_STEP-1]）。
 * - 狙い撃ち: それ以外。
 *
 * 「全力」を廃したので、ユーザー設定のスコア上限（maxScore）にはもう依存しない。
 * 旧 FULL_POWER_BAND_MARGIN と maxScore 引数は不要になったため削除した。
 */
export type ScoreBandBadge = "放置" | "狙い撃ち";

export function scoreBandBadge(unit: Pick<MultiLiveUnit, "minScore">): ScoreBandBadge {
  return unit.minScore <= 0 ? "放置" : "狙い撃ち";
}
