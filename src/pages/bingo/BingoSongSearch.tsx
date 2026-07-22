import { useMemo, useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import type { BingoMusic } from "./bingoLogic";
import type { AliasEntry } from "./useBingoMusics";

interface Props {
  musics: BingoMusic[];
  aliases: AliasEntry[];
  onSelect: (music: BingoMusic) => void;
  onClose: () => void;
}

/** 楽曲検索モーダル。曲名・読み・作者・エイリアスで絞り込み。 */
export function BingoSongSearch({ musics, aliases, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return musics.slice(0, 50);
    const aliasIds = new Set<string>();
    for (const a of aliases) {
      if (a.alias.toLowerCase().includes(q)) a.songIds.forEach((id) => aliasIds.add(id));
    }
    return musics
      .filter(
        (m) =>
          aliasIds.has(m.id) ||
          m.title.toLowerCase().includes(q) ||
          m.pronunciation?.includes(q) ||
          m.artistName?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [query, musics, aliases]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg max-h-[80vh] flex flex-col neu-panel p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-700">楽曲を選択</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <NeuInput
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="曲名・読み・作者・エイリアスで検索"
        />
        <div className="mt-3 flex-1 overflow-y-auto rounded-lg bg-neu shadow-neu-inset p-1">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">見つかりませんでした</p>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="block w-full text-left px-3 py-2 rounded text-sm text-slate-700 hover:bg-black/5"
              >
                {m.title}
                {m.artistName && (
                  <span className="ml-2 text-xs text-slate-400">{m.artistName}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
