import { describe, expect, it } from "vitest";
import { eventBonus, type BonusTables, type DeckCard } from "./eventBonus";

const EV = 212;

/** 実データの形に合わせた最小の表（開催中イベントの構造をそのまま写した）。 */
const tables: BonusTables = {
  unitCharacters: [
    { id: 1, ch: 1, unit: "light_sound" },
    { id: 2, ch: 2, unit: "light_sound" },
    { id: 21, ch: 21, unit: "piapro" }, // VS のキャラは複数ユニットに跨る
    { id: 22, ch: 21, unit: "light_sound" },
  ],
  deckBonuses: [
    // 実測の構造: 両方=50 / キャラ=25 / 属性=25
    { eventId: EV, unitCharacterId: 1, attr: "cute", rate: 50 },
    { eventId: EV, unitCharacterId: 2, attr: "cute", rate: 50 },
    { eventId: EV, unitCharacterId: 22, attr: "cute", rate: 50 },
    { eventId: EV, unitCharacterId: 1, rate: 25 },
    { eventId: EV, unitCharacterId: 2, rate: 25 },
    { eventId: EV, unitCharacterId: 22, rate: 25 },
    { eventId: EV, attr: "cute", rate: 25 },
    { eventId: 999, unitCharacterId: 1, rate: 999 }, // 別イベント（混ざらないこと）
  ],
  cardBonuses: [{ eventId: EV, cardId: 100, rate: 20, leaderRate: 10 }],
  rarityBonuses: [
    { rarity: "4", masterRank: 0, rate: 0 },
    { rarity: "4", masterRank: 5, rate: 25 },
  ],
  bonusLimits: [],
};

const card = (o: Partial<DeckCard> & { cardId: number }): DeckCard => ({
  characterId: 1,
  rarity: "4",
  attr: "cute",
  masterRank: 0,
  ...o,
});

describe("キャラ・属性の一致", () => {
  // ★★ ここが最重要。行を足すと 25+25+50=100 になり倍以上に膨らむ。
  //    「両方」の行は合算済みの値（実測: キャラ25 + 属性25 に対して両方=50）。
  it("キャラも属性も一致したら 50（25+25+50 の 100 にしない）", () => {
    const r = eventBonus([card({ cardId: 1 })], EV, tables);
    expect(r.perCard[0].deck).toBe(50);
    expect(r.total).toBe(50);
  });

  it("キャラだけ一致なら 25", () => {
    const r = eventBonus([card({ cardId: 1, attr: "cool" })], EV, tables);
    expect(r.perCard[0].deck).toBe(25);
  });

  it("属性だけ一致なら 25", () => {
    const r = eventBonus([card({ cardId: 1, characterId: 9 })], EV, tables);
    expect(r.perCard[0].deck).toBe(25);
  });

  it("どちらも一致しなければ 0", () => {
    const r = eventBonus([card({ cardId: 1, characterId: 9, attr: "cool" })], EV, tables);
    expect(r.perCard[0].deck).toBe(0);
  });

  // 実測: 207・211 は属性の行を持たない。無くても壊れないこと。
  it("属性の行が無いイベントでも壊れない", () => {
    const noAttr: BonusTables = {
      ...tables,
      deckBonuses: [{ eventId: EV, unitCharacterId: 1, rate: 25 }],
    };
    const r = eventBonus([card({ cardId: 1 })], EV, noAttr);
    expect(r.perCard[0].deck).toBe(25);
  });

  it("別のイベントの行が混ざらない", () => {
    const r = eventBonus([card({ cardId: 1 })], EV, tables);
    expect(r.perCard[0].deck).toBe(50);
  });
});

describe("ユニット限定カード", () => {
  // VS のキャラは複数ユニットに跨るので、どのユニット枠かでボーナスが変わる。
  it("supportUnit が対象ユニットなら一致する", () => {
    const r = eventBonus(
      [card({ cardId: 1, characterId: 21, supportUnit: "light_sound" })],
      EV,
      tables
    );
    expect(r.perCard[0].deck).toBe(50);
  });

  it("supportUnit が対象外なら属性だけ", () => {
    const r = eventBonus(
      [card({ cardId: 1, characterId: 21, supportUnit: "piapro" })],
      EV,
      tables
    );
    expect(r.perCard[0].deck).toBe(25);
  });
});

