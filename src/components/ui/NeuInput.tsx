import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** ニューモーフィズムのへこみ入力欄。フォーカスでユニットカラーの枠。 */
export const NeuInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg bg-neu px-3 py-2.5 text-slate-800 shadow-neu-inset",
        "outline-none border-2 border-transparent transition-colors",
        "focus-visible:border-[color:color-mix(in_srgb,var(--unit-color)_62%,#2b2b2b)]",
        className
      )}
      {...props}
    />
  )
);
NeuInput.displayName = "NeuInput";
