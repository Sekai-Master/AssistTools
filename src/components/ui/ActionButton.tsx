import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * 主アクション用のCTAボタン。ユニットカラーで塗るが「浮き出し」のまま
 * （＝押されていない・これから押せる）。押下時だけ沈む（.neu-tactile）。
 * 選択中トグル（NeuButton active＝へこみ固定）とは inset/raised で明確に区別する。
 */
export function ActionButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "neu-tactile rounded-xl px-6 py-3 font-bold text-white shadow-neu",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-[color:var(--unit-color)] focus-visible:ring-offset-neu",
        "disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
      style={{ backgroundColor: "var(--unit-color)" }}
      {...props}
    />
  );
}
