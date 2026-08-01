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
  applyTrained,
  defaultEventId,
  displayBonus,
  filledCards,
  isTrainable,
  levelCapOf,
  maxLevelOf,
  sanitizeDecimal,
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

describe("特訓と上限レベル", () => {
  it("特訓前は上限が10低い（★3=40 / ★4=50）", () => {
    expect(levelCapOf(card(471), true)).toBe(60); // ★4 特訓後
    expect(levelCapOf(card(471), false)).toBe(50); // ★4 特訓前
    const r3 = catalog.get(419)!; // ★3
    expect(r3.rarity).toBe("3");
    expect(levelCapOf(r3, true)).toBe(50);
    expect(levelCapOf(r3, false)).toBe(40);
  });

  it("特訓の無いカード（★1・★2・birthday）は変わらない", () => {
    expect(levelCapOf(card(1), false)).toBe(20);
    const bd = cardsJson.cards.find((c) => c.rarity === "birthday")!;
    expect(levelCapOf(bd, false)).toBe(maxLevelOf(bd));
  });

  it("特訓を外すと、上限を超えたレベルと後編の読了が連れて戻る", () => {
    const state = { ...defaultCardState(60, true), level: 60 };
    const off = applyTrained(state, card(471), false);
    expect(off.level).toBe(50);
    // ★ 後編は特訓後にしか読めない。読了のまま残すと1編成で1万以上ずれる。
    expect(off.episodes.latter).toBe(false);
    expect(off.episodes.first).toBe(true);
  });

  it("特訓を付け直しても、後編は勝手に読了にしない", () => {
    const off = applyTrained({ ...defaultCardState(60, true), level: 60 }, card(471), false);
    const on = applyTrained(off, card(471), true);
    expect(on.trained).toBe(true);
    expect(on.level).toBe(50); // 下げたレベルは戻さない（本人が上げる）
    expect(on.episodes.latter).toBe(false);
  });

  it("上限より低いレベルは触らない", () => {
    const s = { ...defaultCardState(60, true), level: 30 };
    expect(applyTrained(s, card(471), false).level).toBe(30);
  });
});

describe("イベントボーナスへの詰め替え", () => {
  const cards = [card(1), card(471)];

  it("台帳にまだ無いカードも 0 として渡す（未設定という状態を持たない）", () => {
    const deck = toBonusDeck(cards, {});
    expect(deck.every((d) => d.masterRank === 0)).toBe(true);
  });

  it("入力済みの値はそのまま渡す", () => {
    const states: CardStates = { 1: { ...defaultCardState(20, false), masterRank: 3 } };
    const deck = toBonusDeck(cards, states);
    expect(deck[0].masterRank).toBe(3);
    expect(deck[1].masterRank).toBe(0);
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
    expect(d.masterRank).toBe(0);
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

describe("数値入力のサニタイズ", () => {
  it("数字と小数点1つだけ残す（NaN を作らない）", () => {
    expect(sanitizeDecimal("8.5")).toBe("8.5");
    expect(sanitizeDecimal("1.2.3")).toBe("1.23");
    expect(sanitizeDecimal("１２abc3%")).toBe("3");
    expect(sanitizeDecimal(".")).toBe(".");
    // 打ち途中の "8." を弾かない（弾くと小数が打てない）。
    expect(Number.isNaN(Number(sanitizeDecimal("1.2.3")))).toBe(false);
  });
});

describe("ボーナスの表示", () => {
  it("合計は切り捨て（ゲーム内表示に合わせる）", () => {
    expect(displayBonus(156.5)).toBe(156);
    expect(displayBonus(156)).toBe(156);
  });
});
