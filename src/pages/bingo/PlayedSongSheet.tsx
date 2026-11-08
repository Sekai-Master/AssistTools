import type { ReactNode } from "react";
import type { BingoMusic } from "./bingoLogic";
import { CellSheetFrame } from "./CellSheetFrame";

export interface PlayedMatch {
  index: number;
  /** お題のマスだけ。曲名のマスは同じ曲なので一覧にしない。 */
  caption?: string;
  text?: string;
  cleared: boolean;
}

interface Props {
  kind: "odai" | "song";
  music: BingoMusic;
  matches: PlayedMatch[];
  onFill: () => void;
  onPickAgain: () => void;
  onClose: () => void;
}

function summary(kind: Props["kind"], count: number): ReactNode {
  if (kind === "song") return count > 0 ? "カードにあります" : "カードにはありません";
  if (count === 0) return "当てはまるマスはありません";
  return (
    <>
      当てはまるマス <span className="font-num font-bold">{count}つ</span>
    </>
  );
}

/**
 * 遊んだ曲の小窓。入れた曲で埋まるマスを見せ、まとめて埋める。
 * 長さや読みの行は覚えていなくても、曲を選べば当てはまるかが分かる。
 */
export function PlayedSongSheet({ kind, music, matches, onFill, onPickAgain, onClose }: Props) {
  const open = matches.filter((m) => !m.cleared).length;

  return (
    <CellSheetFrame caption="遊んだ曲" title={music.title} sub={summary(kind, matches.length)} onClose={onClose}>
      {kind === "odai" && matches.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-300 rounded-lg border border-slate-300">
          {matches.map((m) => (
            <li key={m.index} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-xs text-slate-500">{m.caption}</span>
                <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{m.text}</span>
              </span>
              {m.cleared && <span className="shrink-0 text-xs text-slate-500">埋めた</span>}
            </li>
          ))}
        </ul>
      )}
      {open > 0 ? (
        <button
          type="button"
          onClick={onFill}
          className="neu-cta mt-4 min-h-12 w-full shrink-0 rounded-xl text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
        >
          {open > 1 ? "まとめて埋める" : "埋める"}
        </button>
      ) : (
        matches.length > 0 && <p className="mt-4 text-center text-sm text-slate-600">もう埋まっています</p>
      )}
      <button
        type="button"
        onClick={onPickAgain}
        className="mt-3 min-h-11 w-full rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        別の曲を選ぶ
      </button>
    </CellSheetFrame>
  );
}
