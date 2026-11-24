import { type LiveAssumption, assumptionTag } from "./lib/liveAssumption";

/**
 * 結果の見出しの横に出す想定の札（例「ひとりでライブ想定」）。
 * リフレッシュゲージの「この曲で走ると」と、周回プランのタイムラインで同じ見た目にする。
 */
export function AssumptionTag({ live }: { live: LiveAssumption }) {
  return (
    <span className="rounded border border-slate-300 px-1.5 py-0.5 text-xs font-bold text-slate-600">
      {assumptionTag(live)}
    </span>
  );
}
