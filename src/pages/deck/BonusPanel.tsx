import { useMemo } from "react";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { Stat } from "../refresh/Stat";
import {
  ATTR_COLOR,
  ATTR_LABEL,
  ATTR_ORDER,
  CHARACTERS,
  UNIT_ORDER,
  UNIT_SHORT,
  characterName,
} from "./lib/characters";
import { CUSTOM_EVENT_ID, type CustomEvent } from "./lib/customEvent";
import { cn } from "../../lib/utils";
import { displayBonus, sanitizeDecimal, type CatalogCard, type EventRow } from "./lib/deckInputs";
import type { EventBonusResult } from "./lib/eventBonus";

/**
 * イベントボーナスのパネル。
 *
 * ★ この値は**カードだけで決まる**（エリアアイテムもキャラランクも効かない）。
 *   つまり総合力と違って「まだ持っていない編成」でも正確に出せる。編成ビルダーで
 *   最初に価値が立つのがここなので、プレイヤー設定より上に置いている。
 *
 * ★ ゲーム内は合計だけ切り捨てて表示する（内部 156.5% → 表示 156%）。
 *   大きく出すのは実機と同じ切り捨て値、正確な値は脇に小さく添える。
 *   カードごとの値は小数のままで実機表示と一致する（docs/deck-builder.md の実測）。
 */
const chip = (active: boolean) =>
  cn(
    "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
    active ? "neu-selected" : "bg-neu text-slate-500 shadow-neu-sm"
  );

