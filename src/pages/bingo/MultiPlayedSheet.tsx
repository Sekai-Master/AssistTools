import { useId } from "react";
import { cn } from "../../lib/utils";
import type { BingoMusic } from "./bingoLogic";
import type { CardKind } from "./bingoShare";
import { CellSheetFrame } from "./CellSheetFrame";
import type { PlayedMatch } from "./PlayedSongSheet";

export interface PlayedGroup {
  id: string;
  /** 見出しに出す名前（「カード1」・付けた名前）。 */
  name: string;
  kind: CardKind;
  matches: PlayedMatch[];
  /** 休止中（反映しない。下に薄く並べる）。 */
  paused: boolean;
}

interface Props {
  music: BingoMusic;
  groups: readonly PlayedGroup[];
  onFill: () => void;
  onPickAgain: () => void;
  onClose: () => void;
}

const BUTTON_FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/** 1 枚ぶん: カードの名前と、当てはまるマス（お題は札と文言、曲名は「カードにあります」）。 */
function GroupItem({ group }: { group: PlayedGroup }) {
  const { name, kind, matches } = group;
  return (
    <li className="px-3 py-2">
      <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{name}</span>
      {matches.length === 0 ? (
        <span className="block text-xs text-slate-500">当てはまるマスはありません</span>
      ) : kind === "song" ? (
        <span className="block text-xs text-slate-600">
          カードにあります{matches[0].cleared && "（埋めた）"}
        </span>
      ) : (
        <ul className="mt-1 space-y-1">
          {matches.map((m) => (
            <li key={m.index} className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-xs text-slate-600 [overflow-wrap:anywhere]">
                {m.caption} <span className="font-bold text-slate-700">{m.text}</span>
              </span>
              {m.cleared && <span className="shrink-0 text-xs text-slate-500">埋めた</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * まとめて遊ぶの、遊んだ曲の小窓。入れた曲で埋まるマスをカードごとに見せ、「まとめて埋める」で全部のカードを一度に埋める。
 * 1 枚で遊ぶの PlayedSongSheet と同じ作り（押しただけでは埋めない・別の曲を選び直せる）。
 * 休止中のカードは数に入れず、下に「休止中（反映しません）」として薄く並べる（どのカードが止まっているか分かるように）。
 */
export function MultiPlayedSheet({ music, groups, onFill, onPickAgain, onClose }: Props) {
  const playing = groups.filter((g) => !g.paused);
  const paused = groups.filter((g) => g.paused);
  const hitCards = playing.filter((g) => g.matches.length > 0).length;
  const total = playing.reduce((n, g) => n + g.matches.length, 0);
  const open = playing.reduce((n, g) => n + g.matches.filter((m) => !m.cleared).length, 0);
  const pausedId = useId();
  const sub =
    total === 0 ? (
      "当てはまるマスはありません"
    ) : (
      <>
        当てはまるカード <span className="font-num font-bold">{hitCards}枚</span> ・ マス{" "}
        <span className="font-num font-bold">{total}つ</span>
      </>
    );

  return (
    <CellSheetFrame caption="遊んだ曲" title={music.title} sub={sub} onClose={onClose} className="max-h-[90dvh]">
      <div className="mt-4 min-h-0 overflow-y-auto rounded-lg border border-slate-300">
        <ul className="divide-y divide-slate-300">
          {playing.map((g) => (
            <GroupItem key={g.id} group={g} />
          ))}
        </ul>
        {paused.length > 0 && (
          // 見出しは薄くしない（12px を薄くすると読めない）。薄くするのはカードの行だけ
          <div className={cn(playing.length > 0 && "border-t border-slate-300")}>
            <p id={pausedId} className="px-3 pt-2 text-xs font-bold text-slate-600">
              休止中（反映しません）
            </p>
            <ul aria-labelledby={pausedId} className="divide-y divide-slate-300 opacity-50">
              {paused.map((g) => (
                <GroupItem key={g.id} group={g} />
              ))}
            </ul>
          </div>
        )}
      </div>
      {open > 0 ? (
        <button
          type="button"
          onClick={onFill}
          className={`neu-cta mt-4 min-h-12 w-full shrink-0 rounded-xl text-base font-bold ${BUTTON_FOCUS}`}
        >
          まとめて埋める（<span className="font-num">{open}</span>マス）
        </button>
      ) : (
        total > 0 && <p className="mt-4 text-center text-sm text-slate-600">もう埋まっています</p>
      )}
      <button
        type="button"
        onClick={onPickAgain}
        className={`mt-3 min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] ${BUTTON_FOCUS}`}
      >
        別の曲を選ぶ
      </button>
    </CellSheetFrame>
  );
}
