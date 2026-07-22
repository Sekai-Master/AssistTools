import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** ニューモーフィズムのへこみテキストエリア（複数行入力）。 */
export const NeuTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg bg-neu px-3 py-2.5 text-slate-800 shadow-neu-inset resize-y",
      "outline-none border-2 border-transparent transition-colors",
      "focus-visible:border-[color:color-mix(in_srgb,var(--unit-color)_62%,#2b2b2b)]",
      className
    )}
    {...props}
  />
));
NeuTextarea.displayName = "NeuTextarea";