describe("マスターランクとカード個別", () => {
  it("マスターランクぶんが足される", () => {
    const r = eventBonus([card({ cardId: 1, masterRank: 5 })], EV, tables);
    expect(r.perCard[0].master).toBe(25);
    expect(r.perCard[0].total).toBe(75);
  });

  it("ピックアップぶんが足される", () => {
    const r = eventBonus([card({ cardId: 100 })], EV, tables);
    expect(r.perCard[0].card).toBe(20);
    expect(r.total).toBe(70);
  });

  // リーダー専用の上乗せは、そのカードがリーダーのときだけ。
  it("リーダーのときだけリーダー分が乗る", () => {
    const deck = [card({ cardId: 100 })];
    expect(eventBonus(deck, EV, tables, { leaderCardId: 100 }).perCard[0].card).toBe(30);
    expect(eventBonus(deck, EV, tables, { leaderCardId: 1 }).perCard[0].card).toBe(20);
  });
});

describe("対象人数の上限", () => {
  const limited: BonusTables = { ...tables, bonusLimits: [{ eventId: EV, memberCountLimit: 2 }] };
  const deck = [
    card({ cardId: 1, masterRank: 5 }), // 75
    card({ cardId: 2 }), // 50
    card({ cardId: 3 }), // 50
    card({ cardId: 4, characterId: 9, attr: "cool" }), // 0
  ];

  it("上限を超えたぶんは効かない", () => {
    const r = eventBonus(deck, EV, limited);
    expect(r.cappedOut).toBe(1);
    expect(r.total).toBe(125); // 75 + 50
  });

  it("残すのはプレイヤーに有利な側（大きい順）", () => {
    const r = eventBonus(deck, EV, limited);
    expect(r.total).toBeGreaterThan(100);
  });

  it("上限が無ければ全員効く", () => {
    expect(eventBonus(deck, EV, tables).total).toBe(175);
  });

  // 内訳は上限に関係なく全カード分見せる（なぜ切られたかが読めないと困る）。
  it("内訳は上限で切られたカードも含めて出す", () => {
    expect(eventBonus(deck, EV, limited).perCard).toHaveLength(4);
  });
});

describe("未入力の扱い", () => {
  // ★ 実際にやらかした事故の再発防止。マスターランクの記載が無い編成を 0 として
  //   計算し、5% ズレた原因を「データと実機の食い違い」だと疑って仮説を3つ立てた。
  //   実際はただの入力漏れ。0 と未入力を混同しないこと。
  it("マスターランク未入力のカードを報告する", () => {
    const r = eventBonus([card({ cardId: 1 }), card({ cardId: 2, masterRank: undefined })], EV, tables);
    expect(r.unsetMasterRank).toEqual([2]);
  });

  it("全部入力済みなら空", () => {
    const r = eventBonus([card({ cardId: 1, masterRank: 0 })], EV, tables);
    expect(r.unsetMasterRank).toEqual([]);
  });

  // 未入力は 0 として足すが、それを黙ってやらない（暫定値だと分かるようにする）。
  it("未入力でも計算は止めない（暫定値として出す）", () => {
    const r = eventBonus([card({ cardId: 1, masterRank: undefined })], EV, tables);
    expect(r.perCard[0].master).toBe(0);
    expect(r.total).toBe(50);
    expect(r.unsetMasterRank).toHaveLength(1);
  });

  // MR0 は「入力済みで0」。未入力と区別がつくこと。
  it("MR0 と未入力は別物", () => {
    const zero = eventBonus([card({ cardId: 1, masterRank: 0 })], EV, tables);
    const unset = eventBonus([card({ cardId: 1, masterRank: undefined })], EV, tables);
    expect(zero.total).toBe(unset.total);
    expect(zero.unsetMasterRank).toEqual([]);
    expect(unset.unsetMasterRank).toEqual([1]);
  });
});

describe("サポート編成（WL）", () => {
  // 20枚以上の編成を組ませるのは現実的でないので手入力で合算する。
  it("手入力ぶんが合計に足される", () => {
    const r = eventBonus([card({ cardId: 1 })], EV, tables, { supportBonus: 120 });
    expect(r.support).toBe(120);
    expect(r.total).toBe(170);
  });
});
