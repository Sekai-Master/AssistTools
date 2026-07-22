import type { CSSProperties, ReactNode } from "react";
import { UNIT_COLOR_VAR, type UnitKey } from "../../../lib/units";

/** 結果の各ステップの枠。ステップごとにテーマ色(--unit-color)を差し替える。 */
export function StepSection({
  unit,
  title,
  children,
  footerLabel,
  footerValue,
}: {
  unit: UnitKey;
  title: string;
  children: ReactNode;
  footerLabel: string;
  footerValue: number;
}) {
  const style = { "--unit-color": UNIT_COLOR_VAR[unit] } as CSSProperties;
  return (
    <section style={style} className="neu-panel p-5 sm:p-6">
      <h2
        className="mb-4 inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold text-white"
        style={{ backgroundColor: "var(--unit-color)" }}
      >
        {title}
      </h2>
      {children}
      <div className="mt-4 border-t border-slate-200 pt-2 text-right text-sm text-slate-500">
        {footerLabel}{" "}
        <span className="font-mono font-bold tabular-nums" style={{ color: "var(--unit-color)" }}>
          {footerValue.toLocaleString()} Pt
        </span>
      </div>
    </section>
  );
}
