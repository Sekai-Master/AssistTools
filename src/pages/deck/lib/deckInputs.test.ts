/**
 * 詰め替えのテスト。
 *
 * ★ ここが狂うと画面は正常に見えたまま数字だけ狂う。特に
 *   「マスターランク未設定を 0 で埋める」「レベルを既定で 1 にする」は
 *   実測との突き合わせで実際にやらかした種類の事故（docs/deck-builder.md）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultEventId,
  displayBonus,
  filledCards,
  isTrainable,
  maxLevelOf,
  toBonusDeck,
  toPowerDeck,
  type CatalogCard,
  type EventRow,
} from "./deckInputs";
import { defaultCardState, type CardStates } from "./deckStore";

const cardsJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/CardDatas/cards.json"), "utf8")
) as { cards: CatalogCard[] };
const catalog = new Map(cardsJson.cards.map((c) => [c.id, c]));
const card = (id: number): CatalogCard => {
  const c = catalog.get(id);
  if (!c) throw new Error(`配信データに card ${id} が無い`);
  return c;
};

describe("カードの素性", () => {
  it("上限レベルがレアリティ通り（★1=20 / ★4=60）", () => {
    expect(maxLevelOf(card(1))).toBe(20); // 一歌「クールだけど友達想い」★1
    expect(maxLevelOf(card(471))).toBe(60); // レン「放課後のひととき」★4
  });

  it("★1は特訓の加算を持たない", () => {
    expect(isTrainable(card(1))).toBe(false);
    expect(isTrainable(card(471))).toBe(true);
  });
});

describe("イベントボーナスへの詰め替え", () => {
  const cards = [card(1), card(471)];

  it("未設定のマスターランクを 0 で埋めない", () => {
    const deck = toBonusDeck(cards, {});
    expect(deck.every((d) => d.masterRank === undefined)).toBe(true);
  });

  it("入力済みの値はそのまま渡す", () => {
    const states: CardStates = { 1: { ...defaultCardState(20, false), masterRank: 0 } };
    const deck = toBonusDeck(cards, states);
    // ★ 0 と undefined を取り違えないこと。0 は「入力された 0」。
    expect(deck[0].masterRank).toBe(0);
    expect(deck[1].masterRank).toBeUndefined();
  });

  it("ユニット限定カードの supportUnit を落とさない", () => {
    // レン「放課後のひととき」は light_sound 枠（docs の実測ケース）。
    expect(toBonusDeck([card(471)], {})[0].supportUnit).toBe("light_sound");
    // 持たないカードでは undefined ではなくキー自体を付けない（eventBonus 側の判定が素直になる）。
    expect("supportUnit" in toBonusDeck([card(1)], {})[0]).toBe(false);
  });
});

describe("総合力への詰め替え", () => {
  it("未登録のカードは上限レベル・前後編読了で仮置きする（Lv1に倒さない）", () => {
    const [d] = toPowerDeck([card(471)], {});
    expect(d).toMatchObject({
      cardId: 471,
      level: 60,
      trained: true,
      episodes: { first: true, latter: true },
      canvas: false,
    });
    expect(d.masterRank).toBeUndefined();
  });

  it("登録済みの育成状態を優先する", () => {
    const states: CardStates = {
      471: { level: 40, trained: false, masterRank: 2, episodes: { first: true, latter: false }, canvas: true },
    };
    expect(toPowerDeck([card(471)], states)[0]).toMatchObject({
      level: 40,
      trained: false,
      masterRank: 2,
      episodes: { first: true, latter: false },
      canvas: true,
    });
  });
});

describe("枠", () => {
  it("空き枠を落として順序を保つ", () => {
    expect(filledCards([card(1), null, card(471), null, null]).map((c) => c.id)).toEqual([1, 471]);
  });
});

describe("既定のイベント", () => {
  const rows: EventRow[] = [
    { id: 1, name: "古い", type: "marathon", unit: "none", startAt: 100, aggregateAt: 200 },
    { id: 2, name: "開催中", type: "marathon", unit: "none", startAt: 300, aggregateAt: 400 },
    { id: 3, name: "未開催", type: "marathon", unit: "none", startAt: 500, aggregateAt: 600 },
  ];

  it("開催中を選ぶ", () => {
    expect(defaultEventId(rows, 350)).toBe(2);
  });

  it("開催中が無ければ開始済みの最新（未開催は選ばない）", () => {
    expect(defaultEventId(rows, 450)).toBe(2);
  });

  it("1つも始まっていなければ undefined", () => {
    expect(defaultEventId(rows, 50)).toBeUndefined();
  });
});

describe("ボーナスの表示", () => {
  it("合計は切り捨て（ゲーム内表示に合わせる）", () => {
    expect(displayBonus(156.5)).toBe(156);
    expect(displayBonus(156)).toBe(156);
  });
});
