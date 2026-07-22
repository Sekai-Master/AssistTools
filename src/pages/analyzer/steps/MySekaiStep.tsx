import { StepSection } from "./StepSection";
import type { CalculationResultV6 } from "../lib/calculator";

/** Step1: マイセカイで何をいくつ採るか。 */
export function MySekaiStep({ result }: { result: CalculationResultV6 }) {
  const a = result.mySekaiAllocation;
  const items = [
    { label: "木・石", count: a.countA, memo: "1.0", pt: result.unitBasePt },
    { label: "キラキラ・樽", count: a.countB, memo: "0.5", pt: Math.floor(result.unitBasePt * 0.5) },
    { label: "草花・工具箱・宝箱", count: a.countC, memo: "0.2", pt: Math.floor(result.unitBasePt * 0.2) },
  ];

  return (
    <StepSection
      unit="vs"
      title="① マイセカイ配分"
      footerLabel="このステップ完了時"
      footerValue={result.currentPt + a.totalPt}
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center rounded-xl bg-neu p-2 text-center shadow-neu-inset sm:p-4"
          >
            <span
              className="text-2xl font-bold tabular-nums sm:text-3xl"
              style={{ color: "var(--unit-color)" }}
            >
              {item.count}
            </span>
            <span className="mt-1 text-[11px] font-medium leading-tight text-slate-500 sm:text-xs">
              {item.label}
            </span>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] text-slate-500">
                ×{item.memo}
              </span>
              <span className="text-[10px] text-slate-500">単価 {item.pt}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">
        合計 約{" "}
        <span className="font-bold" style={{ color: "var(--unit-color)" }}>
          {a.totalPt.toLocaleString()}
        </span>{" "}
        Pt（単価 {result.unitBasePt} Pt/個）
      </p>
    </StepSection>
  );
}
