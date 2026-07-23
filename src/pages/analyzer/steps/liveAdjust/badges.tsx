import type { ScoreBandBadge } from "../../lib/scoreBandBadge";

/** スコア帯の実行難易度バッジ（P1-4）。放置=容易・全力=上限まで出し切る・狙い撃ち=意図的に抑える必要あり。 */
export function ScoreBandTag({ band }: { band: ScoreBandBadge }) {
  if (band === "全力") {
    // 弱点4是正: 「編成変更なし」バッジ（塗り潰し+白字）と同じ見た目だと2つの意味の
    // 違うバッジが見分けられない。こちらは縁取りにして塗り潰しと区別する。
    return (
      <span
        className="rounded border px-1.5 py-0.5 text-[10px] font-bold"
        style={{ borderColor: "var(--unit-color)", color: "var(--unit-color)" }}
      >
        全力
      </span>
    );
  }
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
 * 主役に限らず常に表示する。塗り潰し+白字で、縁取りの ScoreBandTag「全力」と
 * 見た目でも区別できるようにする（弱点4）。
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
 * 「スコア0イベ乙」の締め1本を示すバッジ。締めはスコア帯が常に [0, SCORE_STEP-1] 固定で、
 * ScoreBandTag が持つ「難易度」の情報を持たない（自明に容易なだけ）ため、
 * 別バッジにして他ユニットと視覚的に区別する（ブリーフのUI要件）。
 */
export function FinishBadge() {
  return (
    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">
      イベ乙（スコア0固定）
    </span>
  );
}

/**
 * LB消費の現実コスト換算（R3-1）。
 * ゲーム仕様: 自然回復30分/個・クリスタル購入10個/個・所持上限10個。
 * 生の個数だけでは重さが伝わらない（480個＝自然回復10日）ため、時間と
 * クリスタルの両換算を併記する。lbCost 0 のときは換算不要なので出さない。
 */
export function LbCostNote({ lbCost }: { lbCost: number }) {
  if (lbCost <= 0) return null;
  // 0.5刻みの時間は「7.5時間」のように小数で表示する。
  return (
    <>
      （回復 約{(lbCost * 0.5).toLocaleString()}時間 ・ クリスタル約
      {(lbCost * 10).toLocaleString()}個）
    </>
  );
}
