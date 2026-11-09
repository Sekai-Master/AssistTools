import { useRef } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import type { BingoMusic } from "./bingoLogic";
import { MAX_SONG_PINS } from "./songPinStorage";

interface Props {
  pins: readonly BingoMusic[];
  /** 絞り込みの条件の外にある入れたい曲の id（それでもカードには入る。チップに小さく出す）。 */
  outside: ReadonlySet<string>;
  /** 条件の曲から選ぶマスの数（入れたい曲を除いた残り）。 */
  rest: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPick: () => void;
}

/**
 * 曲名ビンゴの入れたい曲の段（細かい設定）: 選んだ曲をチップで並べ（それぞれ外せる）、「曲を選ぶ」で選ぶ小窓を開く。
 * 24 曲まで選べるので、1 つずつ外す手間を省く「すべて外す」も置く（確かめてから外す）。
 */
export function PinnedSongs({ pins, outside, rest, onRemove, onClear, onPick }: Props) {
  // 外した × は消えるので、フォーカスは「曲を選ぶ」へ移す（body に落とさない）
  const pickRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-500">
        入れたい曲（<span className="font-num">{MAX_SONG_PINS}</span>曲まで）
      </p>
      <p className="mb-2 text-sm text-slate-600">
        {pins.length > 0 ? (
          <>
            選んだ曲を必ず入れ、残り <span className="font-num">{rest}</span> マスは下の条件から選びます
          </>
        ) : (
          "選んだ曲を、新しいカードに必ず入れます"
        )}
      </p>
      {pins.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {pins.map((m) => (
            <li key={m.id} className="flex min-h-11 max-w-full items-center rounded-lg border border-slate-300 pl-3">
              <span className="min-w-0 py-1">
                <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{m.title}</span>
                {outside.has(m.id) && <span className="block text-xs text-slate-500">条件の外</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  onRemove(m.id);
                  pickRef.current?.focus();
                }}
                aria-label={`${m.title}を外す`}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-500 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <NeuButton ref={pickRef} className="min-h-11 !px-3" onClick={onPick}>
          曲を選ぶ
        </NeuButton>
        {pins.length > 0 && (
          <NeuButton
            className="min-h-11 !px-3"
            onClick={() => {
              if (!window.confirm("入れたい曲をすべて外しますか？")) return;
              onClear();
              pickRef.current?.focus();
            }}
          >
            すべて外す
          </NeuButton>
        )}
      </div>
    </div>
  );
}
