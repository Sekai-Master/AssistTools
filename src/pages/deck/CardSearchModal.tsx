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
  others = [],
  sameCharacterOnly = false,
  swap,
}: {
  cards: CatalogCard[];
  onSelect: (card: CatalogCard) => void;
  onClose: () => void;
  /**
   * **いま選び直している枠を除く**、他の枠に入っているカード。
   * ★ ゲームの編成は**同じキャラを2枚入れられない**（同じカードはもちろん、
   *   ミクのレオニ枠とVS枠のような別カードでも不可）。組めない編成の数字を
   *   出しても意味が無いので、ここで選べなくする。
   */
  others?: CatalogCard[];
  /**
   * 「この枠を替えたらどう動くか」。差し替えの候補と差分を出すために使う。
   * ★ 渡されたときだけ「持っているカード」の絞り込みが出る。
   */
  swap?: {
    /** 候補（台帳にあるカード）と、いまの編成に対する差。 */
    rows: Map<number, { deltaPower: number; deltaBonus: number; deltaPt: number | null }>;
    /** 候補の並び（Pt差・無ければ総合力差の降順）。 */
    order: number[];
  };
  /**
   * チャレンジライブの編成。
   * ★ 条件が**逆**になる: 同じキャラのカードだけで5枚組む（他のキャラは選べない）。
   *   同じカードを2枚は、こちらでも不可。
   */
  sameCharacterOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [ch, setCh] = useState<number | null>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [attr, setAttr] = useState<string | null>(null);
  /**
   * ★ 「持っているカード」＝育成状態を登録したことがあるカード。
   *   総当たりの代わりに、**入力ゼロで回せる範囲の差し替え候補**を出すための絞り込み
   *  （lib/swap.ts の冒頭に理由）。
   * ★ 既定はオフ（Nori 指示 2026-08-02）。台帳は使ううちに育つもので、最初から
   *   絞った状態だと「カードが少ししか出てこない」画面に見える。
   */
  const [ownedOnly, setOwnedOnly] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  const usedChars = useMemo(() => new Set(others.map((c) => c.ch)), [others]);
  /** チャレンジライブでは、すでに枠に入っているキャラに揃える必要がある。 */
  const requiredCh = sameCharacterOnly ? others[0]?.ch : undefined;
  const usedIds = useMemo(() => new Set(others.map((c) => c.id)), [others]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = cards.filter((c) => {
      if (ownedOnly && swap && !swap.rows.has(c.id)) return false;
      if (ch != null && c.ch !== ch) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (attr && c.attr !== attr) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || characterName(c.ch).includes(q);
    });

    // ★ 候補モードのときは**効く順**（最終Pt差・無ければ総合力差）に並べる。
    //   ここが id 順のままだと、差し替えの判断に一番効く情報が埋もれる。
    if (ownedOnly && swap) {
      const rank = new Map(swap.order.map((id, i) => [id, i]));
      return [...hit].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)).slice(0, 120);
    }
    // 新しいカードほど上（id は追加順）。目当てのカードはたいてい最近のもの。
    return [...hit].sort((a, b) => b.id - a.id).slice(0, 120);
  }, [cards, query, ch, rarity, attr, ownedOnly, swap]);

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
        {/* ★ VS は6人。1行に収めたいので、この段だけ文字と余白を詰める
            （2行に折り返すと他のユニットと段組みが揃わず、読み取りにくい）。 */}
        <div className="shrink-0 space-y-1">
          {UNIT_ORDER.map((unit) => (
            <div key={unit} className="flex items-center gap-1">
              <span className="w-14 shrink-0 whitespace-nowrap text-[9px] font-bold text-slate-400">
                {UNIT_SHORT[unit]}
              </span>
              <span className="flex min-w-0 flex-1 gap-1">
                {CHARACTERS.filter((c) => c.unit === unit).map((c) => (
                  <button
                    key={c.ch}
                    type="button"
                    onClick={() => setCh(ch === c.ch ? null : c.ch)}
                    aria-pressed={ch === c.ch}
                    className={cn(chip(ch === c.ch), "min-w-0 flex-1 truncate !px-1 !text-[10px]")}
                  >
                    {c.name}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>

        {/* ★ レアリティと属性は別の軸なので行を分ける（混ざっていると、どちらの
            絞り込みなのか一目で分からない）。Birthday は★の並びに挟まないで最後に置く。 */}
        <div className="mt-2 flex shrink-0 items-center gap-1">
          <span className="w-14 shrink-0 whitespace-nowrap text-[9px] font-bold text-slate-400">レア</span>
          {(["4", "3", "2", "1", "birthday"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarity(rarity === r ? null : r)}
              aria-pressed={rarity === r}
              className={cn(chip(rarity === r), "!px-2 !text-[11px]")}
            >
              {RARITY_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="mt-1 flex shrink-0 items-center gap-1">
          <span className="w-14 shrink-0 whitespace-nowrap text-[9px] font-bold text-slate-400">タイプ</span>
          {ATTR_ORDER.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAttr(attr === a ? null : a)}
              aria-pressed={attr === a}
              className={cn(chip(attr === a), "min-w-0 flex-1 truncate !px-1 !text-[10px]")}
              style={attr === a ? undefined : { color: ATTR_COLOR[a] }}
            >
              {ATTR_LABEL[a]}
            </button>
          ))}
        </div>

        {swap && (
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={ownedOnly}
              onClick={() => setOwnedOnly((v) => !v)}
              className={chip(ownedOnly)}
            >
              持っているカードだけ
            </button>
            <span className="text-[11px] text-slate-400">
              {ownedOnly ? "効く順（この枠を替えたときの差）に並べています" : "全カードから探します"}
            </span>
          </div>
        )}

        <NeuInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カード名・キャラ名で検索"
          className="mt-2 shrink-0"
        />

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">
              {ownedOnly && swap
                ? // 台帳は「編成に入れたことがあるカード」なので、最初は候補が少ない。
                  //  そのことを言わないと「壊れている」と読まれる。
                  "この枠に入れられる手持ちのカードがありません。絞り込みを外すと全カードから選べます。"
                : "見つかりませんでした"}
            </p>
          ) : (
            results.map((c) => {
              // イベント編成は「同キャラ不可」、チャレンジライブは「同キャラ限定」。
              const taken = sameCharacterOnly
                ? usedIds.has(c.id) || (requiredCh != null && c.ch !== requiredCh)
                : usedChars.has(c.ch);
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
                  {/* ★ この枠を替えたらどう動くか。**最終Ptの差が判断の本命**なので、
                      出せるときはそれを主に出す（総合力だけだと、ボーナスを落として
                      総合力を取る判断がそのまま消える）。 */}
                  {!taken &&
                    ownedOnly &&
                    (() => {
                      const d = swap?.rows.get(c.id);
                      if (!d) return null;
                      const sign = (v: number) => (v > 0 ? "+" : "");
                      const good = (d.deltaPt ?? d.deltaPower) > 0;
                      return (
                        <span className="shrink-0 text-right text-[11px] leading-tight">
                          <span className={cn("block font-bold", good ? "text-emerald-600" : "text-slate-400")}>
                            {d.deltaPt != null
                              ? `${sign(d.deltaPt)}${Math.round(d.deltaPt).toLocaleString()}pt`
                              : `${sign(d.deltaPower)}${Math.round(d.deltaPower).toLocaleString()}`}
                          </span>
                          {/* 最終Pt を出せているときだけ、その内訳として総合力も添える
                              （出せないときは上の行が総合力なので繰り返さない）。 */}
                          <span className="block text-slate-400">
                            {d.deltaPt != null &&
                              `${sign(d.deltaPower)}${Math.round(d.deltaPower).toLocaleString()} / `}
                            {sign(d.deltaBonus)}
                            {Math.round(d.deltaBonus * 10) / 10}%
                          </span>
                        </span>
                      );
                    })()}
                  {/* 同じカードでなくても入れられないので、「編成中」だけだと誤解される。 */}
                  {taken && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {usedIds.has(c.id)
                        ? "編成中"
                        : sameCharacterOnly
                          ? "別のキャラ"
                          : "同キャラ編成中"}
                    </span>
                  )}
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
