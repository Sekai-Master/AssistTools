import { UNIT_COLOR_VAR } from "../../lib/units";
import { cn } from "../../lib/utils";
import type { OdaiCell } from "./odaiLogic";

interface Props {
  card: OdaiCell[];
  onToggleCleared: (index: number) => void;
}

/**
 * お題カードの 5×5。マスを押すと埋まる（もう一度押すと戻る）。
 * ★ 320px では 1 マスが約 50px しかない。文言は区切り（chunks）ごとに inline-block で
 *   まとめ、語の途中で折れないようにする。区切りが 1 マスより長いときだけ字の単位で折る
 *   （line-break: strict で「ー」や小さい「ッ」が行の頭に来ないようにする）。
 */
export function OdaiCardGrid({ card, onToggleCleared }: Props) {
  return (
    <div className="-mx-2 grid grid-cols-5 gap-1 sm:mx-auto sm:max-w-lg sm:gap-2">
      {card.map((cell, i) => {
        if (cell === "FREE") {
          return (
            <div
              key={i}
              className="flex min-h-16 items-center justify-center rounded-lg bg-[color:var(--unit-color)] text-sm font-bold text-[color:var(--unit-ink)] sm:aspect-square"
            >
              FREE
            </div>
          );
        }
        const { odai, cleared } = cell;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={cleared}
            onClick={() => onToggleCleared(i)}
            className={cn(
              "relative flex min-h-16 flex-col items-center justify-center overflow-hidden rounded-lg border py-2 text-center leading-tight transition-colors sm:aspect-square",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
              cleared
                ? "border-transparent bg-[color:var(--unit-color)] text-[color:var(--unit-ink)]"
                : "border-slate-300 text-slate-700 hover:border-slate-400"
            )}
          >
            {odai.unit && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: UNIT_COLOR_VAR[odai.unit] }}
              />
            )}
            <span className={cn("text-xs", !cleared && "text-slate-500")}>{odai.caption}</span>
            <span className="mt-1 w-full text-xs font-bold [line-break:strict] [overflow-wrap:anywhere] sm:text-sm">
              {odai.chunks.map((chunk, j) => (
                <span key={j} className="inline-block max-w-full">
                  {chunk}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
