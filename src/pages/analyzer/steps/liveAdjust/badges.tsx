import { CRYSTALS_PER_LIVE_BONUS } from "../../lib/constants";
import type { ScoreBandBadge } from "../../lib/scoreBandBadge";

/**
 * スコア帯の実行難易度バッジ（R5 で「全力」を廃止し2値化）。
 * 放置=容易・狙い撃ち=意図的にスコアを抑える必要あり。
 */
export function ScoreBandTag({ band }: { band: ScoreBandBadge }) {
  if (band === "狙い撃ち") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
        狙い撃ち
      </span>
    );
  }
  return <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">放置</span>;
}

/**
 * 「編成変更なし」バッジ。multi の全プランは「現在の編成のまま」が前提なので、
 * 主役に限らず常に表示する。塗り潰し+白字で、ScoreBandTag と見た目で区別する。
 */
export function FormationUnchangedBadge() {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] text-white"
      style={{ backgroundColor: "var(--unit-color)" }}
    >
      編成変更なし
    </span>
  );
}

/**
 * 「スコア0でクリア（叩かない）」の締め1本を示すバッジ。締めはスコア帯が常に
 * [0, SCORE_STEP-1] 固定で ScoreBandTag の「難易度」情報を持たないため、
 * 別バッジで他ユニットと視覚的に区別する。
 */
export function FinishBadge() {
  return (
    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">
      叩かない（スコア0固定）
    </span>
  );
}

/**
 * LB消費の現実コスト換算（R5 で回復時間表示を削除）。
 *
 * 「今すぐ回復させるなら幾ら払うか」の意思決定材料だけを残す。自然回復＝待てば無料の
 * 時間は判断材料にならないため削除した（docs/point-adjust-step3-and-envy-brief.md §8）。
 * 倍率は CRYSTALS_PER_LIVE_BONUS（=10・クリスタル購入個数/個）から導出する。
 * lbCost 0 のときは換算不要なので出さない。
 */
export function LbCostNote({ lbCost }: { lbCost: number }) {
  if (lbCost <= 0) return null;
  return <>（クリスタル約{(lbCost * CRYSTALS_PER_LIVE_BONUS).toLocaleString()}個）</>;
}
