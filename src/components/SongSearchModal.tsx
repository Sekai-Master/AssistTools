import { useMemo, useState } from "react";
import { NeuInput } from "./ui/NeuInput";

export interface SearchableSong {
  id: string;
  title: string;
  jacketLink: string;
  pronunciation?: string;
  artistName?: string;
}

export interface AliasEntry {
  alias: string;
  songIds: string[];
}

interface Props<T extends SearchableSong> {
  musics: T[];
  aliases: AliasEntry[];
  jacketBase: string;
  onSelect: (music: T) => void;
  onClose: () => void;
  title?: string;
  /** 各行の右側に出す補足（基礎点など）。 */
  meta?: (music: T) => string;
}

/**
 * 楽曲検索モーダル（BINGO・アナライザー共通）。
 * - 固定高さでモーダルサイズが結果数で変わらない（入力中のガタつき防止）
 * - ジャケット画像つき
 * - 曲名・読み・作者・エイリアスで絞り込み
 */
export function SongSearchModal<T extends SearchableSong>({
  musics,
  aliases,
  jacketBase,
  onSelect,
  onClose,
  title = "楽曲を選択",
  meta,
}: Props<T>) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return musics.slice(0, 80);
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
      .slice(0, 80);
  }, [query, musics, aliases]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 固定高さ: 結果数が変わってもモーダルの大きさは動かない */}
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg h-[70vh] max-h-[560px] flex flex-col neu-panel p-5"
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="font-bold text-slate-700">{title}</h2>
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
          className="shrink-0"
        />
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-lg bg-neu shadow-neu-inset p-1">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">見つかりませんでした</p>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-3 px-2 py-1.5 rounded text-left hover:bg-black/5"
              >
                <img
                  src={`${jacketBase}${m.jacketLink}`}
                  alt=""
                  className="h-9 w-9 rounded object-cover shrink-0"
                  loading="lazy"
                />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-slate-700">{m.title}</span>
                  {m.artistName && (
                    <span className="block truncate text-xs text-slate-400">{m.artistName}</span>
                  )}
                </span>
                {meta && <span className="text-xs text-slate-400 shrink-0">{meta(m)}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
