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
import { deckSkill, type DeckSkillResult, type SkillRow } from "./skill";
import type { CardStates } from "./deckStore";

export interface EvalContext {
  catalog: Map<number, CatalogCard>;
  states: CardStates;
  player: PlayerState;
  bonusTables: BonusTables;
  powerTables: PowerTables;
  skills: SkillRow[];
  /** スキルの一部はキャラクターランクで伸びるので、プレイヤー設定から渡す。 */
  characterRanks?: Record<number, number>;
  eventId: number | undefined;
  /**
   * 選んでいるイベントがワールドリンクか。
   * ★ ワールドリンクは**編成の属性の種類数**でボーナスが乗る（最大5種類で125%）。
   *   種別の判定は呼び出し側（DeckBuilder）で一度だけ行い、ここでは受け取るだけにする。
   */
  worldBloom?: boolean;
  /**
   * 選んでいるイベントの「発揮可能総合力」の上限（無いイベントでは undefined）。
   *
   * ★ **総合力の計算には使わない。スコアに渡すときだけ効く。**
   *   総合力の表示は実機と突き合わせた検算資産なので丸めない（PowerPanel の「実機との差」）。
   *   ここに持たせているのは、イベント行そのものを比較パネルや差し替えまで
   *   配り回さずに済ませるため。
   */
  powerLimit?: number;
}

export interface DeckEval {
  cards: CatalogCard[];
  bonus: EventBonusResult | null;
  power: DeckPowerResult;
  skill: DeckSkillResult;
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

  const power = deckPower(toPowerDeck(cards, ctx.states), ctx.player, ctx.powerTables);

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
            worldBloom: ctx.worldBloom,
          }),
    power,
    /**
     * ★ スキルの上乗せ（同ユニット◯人ごと等）は**編成で変わる**ので、
     *   カード単体では出せない。総合力の計算が出した「そのカードが名乗るユニット枠」
     *   （perCard.unit）をそのまま使う＝エリアアイテムやゲートと同じ判定になる。
     */
    skill: deckSkill(
      cards.map((c, i) => ({
        cardId: c.id,
        ch: c.ch,
        skillId: c.skillId,
        unit: power.perCard[i]?.unit ?? c.supportUnit ?? "piapro",
        level: ctx.states[c.id]?.skillLevel ?? 1,
      })),
      ctx.skills,
      { leaderCardId, characterRanks: ctx.characterRanks }
    ),
  };
}
