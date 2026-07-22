import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * ニューモーフィズムの浮き出しパネル。ツール内のセクション区切り。
 * padding を一定にして、ツールをまたいで余白を揃える。
 */
export function Panel({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section className={cn("neu-panel p-5 sm:p-6", className)}>
      {title && (
        <h2 className="mb-4 text-sm font-bold text-slate-500 tracking-wide">{title}</h2>
      )}
      {children}
    </section>
  );
}
