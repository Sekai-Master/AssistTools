import { useId, useMemo, useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import { onJacketError } from "../../lib/img";
import type { BingoMusic } from "./bingoLogic";
import { type Odai, type OdaiSongGroup, groupOdaiSongs, listOdaiSongs } from "./odaiLogic";
import { CellSheetFrame, FillButton } from "./CellSheetFrame";

interface Props {
  odai: Odai;
  cleared: boolean;
  musics: readonly BingoMusic[];
  jacketBase: string;
  onSetCleared: (cleared: boolean) => void;
  onClose: () => void;
}

/** 一覧の 1 曲。判定しにくいお題（読み・長さ・追加・譜面）は、判定に使う値を曲名の下に出す（odaiDefs.ts の hint）。 */
function SongRow({ music, hint, jacketBase }: { music: BingoMusic; hint: string | null; jacketBase: string }) {
  return (
    <li className="flex items-center gap-3 rounded px-2 py-1">
      <img
        src={`${jacketBase}${music.jacketLink}`}
        alt=""
        className="h-9 w-9 shrink-0 rounded object-cover"
        loading="lazy"
        onError={onJacketError}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-700">{music.title}</span>
        {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
      </span>
    </li>
  );
}

/** 区切り 1 つ（コラボのお題のコラボ 1 つ）: 見出しに名前と曲数、その下に曲。 */
function SongGroup({ group, odai, jacketBase }: { group: OdaiSongGroup; odai: Odai; jacketBase: string }) {
  const headingId = useId();
  return (
    // section にすると名前付きの region（ランドマーク）が 10 個並ぶので、まとまり（group）にする
    <div role="group" aria-labelledby={headingId} className="pt-3 first:pt-1">
      <h3
        id={headingId}
        className="flex items-baseline justify-between gap-2 border-b border-slate-300 px-2 pb-1 text-xs font-bold text-slate-600"
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{group.label}</span>
        <span className="shrink-0 font-num font-normal text-slate-500">{group.total}曲</span>
      </h3>
      <ul className="mt-1">
        {group.songs.map((m) => (
          <SongRow key={m.id} music={m} hint={odai.hint?.(m) ?? null} jacketBase={jacketBase} />
        ))}
      </ul>
    </div>
  );
}

const LIST_BOX = "mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset";

/**
 * お題の小窓。上で埋める／戻す、下で当てはまる曲を確かめる。
 * 「流れた曲が本当にそのお題に当てはまるか」を見てから埋めるためのもの。
 * コラボのお題は、コラボごとに区切って出す（曲の多いコラボから）。
 */
export function OdaiSheet({ odai, cleared, musics, jacketBase, onSetCleared, onClose }: Props) {
  const [query, setQuery] = useState("");
  const total = useMemo(() => listOdaiSongs(odai, musics).length, [odai, musics]);
  const songs = useMemo(() => listOdaiSongs(odai, musics, query), [odai, musics, query]);
  const groups = useMemo(() => groupOdaiSongs(odai, musics, query), [odai, musics, query]);

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
      ) : odai.group ? (
        <div className={LIST_BOX}>
          {groups.map((g) => (
            <SongGroup key={g.label} group={g} odai={odai} jacketBase={jacketBase} />
          ))}
        </div>
      ) : (
        <ul className={LIST_BOX}>
          {songs.map((m) => (
            <SongRow key={m.id} music={m} hint={odai.hint?.(m) ?? null} jacketBase={jacketBase} />
          ))}
        </ul>
      )}
    </CellSheetFrame>
  );
}