export function BonusPanel({
  cards,
  result,
  events,
  eventId,
  onEventId,
  supportBonus,
  onSupportBonus,
  custom,
  onCustom,
}: {
  cards: CatalogCard[];
  /** 計算はページ側で1回だけ行う（比較や編成プロフィールへの保存と同じ値を使うため）。 */
  result: EventBonusResult | null;
  events: EventRow[];
  eventId: number | undefined;
  onEventId: (id: number) => void;
  supportBonus: string;
  onSupportBonus: (v: string) => void;
  /** 「カスタム」を選んでいるときの条件。 */
  custom?: CustomEvent;
  onCustom?: (next: CustomEvent) => void;
}) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  /**
   * このイベントの「発揮可能総合力」の上限。**欄がある回だけ**。
   * ★ ワールドリンクなら一律、ではない（旧ワールドリンクには上限が無い）。
   *   type で判定せず、必ず powerLimit の有無で見ること。
   */
  const powerLimit = useMemo(
    () => events.find((e) => e.id === eventId)?.powerLimit,
    [events, eventId]
  );

  return (
    <Panel title="イベントボーナス">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="イベント" htmlFor="deck-event" hint="開催中のイベントを既定で選んでいます">
          <select
            id="deck-event"
            value={eventId ?? ""}
            onChange={(e) => onEventId(Number(e.target.value))}
            className="neu-inset w-full rounded-lg px-3 py-2 text-slate-700"
          >
            {/* ★ 「次がこのメンバー・このタイプだったら」を試せるように、
                自分で条件を置ける選択肢を先頭に出す。 */}
            <option value={CUSTOM_EVENT_ID}>カスタム（自分で決める）</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="サポート編成"
          htmlFor="deck-support"
          hint="ワールドリンクのサポート編成ぶん(%)。手入力です"
        >
          <NeuInput
            id="deck-support"
            inputMode="decimal"
            value={supportBonus}
            // 小数点は1つまで。"1.2.3" のような入力を通すと Number() が NaN になり、
            // 黙って 0% として計算される（打ち間違いが数字に出ない）。
            onChange={(e) => onSupportBonus(sanitizeDecimal(e.target.value))}
            className="max-w-28 text-center"
          />
        </Field>
      </div>

      {/* ★ 上限は「編成を組み終えてから気づく」と手戻りが大きいので、イベントを選んだ
          時点で知らせる。比較パネルを開かない人にも届かせたい。 */}
      {powerLimit != null && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          このイベントは<b>発揮できる総合力が {powerLimit.toLocaleString()} で頭打ち</b>です
          （ワールドリンク第3弾の仕様）。これを超えるぶんはスコアに乗らないので、
          超えている人は<b>総合力ではなくイベントボーナスとスキルを伸ばす</b>のが正解になります。
        </p>
      )}

      {/* カスタムのときだけ、対象メンバーとタイプを置かせる。 */}
      {eventId === CUSTOM_EVENT_ID && custom && onCustom && (
        <div className="mt-4 rounded-lg p-3 shadow-neu-inset">
          <p className="mb-2 text-xs text-slate-500">
            ボーナス対象のメンバーとタイプを選んでください。
            カード個別のピックアップぶんは載りません（誰が対象かは分からないため）。
          </p>

          <div className="space-y-1.5">
            {UNIT_ORDER.map((unit) => (
              <div key={unit} className="flex flex-wrap items-center gap-1">
                <span className="w-16 shrink-0 text-[10px] font-bold text-slate-400">
                  {UNIT_SHORT[unit]}
                </span>
                {CHARACTERS.filter((c) => c.unit === unit).map((c) => {
                  const on = custom.chars.includes(c.ch);
                  return (
                    <button
                      key={c.ch}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        onCustom({
                          ...custom,
                          chars: on
                            ? custom.chars.filter((x) => x !== c.ch)
                            : [...custom.chars, c.ch],
                        })
                      }
                      className={chip(on)}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="w-16 shrink-0 text-[10px] font-bold text-slate-400">タイプ</span>
            {ATTR_ORDER.map((a) => {
              const on = custom.attr === a;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  // もう一度押すと「タイプ指定なし」に戻る（属性行を持たないイベントもある）。
                  onClick={() => onCustom({ ...custom, attr: on ? undefined : a })}
                  className={chip(on)}
                  style={on ? undefined : { color: ATTR_COLOR[a] }}
                >
                  {ATTR_LABEL[a]}
                </button>
              );
            })}
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-slate-500">配分を変える</summary>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
              {(
                [
                  ["char", "メンバーのみ"],
                  ["attr", "タイプのみ"],
                  ["both", "両方"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1">
                  <span>{label}</span>
                  <NeuInput
                    inputMode="decimal"
                    aria-label={`${label}のボーナス`}
                    value={String(custom.rates[key])}
                    onChange={(e) =>
                      onCustom({
                        ...custom,
                        rates: { ...custom.rates, [key]: Number(sanitizeDecimal(e.target.value)) || 0 },
                      })
                    }
                    className="max-w-16 !py-1 text-center"
                  />
                  <span className="text-slate-400">%</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              既定は近年のイベントの標準（25 / 25 / 50）。「両方」は合算済みの値で、
              メンバーとタイプの両方が当たったカードにはこれだけが乗ります。
            </p>
          </details>
        </div>
      )}

      {!result ? (
        <p className="mt-4 text-sm text-slate-500">イベントを選ぶとボーナスを計算します。</p>
      ) : cards.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">カードを入れるとボーナスを計算します。</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="編成ボーナス"
              value={`${displayBonus(result.total)}%`}
              sub={
                // 切り捨てで消えた端数があるときだけ正確な値を添える（普段は静かに）。
                result.total !== displayBonus(result.total) ? `正確には ${result.total}%` : "ゲーム内表示と同じ"
              }
            />
            <Stat label="カード合計" value={`${result.total - result.support}%`} sub={`${cards.length}枚`} />
            <Stat label="サポート" value={`${result.support}%`} sub="手入力ぶん" />
          </div>

          <ul className="mt-4 space-y-1 text-sm">
            {result.perCard.map((c) => {
              const card = byId.get(c.cardId);
              return (
                // 内訳は幅を食うので、狭い画面では名前の下へ回す（横スクロールを作らない）。
                <li key={c.cardId} className="rounded-lg px-2 py-1.5 shadow-neu-inset">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-slate-600">
                      {card ? `${characterName(card.ch)}「${card.name}」` : `カード${c.cardId}`}
                    </span>
                    <span className="w-14 shrink-0 text-right font-bold tabular-nums text-slate-700">
                      {c.total}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {/* ★ 「MR ◯%」だと誤解される。この行はレアリティとマスターランクの
                        組み合わせで決まる値で、MR0 でも★4なら乗る。 */}
                    キャラ/属性 {c.deck}％ ・ レアリティ×MR {c.master}％
                    {c.card > 0 && ` ・ PU ${c.card}％`}
                  </div>
                </li>
              );
            })}
          </ul>

          {result.cappedOut > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              ⚠ このイベントは対象人数に上限があり、{result.cappedOut} 枚ぶんのボーナスが効いていません
              （効く側を残しています）。
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
