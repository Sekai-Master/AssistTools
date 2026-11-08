import { useId, useMemo, useRef, useState } from "react";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { useModalA11y } from "../../lib/a11y";
import { onJacketError } from "../../lib/img";
import type { BingoMusic } from "./bingoLogic";
import { type Odai, listOdaiSongs } from "./odaiLogic";

interface Props {
  odai: Odai;
  cleared: boolean;
  musics: readonly BingoMusic[];
  jacketBase: string;
  onSetCleared: (cleared: boolean) => void;
  onClose: () => void;
}

const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** 判定しにくいお題（読みの頭・長さ）は、判定に使う値を曲名の下に出す。 */
function judgeHint(odai: Odai, m: BingoMusic): string | null {
  if (odai.kind === "row") return m.pronunciation ?? null;
  if (odai.kind === "length") return m.musicTime !== undefined ? formatTime(m.musicTime) : null;
  return null;
}

/**
 * お題の小窓。上で埋める／戻す、下で当てはまる曲を確かめる。
 * 「流れた曲が本当にそのお題に当てはまるか」を見てから埋めるためのもの。
 * 作法（data-overlay・useModalA11y・固定の高さ）は SongSearchModal と同じ。
 */
export function OdaiSheet({ odai, cleared, musics, jacketBase, onSetCleared, onClose }: Props) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  const total = useMemo(() => listOdaiSongs(odai, musics).length, [odai, musics]);
  const songs = useMemo(() => listOdaiSongs(odai, musics, query), [odai, musics, query]);

  return (
    <div
      // SongSearchModal と同じ印。開いたまま画面遷移しても位置が飛ばないようにする（motion.css）
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 固定の高さ: 絞り込みで件数が変わっても小窓の大きさは動かない */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-[80vh] max-h-[640px] w-full max-w-lg flex-col neu-panel p-4 sm:p-6 focus:outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{odai.caption}</p>
            <h2 id={titleId} className="text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">
              {odai.text}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              当てはまる曲 <span className="font-num font-bold">{total}曲</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-500 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        {cleared ? (
          <NeuButton
            autoFocus
            className="mt-4 min-h-12 w-full shrink-0 text-base"
            onClick={() => onSetCleared(false)}
          >
            戻す
          </NeuButton>
        ) : (
          <ActionButton
            autoFocus
            className="mt-4 min-h-12 w-full shrink-0 text-base"
            onClick={() => onSetCleared(true)}
          >
            埋める
          </ActionButton>
        )}

        {/* 16px 未満だと iOS が入力時に画面を拡大する */}
        <NeuInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="曲名・読みで絞り込み"
          aria-label="曲名・読みで絞り込み"
          className="mt-4 shrink-0 text-base"
        />
        {songs.length === 0 ? (
          <p className="mt-3 flex-1 rounded-lg bg-neu p-4 text-center text-sm text-slate-500 shadow-neu-inset">
            見つかりませんでした
          </p>
        ) : (
          <ul className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset">
            {songs.map((m) => {
              const hint = judgeHint(odai, m);
              return (
                <li key={m.id} className="flex items-center gap-3 rounded px-2 py-1">
                  <img
                    src={`${jacketBase}${m.jacketLink}`}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded object-cover"
                    loading="lazy"
                    onError={onJacketError}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">{m.title}</span>
                    {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
