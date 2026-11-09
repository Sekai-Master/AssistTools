import { cn } from "../../lib/utils";
import { SINGER_GROUPS } from "./bingoSingers";

/**
 * 歌う人を 1 人選ぶ欄（曲を選ぶ小窓と、曲名ビンゴの細かい設定で共通）。
 * ★ 16px 未満だと iOS が入力時に画面を拡大するので text-base。高さは押しやすい 44px 以上
 */
export function SingerSelect({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (singer: number | null) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="歌う人"
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cn(
        "min-h-11 rounded-lg border-2 border-transparent bg-neu px-3 text-base text-slate-800 shadow-neu-inset outline-none",
        "focus-visible:border-[color:color-mix(in_srgb,var(--unit-color)_62%,var(--neu-ink))]",
        className
      )}
    >
      <option value="">すべて</option>
      {SINGER_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.singers.map((s) => (
            <option key={s.ch} value={s.ch}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
