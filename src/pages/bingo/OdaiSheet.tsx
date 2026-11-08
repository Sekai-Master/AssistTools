import { useMemo, useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import { onJacketError } from "../../lib/img";
import type { BingoMusic } from "./bingoLogic";
import { type Odai, listOdaiSongs } from "./odaiLogic";
import { CellSheetFrame, FillButton } from "./CellSheetFrame";

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

/** 判定しにくいお題（読みの頭・長さ・コラボ）は、判定に使う値を曲名の下に出す。 */
function judgeHint(odai: Odai, m: BingoMusic): string | null {
  if (odai.kind === "row") return m.pronunciation ?? null;
  if (odai.kind === "length") return m.musicTime !== undefined ? formatTime(m.musicTime) : null;
  // コラボはどのコラボの曲かを添える（東方Projectコラボ など）
  if (odai.key === "oc") return m.collab ?? null;
  return null;
}

/**
 * お題の小窓。上で埋める／戻す、下で当てはまる曲を確かめる。
 * 「流れた曲が本当にそのお題に当てはまるか」を見てから埋めるためのもの。
 */
export function OdaiSheet({ odai, cleared, musics, jacketBase, onSetCleared, onClose }: Props) {
  const [query, setQuery] = useState("");
  const total = useMemo(() => listOdaiSongs(odai, musics).length, [odai, musics]);
  const songs = useMemo(() => listOdaiSongs(odai, musics, query), [odai, musics, query]);

  return (
    <CellSheetFrame
      caption={odai.caption}
      title={odai.text}
      sub={
        <>
          当てはまる曲 <span className="font-num font-bold">{total}曲</span>
        </>
      }
      onClose={onClose}
      // 固定の高さ: 絞り込みで件数が変わっても小窓の大きさは動かない
      className="h-[80vh] max-h-[640px]"
    >
      <FillButton cleared={cleared} onSetCleared={onSetCleared} />
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
    </CellSheetFrame>
  );
}
