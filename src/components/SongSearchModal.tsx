import { useId, useMemo, useRef, useState } from "react";
import { NeuInput } from "./ui/NeuInput";
import { useModalA11y } from "../lib/a11y";
import { onJacketError } from "../lib/img";
import { type AliasEntry, type SearchableSong, searchSongs } from "../lib/songSearch";

// 型は検索の処理と一緒に lib/songSearch.ts へ移した。ここから読んでいる所のために出し直す
export type { AliasEntry, SearchableSong };

/** 結果の一覧に出す曲数の上限（入力中に一覧が重くならないように）。 */
const RESULT_LIMIT = 80;

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  const results = useMemo(
    () => searchSongs(musics, aliases, query).slice(0, RESULT_LIMIT),
    [query, musics, aliases]
  );

  return (
    <div
      // ポータルを使わずステージの中に居る fixed 要素。開いたまま画面遷移すると
      // ブロック演出の filter に包含ブロックを奪われて位置が飛ぶので、この印を
      // 見つけたら遷移側がカスケードを降ろす（motion/motion.css の退避規則）。
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 固定高さ: 結果数が変わってもモーダルの大きさは動かない */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg h-[70vh] max-h-[560px] flex flex-col neu-panel p-4 sm:p-6 focus:outline-none"
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 id={titleId} className="font-bold text-slate-700">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-slate-500 hover:text-slate-600 text-xl leading-none"
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
            <p className="p-4 text-center text-sm text-slate-500">見つかりませんでした</p>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-3 px-2 py-1.5 rounded text-left hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)]"
              >
                <img
                  src={`${jacketBase}${m.jacketLink}`}
                  alt=""
                  className="h-9 w-9 rounded object-cover shrink-0"
                  loading="lazy"
                  onError={onJacketError}
                />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-slate-700">{m.title}</span>
                  {m.artistName && (
                    <span className="block truncate text-xs text-slate-500">{m.artistName}</span>
                  )}
                </span>
                {meta && <span className="text-xs text-slate-500 shrink-0">{meta(m)}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
