import { clickableProps } from "../../../lib/a11y";
import { cn } from "../../../lib/utils";
import type { UniversalPlan } from "./types";

interface PlanCardProps {
  plan: UniversalPlan;
  variant: "compact" | "detailed";
  jacketSrc?: string;
  songTitle?: string;
  onClick?: () => void;
}

/**
 * 調整プランのカード。テーマ色は親が --unit-color で与える。
 * compact: 推奨一覧のクリック可能な小カード。
 * detailed: 選択中の大カード（ラストランはジャケット付き）。
 */
export function PlanCard({ plan, variant, jacketSrc, songTitle, onClick }: PlanCardProps) {
  if (variant === "compact") {
    return (
      <div
        {...clickableProps(onClick)}
        className={cn(
          "neu-panel neu-tactile cursor-pointer p-4",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-slate-500">イベントボーナス</span>
          <span className="text-2xl font-bold" style={{ color: "var(--unit-color)" }}>
            {plan.bonus}%
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-b border-slate-200 pb-2">
          <span className="text-xs font-bold text-slate-500">消費ライブボーナス</span>
          <span className="font-mono text-lg text-slate-700">{plan.liveBonus}</span>
        </div>
        <div className="mt-2">
          <span className="text-xs font-bold text-slate-500">目標スコア</span>
          <div className="font-mono font-bold text-slate-800 tabular-nums">
            {plan.minScore.toLocaleString()}
            <span className="mx-1 text-slate-400">〜</span>
            {plan.maxScore.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-panel p-5">
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {jacketSrc && (
          <img
            src={jacketSrc}
            alt=""
            className="h-24 w-24 rounded-xl object-cover shadow-neu-sm shrink-0"
          />
        )}
        <div className="flex-1 w-full text-center sm:text-left">
          {songTitle && <p className="mb-2 text-sm font-bold text-slate-600">{songTitle}</p>}
          <div className="flex items-center justify-around gap-4 rounded-xl bg-neu p-4 shadow-neu-inset">
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-500">ボーナス</span>
              <span className="text-3xl font-extrabold" style={{ color: "var(--unit-color)" }}>
                {plan.bonus}
                <span className="text-lg">%</span>
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-500">消費</span>
              <span className="flex items-center gap-1 text-3xl font-mono font-bold text-slate-700">
                <img src={`${import.meta.env.BASE_URL}images/LB.png`} alt="" className="h-6 w-6" />
                {plan.liveBonus}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xs font-bold text-slate-500">目標スコア範囲</span>
            <div className="font-mono text-xl font-bold text-slate-800 tabular-nums">
              {plan.minScore.toLocaleString()}
              <span className="mx-2" style={{ color: "var(--unit-color)" }}>
                〜
              </span>
              {plan.maxScore.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
