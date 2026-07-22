import { useId } from "react";
import { cn } from "../../lib/utils";

/**
 * ニューモーフィズムのトグルスイッチ。ON でユニットカラー。
 * ネイティブ checkbox を土台にするのでキーボード操作・フォーカスがそのまま効く。
 */
export function Switch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("inline-flex items-center gap-2 cursor-pointer", className)}>
      <span className="relative inline-block h-7 w-12 shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={cn(
            "absolute inset-0 rounded-full shadow-neu-inset transition-colors",
            checked ? "" : "bg-neu"
          )}
          style={checked ? { backgroundColor: "var(--unit-color)" } : undefined}
        />
        <span
          className={cn(
            "absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--unit-color)]",
            checked && "translate-x-5"
          )}
        />
      </span>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </label>
  );
}
