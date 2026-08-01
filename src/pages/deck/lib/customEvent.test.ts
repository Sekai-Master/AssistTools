/**
 * カスタムイベントのテスト。
 *
 * ★ 実在のイベントと同じ経路（eventBonus）に流すので、**式は共通のまま**であることと、
 *   「両方一致は合算済みの1行だけを採る」がカスタムでも壊れないことを見る。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_EVENT_ID,
  customBonusTables,
  customDeckBonuses,
  emptyCustomEvent,
  parseCustomEvent,
} from "./customEvent";
import { eventBonus, type BonusTables, type DeckCard } from "./eventBonus";

const bonuses = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/CardDatas/bonuses.json"), "utf8")
) as BonusTables;

const base: BonusTables = {
  deckBonuses: bonuses.deckBonuses,
  cardBonuses: bonuses.cardBonuses,
  rarityBonuses: bonuses.rarityBonuses,
  bonusLimits: bonuses.bonusLimits,
  unitCharacters: bonuses.unitCharacters,
};

const card = (cardId: number, ch: number, attr: string, supportUnit?: string): DeckCard => ({
  cardId,
  characterId: ch,
  rarity: "4",
  attr,
  masterRank: 0,
  ...(supportUnit ? { supportUnit } : {}),
});

const custom = (chars: number[], attr?: string) => ({ ...emptyCustomEvent(), chars, attr });

describe("カスタムの行", () => {
  it("対象メンバー×タイプの3種（キャラ・タイプ・両方）を作る", () => {
    const rows = customDeckBonuses(custom([1], "cool"), base.unitCharacters);
    // 一歌はレオニ1枠だけなので、キャラ行と両方行が1つずつ＋タイプ行。
    expect(rows.filter((r) => r.unitCharacterId != null && r.attr == null)).toHaveLength(1);
    expect(rows.filter((r) => r.unitCharacterId != null && r.attr === "cool")).toHaveLength(1);
    expect(rows.filter((r) => r.unitCharacterId == null && r.attr === "cool")).toHaveLength(1);
  });

  it("VS のキャラは全ユニット枠ぶん行を作る（どの枠で編成しても効く）", () => {
    const rows = customDeckBonuses(custom([21]), base.unitCharacters);
    expect(rows).toHaveLength(6);
  });

  it("タイプ未指定なら属性の行を作らない", () => {
    const rows = customDeckBonuses(custom([1]), base.unitCharacters);
    expect(rows.every((r) => r.attr == null)).toBe(true);
  });
});

describe("計算に流したとき", () => {
  const tables = (chars: number[], attr?: string) => customBonusTables(custom(chars, attr), base);

  it("両方一致は合算済みの50%（25+25+50 にならない）", () => {
    const r = eventBonus([card(1, 1, "cool")], CUSTOM_EVENT_ID, tables([1], "cool"));
    expect(r.perCard[0].deck).toBe(50);
  });

  it("キャラだけ・タイプだけの一致はそれぞれ25%", () => {
    expect(eventBonus([card(1, 1, "pure")], CUSTOM_EVENT_ID, tables([1], "cool")).perCard[0].deck).toBe(25);
    expect(eventBonus([card(1, 5, "cool")], CUSTOM_EVENT_ID, tables([1], "cool")).perCard[0].deck).toBe(25);
  });

  it("どちらも外れれば0%", () => {
    expect(eventBonus([card(1, 5, "pure")], CUSTOM_EVENT_ID, tables([1], "cool")).perCard[0].deck).toBe(0);
  });

  it("ユニット限定カード（VSのキャラ）でも効く", () => {
    // ミクのレオニ枠カード。unitCharacterId が枠ごとに違っても拾えること。
    const r = eventBonus([card(9, 21, "cool", "light_sound")], CUSTOM_EVENT_ID, tables([21], "cool"));
    expect(r.perCard[0].deck).toBe(50);
  });

  it("レアリティ×マスターランクぶんは実在イベントと同じ表を使う", () => {
    const r = eventBonus([{ ...card(1, 1, "cool"), masterRank: 5 }], CUSTOM_EVENT_ID, tables([1], "cool"));
    expect(r.perCard[0].master).toBeGreaterThan(0);
  });

  it("カード個別（PU）は載せない（誰がPUかは決めようがない）", () => {
    const r = eventBonus([card(1, 1, "cool")], CUSTOM_EVENT_ID, tables([1], "cool"));
    expect(r.perCard[0].card).toBe(0);
  });

  it("率を変えたらそのまま効く", () => {
    const c = { ...custom([1], "cool"), rates: { char: 30, attr: 30, both: 60 } };
    const r = eventBonus([card(1, 1, "cool")], CUSTOM_EVENT_ID, customBonusTables(c, base));
    expect(r.perCard[0].deck).toBe(60);
  });
});

describe("保存の検証", () => {
  it("壊れた値は既定に倒す", () => {
    const c = parseCustomEvent({ chars: [1, "x", 999, 1], attr: 5, rates: { char: -1 } });
    expect(c?.chars).toEqual([1]);
    expect(c?.attr).toBeUndefined();
    expect(c?.rates).toEqual({ char: 25, attr: 25, both: 50 });
  });

  it("オブジェクトでなければ undefined", () => {
    expect(parseCustomEvent(null)).toBeUndefined();
    expect(parseCustomEvent("x")).toBeUndefined();
  });
});
