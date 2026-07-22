import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface NeuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 選択状態。ユニットカラーで塗り、へこませる（＝選ばれて沈んでいる）。 */
  active?: boolean;
}

/**
 * ニューモーフィズムのボタン。
 *  - 通常: 浮き出し。ホバーで浮上、押すと沈む（.neu-tactile）。
 *  - 選択中(active): ユニットカラー塗り＋へこみ固定。押下時だけ軽く scale。
 * プリセット選択（evc/tweet のボタン群）と汎用アクションの両方に使う。
 */
export function NeuButton({ active, className, ...props }: NeuButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-bold",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
        active
          ? "neu-selected transition-transform duration-100 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          : "bg-neu text-slate-600 shadow-neu-sm neu-tactile",
        className
      )}
      {...props}
    />
  );
}
