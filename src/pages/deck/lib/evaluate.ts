/**
 * 「保存された編成」→「イベントボーナスと総合力」。
 *
 * 画面の各パネルは自分が表示するぶんを自分で計算しているが、比較では**複数の編成を
 * まとめて**評価する必要がある。ここはその詰め替えを1箇所にまとめたもの。
 * 式は持たない（eventBonus / deckPower をそのまま呼ぶ）。
 */
import { eventBonus, type BonusTables, type EventBonusResult } from "./eventBonus";
import { deckPower, type DeckPowerResult, type PlayerState, type PowerTables } from "./power";
import { filledCards, toBonusDeck, toPowerDeck, type CatalogCard } from "./deckInputs";
import type { CardStates } from "./deckStore";

export interface EvalContext {
  catalog: Map<number, CatalogCard>;
  states: CardStates;
  player: PlayerState;
  bonusTables: BonusTables;
  powerTables: PowerTables;
  eventId: number | undefined;
}

export interface DeckEval {
  cards: CatalogCard[];
  bonus: EventBonusResult | null;
  power: DeckPowerResult;
}

export function evaluateDeck(
  cardIds: (number | null)[],
  leaderIndex: number,
  supportBonus: number,
  ctx: EvalContext
): DeckEval {
  const slots = cardIds.map((id) => (id == null ? null : (ctx.catalog.get(id) ?? null)));
  const cards = filledCards(slots);
  const leaderCardId = cardIds[leaderIndex] ?? undefined;

  return {
    cards,
    // ★ イベントが選ばれていないときは 0 を出さず null。「ボーナス0の編成」と
    //   「イベント未選択」を同じ見た目にしない。
    bonus:
      ctx.eventId == null
        ? null
        : eventBonus(toBonusDeck(cards, ctx.states), ctx.eventId, ctx.bonusTables, {
            leaderCardId,
            supportBonus,
          }),
    power: deckPower(toPowerDeck(cards, ctx.states), ctx.player, ctx.powerTables),
  };
}
