import { useMemo } from "react";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { Stat } from "../refresh/Stat";
import { characterName } from "./lib/characters";
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
export function BonusPanel({
  cards,
  result,
  events,
  eventId,
  onEventId,
  supportBonus,
  onSupportBonus,
}: {
  cards: CatalogCard[];
  /** 計算はページ側で1回だけ行う（比較や編成プロフィールへの保存と同じ値を使うため）。 */
  result: EventBonusResult | null;
  events: EventRow[];
  eventId: number | undefined;
  onEventId: (id: number) => void;
  supportBonus: string;
  onSupportBonus: (v: string) => void;
}) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

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
                    キャラ/属性 {c.deck}％ ・ MR {c.master}％{c.card > 0 && ` ・ PU ${c.card}％`}
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
