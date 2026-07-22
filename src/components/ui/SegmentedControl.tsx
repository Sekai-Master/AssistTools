import { cn } from "../../lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

/**
 * 択一式（どちらか一方）のセグメントコントロール。
 * 溝(neu-inset)の中を色付きのつまみが滑る。1つしか選べないことが見て分かる。
 * 等幅の 2〜4 択向け。多数の選択肢には Segmented（チップ）を使う。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  return (
    <div
      className={cn(
        "relative inline-flex w-full max-w-sm rounded-xl bg-neu p-1 shadow-neu-inset",
        className
      )}
    >
      <span
        aria-hidden
        className="seg-thumb absolute top-1 bottom-1 rounded-lg transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          left: "0.25rem",
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "relative z-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
            value === o.value ? "text-white" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
