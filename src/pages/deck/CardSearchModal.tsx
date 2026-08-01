import { useId, useMemo, useRef, useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import { useModalA11y } from "../../lib/a11y";
import { cn } from "../../lib/utils";
import {
  ATTR_COLOR,
  ATTR_LABEL,
  ATTR_ORDER,
  CHARACTERS,
  RARITY_LABEL,
  UNIT_ORDER,
  UNIT_SHORT,
  characterName,
} from "./lib/characters";
import type { CatalogCard } from "./lib/deckInputs";
import { CardThumb } from "./CardThumb";

/**
 * カード選択モーダル。
 *
 * ★ **カード画像はこのサイトに存在しない**（配信しているのは数値データだけで、
 *   外部 CDN を叩くのは禁じ手＝docs/deck-builder.md の不可侵の制約）。
 *   よって「ジャケットを眺めて選ぶ」楽曲モーダル（SongSearchModal）の作りは使えない。
 *   代わりに**キャラで絞ってから名前で選ぶ**導線にする。1416枚あっても、
 *   キャラを1人選べば残りは高々100枚台なので、素の一覧で足りる。
 *
 * SongSearchModal を props で共通化しない代わりに、作法（固定高さ・useModalA11y・
 * data-overlay 印・NeuInput）はそのまま踏襲している。
 */
export function CardSearchModal({
  cards,
  onSelect,
  onClose,
  usedIds = [],
}: {
  cards: CatalogCard[];
  onSelect: (card: CatalogCard) => void;
  onClose: () => void;
  /** すでに編成に入っている id（同じカードは2枚編成できないので選べなくする）。 */
  usedIds?: number[];
}) {
  const [query, setQuery] = useState("");
  const [ch, setCh] = useState<number | null>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [attr, setAttr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  const used = useMemo(() => new Set(usedIds), [usedIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (ch != null && c.ch !== ch) return false;
        if (rarity && c.rarity !== rarity) return false;
        if (attr && c.attr !== attr) return false;
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || characterName(c.ch).includes(q);
      })
      // 新しいカードほど上（id は追加順）。目当てのカードはたいてい最近のもの。
      .sort((a, b) => b.id - a.id)
      .slice(0, 120);
  }, [cards, query, ch, rarity, attr]);

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
      active ? "neu-selected" : "bg-neu text-slate-500 shadow-neu-sm"
    );

  return (
    <div
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-[80vh] max-h-[680px] w-full max-w-lg flex-col neu-panel p-4 focus:outline-none sm:p-5"
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 id={titleId} className="font-bold text-slate-700">
            カードを選ぶ
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-xl leading-none text-slate-500 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        {/* キャラ選択。ゲーム内と同じ並び（レオニ→…→VS）で、1タップで絞れる。 */}
        <div className="shrink-0 space-y-1.5">
          {UNIT_ORDER.map((unit) => (
            <div key={unit} className="flex flex-wrap items-center gap-1">
              <span className="w-16 shrink-0 text-[10px] font-bold text-slate-400">
                {UNIT_SHORT[unit]}
              </span>
              {CHARACTERS.filter((c) => c.unit === unit).map((c) => (
                <button
                  key={c.ch}
                  type="button"
                  onClick={() => setCh(ch === c.ch ? null : c.ch)}
                  aria-pressed={ch === c.ch}
                  className={chip(ch === c.ch)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap gap-1">
          {(["4", "3", "birthday", "2", "1"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarity(rarity === r ? null : r)}
              aria-pressed={rarity === r}
              className={chip(rarity === r)}
            >
              {RARITY_LABEL[r]}
            </button>
          ))}
          {ATTR_ORDER.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAttr(attr === a ? null : a)}
              aria-pressed={attr === a}
              className={chip(attr === a)}
              style={attr === a ? undefined : { color: ATTR_COLOR[a] }}
            >
              {ATTR_LABEL[a]}
            </button>
          ))}
        </div>

        <NeuInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カード名・キャラ名で検索"
          className="mt-2 shrink-0"
        />

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">見つかりませんでした</p>
          ) : (
            results.map((c) => {
              const taken = used.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={taken}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
                    taken
                      ? "opacity-40"
                      : "hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)]"
                  )}
                >
                  <CardThumb card={c} size={40} />
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: ATTR_COLOR[c.attr] ?? "#888" }}
                  >
                    {RARITY_LABEL[c.rarity] ?? c.rarity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">{c.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {characterName(c.ch)}
                      {c.supportUnit && ` ・ ${UNIT_SHORT[c.supportUnit] ?? c.supportUnit}`}
                    </span>
                  </span>
                  {taken && <span className="shrink-0 text-xs text-slate-500">編成中</span>}
                </button>
              );
            })
          )}
        </div>
        <p className="mt-2 shrink-0 text-[11px] text-slate-400">
          {results.length >= 120 ? "上位120件を表示中。絞り込んでください。" : `${results.length}件`}
        </p>
      </div>
    </div>
  );
}
