import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { cn } from "../../lib/utils";
import { ATTR_COLOR, ATTR_LABEL, RARITY_LABEL, UNIT_SHORT, characterName } from "./lib/characters";
import { isTrainable, maxLevelOf, type CatalogCard } from "./lib/deckInputs";
import type { CardState } from "./lib/deckStore";

/**
 * 編成の5枠。
 *
 * ★ 育成状態（Lv・特訓・マスターランク・前後編・キャンバス）は**カードに紐づく**もので、
 *   編成に紐づくものではない（deckStore.ts の設計）。ここでの編集は所持カード台帳を
 *   直接書き換える＝他の編成にも同時に反映される。それが現実に合っている。
 *
 * ★ マスターランクだけは既定値を置かず「未設定」を持つ。0 として黙って計算すると
 *   ボーナスが数％足りないまま、それらしい数字が出てしまう（docs/deck-builder.md）。
 */

const chip = (active: boolean, className?: string) =>
  cn(
    "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
    active ? "neu-selected" : "bg-neu text-slate-500 shadow-neu-sm",
    className
  );

function CardStateEditor({
  card,
  state,
  onChange,
}: {
  card: CatalogCard;
  state: CardState;
  onChange: (patch: Partial<CardState>) => void;
}) {
  const maxLevel = maxLevelOf(card);
  const trainable = isTrainable(card);

  return (
    <div className="mt-2 space-y-2 border-t border-[color:color-mix(in_srgb,var(--neu-ink)_10%,transparent)] pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Lv</span>
        <NeuInput
          inputMode="numeric"
          aria-label="レベル"
          value={String(state.level)}
          onChange={(e) => {
            const v = Number(e.target.value.replace(/[^0-9]/g, ""));
            // 上限はレアリティで決まる（★1=20 … ★4=60）。超えた入力は上限で止める。
            onChange({ level: Math.min(Math.max(v || 1, 1), maxLevel) });
          }}
          className="max-w-16 py-1 text-center text-sm"
        />
        <span className="text-xs text-slate-400">/ {maxLevel}</span>
        <button
          type="button"
          onClick={() => onChange({ level: maxLevel })}
          className={chip(false, "!text-[10px]")}
        >
          上限
        </button>

        {/* ★1・★2 は特訓しても加算が0なので、トグル自体を出さない（迷わせない）。 */}
        {trainable && (
          <button
            type="button"
            aria-pressed={state.trained}
            onClick={() => onChange({ trained: !state.trained })}
            className={chip(state.trained)}
          >
            特訓
          </button>
        )}
        <button
          type="button"
          aria-pressed={state.episodes.first}
          onClick={() => onChange({ episodes: { ...state.episodes, first: !state.episodes.first } })}
          className={chip(state.episodes.first)}
        >
          前編
        </button>
        <button
          type="button"
          aria-pressed={state.episodes.latter}
          onClick={() => onChange({ episodes: { ...state.episodes, latter: !state.episodes.latter } })}
          className={chip(state.episodes.latter)}
        >
          後編
        </button>
        <button
          type="button"
          aria-pressed={state.canvas}
          onClick={() => onChange({ canvas: !state.canvas })}
          className={chip(state.canvas)}
        >
          キャンバス
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-slate-500">MR</span>
        <button
          type="button"
          aria-pressed={state.masterRank == null}
          onClick={() => onChange({ masterRank: undefined })}
          className={chip(state.masterRank == null)}
        >
          未設定
        </button>
        {[0, 1, 2, 3, 4, 5].map((mr) => (
          <button
            key={mr}
            type="button"
            aria-pressed={state.masterRank === mr}
            onClick={() => onChange({ masterRank: mr })}
            className={chip(state.masterRank === mr)}
          >
            {mr}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DeckSlots({
  slots,
  states,
  leaderIndex,
  openIndex,
  onPick,
  onClear,
  onLeader,
  onToggleOpen,
  onStateChange,
}: {
  slots: (CatalogCard | null)[];
  states: Record<number, CardState>;
  leaderIndex: number;
  /** 育成状態の編集を開いている枠。null なら全部閉じている。 */
  openIndex: number | null;
  onPick: (index: number) => void;
  onClear: (index: number) => void;
  onLeader: (index: number) => void;
  onToggleOpen: (index: number) => void;
  onStateChange: (cardId: number, patch: Partial<CardState>) => void;
}) {
  return (
    <ul className="space-y-2">
      {slots.map((card, i) => {
        const state = card ? states[card.id] : undefined;
        return (
          <li key={i} className="neu-raised p-3">
            {!card ? (
              <button
                type="button"
                onClick={() => onPick(i)}
                className="flex w-full items-center gap-3 text-left text-sm text-slate-400"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neu text-lg shadow-neu-inset">
                  ＋
                </span>
                {i + 1}枠目：カードを選ぶ
              </button>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: ATTR_COLOR[card.attr] ?? "#888" }}
                    title={ATTR_LABEL[card.attr] ?? card.attr}
                  >
                    {RARITY_LABEL[card.rarity] ?? card.rarity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleOpen(i)}
                    aria-expanded={openIndex === i}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-bold text-slate-700">{card.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {characterName(card.ch)}
                      {card.supportUnit && ` ・ ${UNIT_SHORT[card.supportUnit] ?? card.supportUnit}`}
                      {state && ` ・ Lv${state.level}`}
                      {state?.trained && " 特訓"}
                      {/* ★ 未設定は隠さない。合計が暫定値であることが1目で分かるように。 */}
                      {state && (state.masterRank == null ? " ・ MR未設定" : ` ・ MR${state.masterRank}`)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLeader(i)}
                    aria-pressed={leaderIndex === i}
                    title="リーダーにする（イベントボーナスのリーダー上乗せが効く）"
                    className={chip(leaderIndex === i, "shrink-0")}
                  >
                    リーダー
                  </button>
                  <button
                    type="button"
                    onClick={() => onClear(i)}
                    aria-label={`${i + 1}枠目を外す`}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>

                {openIndex === i && state && (
                  <>
                    <CardStateEditor
                      card={card}
                      state={state}
                      onChange={(patch) => onStateChange(card.id, patch)}
                    />
                    <div className="mt-2 flex justify-end">
                      <NeuButton className="!px-3 !py-1 !text-xs" onClick={() => onPick(i)}>
                        別のカードに差し替え
                      </NeuButton>
                    </div>
                  </>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
