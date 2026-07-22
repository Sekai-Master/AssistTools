import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface NeuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 選択状態。ユニットカラーで塗る。 */
  active?: boolean;
}

/**
 * ニューモーフィズムのボタン。通常は浮き出し、active でユニットカラー塗り＋へこみ。
 * プリセット選択（evc/tweet のボタン群）と汎用アクションの両方に使う。
 */
export function NeuButton({ active, className, ...props }: NeuButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-bold transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
        active
          ? "text-white shadow-neu-inset"
          : "text-slate-600 bg-neu shadow-neu-sm hover:-translate-y-0.5 active:shadow-neu-inset",
        className
      )}
      style={active ? { backgroundColor: "var(--unit-color)" } : undefined}
      {...props}
    />
  );
}
