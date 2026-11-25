/**
 * evaluateDeck の詰め替えのうち、スキルの面（ブルームフェスの特訓前／特訓後）が
 * 計算まで届いているかを配信データの実物で見る。
 *
 * ★ 比較（compare）・差し替え（swap）・編成プロフィール（deckProfiles）はどれも
 *   evaluateDeck を通るので、ここで押さえれば取りこぼしの経路が残らない。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateDeck, type EvalContext } from "./evaluate";
import { defaultCardState, type CardStates } from "./deckStore";
import type { CatalogCard } from "./deckInputs";
import type { BonusTables } from "./eventBonus";
import type { PowerTables } from "./power";
import type { SkillRow } from "./skill";

const DATA = path.join(process.cwd(), "public/CardDatas");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const cards = read("cards.json") as { cards: CatalogCard[]; skills: SkillRow[] };
const power = read("power.json");
const bonuses = read("bonuses.json");

const catalog = new Map(cards.cards.map((c) => [c.id, c]));
const BLOOM = 949; // ★4・特訓前スキル 23・特訓後スキル 22
const CH = catalog.get(BLOOM)!.ch;

const ctx = (states: CardStates, characterRanks?: Record<number, number>): EvalContext => ({
  catalog,
  states,
  player: { characterRanks: {}, gateLevels: {}, fixtureRates: {}, honorBonus: 0 },
  bonusTables: bonuses as BonusTables,
  powerTables: {
    cards: cards.cards,
    masterBonuses: power.masterBonuses,
    episodes: power.episodes,
    canvasBonuses: power.canvasBonuses,
    characterRanks: power.characterRanks,
    gates: power.gates,
    unitCharacters: bonuses.unitCharacters,
  } as PowerTables,
  skills: cards.skills,
  characterRanks,
  eventId: undefined,
});

const skillOf = (states: CardStates, ranks?: Record<number, number>) =>
  evaluateDeck([BLOOM, null, null, null, null], 0, 0, ctx(states, ranks)).skill.perCard[0];

describe("スキルの面が evaluateDeck まで届く", () => {
  const base = { ...defaultCardState(60, true), skillLevel: 4 };

  it("既定（特訓前の面）は skill 23 の素の値（SL4 = 80）", () => {
    expect(skillOf({ [BLOOM]: base }).value).toBe(80);
  });

  it("特訓後の面を選ぶと skill 22（SL4・ランク60 → 140）", () => {
    expect(skillOf({ [BLOOM]: { ...base, skillSide: "trained" } }, { [CH]: 60 }).value).toBe(140);
  });

  it("特訓後の面でランク未入力なら 110 と未入力の印", () => {
    const r = skillOf({ [BLOOM]: { ...base, skillSide: "trained" } });
    expect(r.value).toBe(110);
    expect(r.rankMissing).toBe(true);
  });

  it("特訓していなければ、特訓後の面を選んでいても特訓前のスキル", () => {
    const s = { ...base, level: 50, trained: false, skillSide: "trained" as const };
    expect(skillOf({ [BLOOM]: s }, { [CH]: 60 }).value).toBe(80);
  });
});
