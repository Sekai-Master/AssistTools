import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** ニューモーフィズムのへこみ入力欄。フォーカスでユニットカラーの枠。 */
export const NeuInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg bg-neu px-3 py-2.5 text-slate-800 shadow-neu-inset",
        "outline-none border-2 border-transparent neu-field-focus transition-colors",
        className
      )}
      {...props}
    />
  )
);
NeuInput.displayName = "NeuInput";
