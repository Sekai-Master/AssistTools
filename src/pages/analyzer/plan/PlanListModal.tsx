import { useId, useMemo, useRef, useState } from "react";
import { clickableProps, useModalA11y } from "../../../lib/a11y";
import { NeuButton } from "../../../components/ui/NeuButton";
import type { UniversalPlan } from "./types";

type SortKey = "bonus" | "liveBonus" | "minScore";

/** 全プラン一覧モーダル。並び替え可能・固定高さ（結果数でガタつかない）。 */
export function PlanListModal({
  isOpen,
  onClose,
  title,
  plans,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  plans: UniversalPlan[];
  onSelect: (plan: UniversalPlan) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("bonus");
  const [asc, setAsc] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onClose, dialogRef);

  const sorted = useMemo(
    () => [...plans].sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey])),
    [plans, sortKey, asc]
  );

  if (!isOpen) return null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-2xl h-[75vh] max-h-[620px] flex flex-col neu-panel p-5 focus:outline-none"
      >
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h2 id={titleId} className="font-bold text-slate-700">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-slate-500 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 shrink-0">
          {(
            [
              ["bonus", "ボーナス"],
              ["liveBonus", "消費"],
              ["minScore", "スコア"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <NeuButton
              key={key}
              active={sortKey === key}
              className="!px-3 !py-1 !text-xs"
              onClick={() => toggleSort(key)}
            >
              {label}
              {sortKey === key ? (asc ? " ▲" : " ▼") : ""}
            </NeuButton>
          ))}
        </div>
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {sorted.map((plan) => (
            <div
              key={`${plan.bonus}-${plan.liveBonus}-${plan.minScore}`}
              {...clickableProps(() => onSelect(plan))}
              className="neu-raised neu-tactile cursor-pointer p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
            >
              <div className="grid grid-cols-3 items-center gap-2 text-center">
                <div>
                  <div className="text-[10px] font-bold text-slate-500">ボーナス</div>
                  <div className="text-lg font-bold" style={{ color: "var(--unit-color)" }}>
                    {plan.bonus}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">消費</div>
                  <div className="font-mono text-lg text-slate-700">{plan.liveBonus}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">スコア</div>
                  <div className="font-mono text-xs leading-tight text-slate-700">
                    {plan.minScore.toLocaleString()}
                    <br />〜{plan.maxScore.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
