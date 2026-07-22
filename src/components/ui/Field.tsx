import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * ラベル＋コントロールの1行。ツール全体でラベルの見た目と間隔を統一する。
 * hint は補足文（小さいグレー）。
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-bold text-slate-600 border-l-4 pl-2"
        style={{ borderColor: "var(--unit-color)" }}
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
