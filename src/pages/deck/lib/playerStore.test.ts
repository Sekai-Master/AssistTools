/**
 * @vitest-environment jsdom
 *
 * ★ ここは**画面の入力から実機の総合力が出るか**を見るテスト。
 *   power.real.test.ts は計算モジュールを実測と突き合わせているが、その手前の
 *   「画面が持っている形 → PlayerState」の変換で取りこぼすと、計算が正しくても
 *   画面の数字は狂う。measurements.json（Nori の実機の数字＝正解）を
 *   **画面と同じ経路で**通して、最後まで一致することを固定する。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_PLAYER,
  fixtureRatesOf,
  parsePlayerSettings,
  readPlayerSettings,
  toPlayerState,
  writePlayerSettings,
  type PlayerSettings,
} from "./playerStore";
import { deckPower, type DeckPowerCard, type PowerTables } from "./power";
import measurements from "./measurements.json";

const DATA = path.join(process.cwd(), "public/CardDatas");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const cards = read("cards.json");
const power = read("power.json");
const bonuses = read("bonuses.json");

const tables: PowerTables = {
  cards: cards.cards,
  masterBonuses: power.masterBonuses,
  episodes: power.episodes,
  canvasBonuses: power.canvasBonuses,
  characterRanks: power.characterRanks,
  gates: power.gates,
  unitCharacters: bonuses.unitCharacters,
};

const numKeys = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k), v]));

// measurements.json は人が読む前提のファイルで、各所に説明用の "_" キーが入っている。
// 画面が保存する形には無いので、ここで落としてから使う。
const { _: _areaNote, ...areaEffects } = measurements.player.areaEffects;

/** 実機の設定を「画面が保存している形」で書き直したもの。 */
const settings: PlayerSettings = {
  areaEffects,
  characterRanks: numKeys(measurements.player.characterRanks),
  gateLevels: measurements.player.gateLevels,
  // 実測4件目は「咲希(ch2)のぬいぐるみ/S を1個」。率ではなく個数で持つ。
  fixtures: { 2: { S: 1, M: 0, L: 0 } },
  honorBonus: measurements.player.honorBonus,
};

beforeEach(() => localStorage.clear());

describe("家具の個数 → 率", () => {
  it("S=0.1% / M=0.3% / L=0.6%（マスタの 1/3/6 は 0.1% 単位）", () => {
    expect(fixtureRatesOf({ 2: { S: 1, M: 0, L: 0 } })).toEqual({ 2: 0.1 });
    expect(fixtureRatesOf({ 2: { S: 0, M: 1, L: 1 } })).toEqual({ 2: 0.9 });
  });

  it("0個のキャラは行ごと出さない（未設定と 0% を区別する必要が無い）", () => {
    expect(fixtureRatesOf({ 2: { S: 0, M: 0, L: 0 } })).toEqual({});
  });

  it("浮動小数の誤差を持ち込まない", () => {
    expect(fixtureRatesOf({ 1: { S: 3, M: 0, L: 0 } })[1]).toBe(0.3);
  });
});

describe("保存", () => {
  it("往復して同じものが返る", () => {
    writePlayerSettings(settings);
    expect(readPlayerSettings()).toEqual(settings);
  });

  it("壊れた値・範囲外は落として既定に倒す", () => {
    const parsed = parsePlayerSettings({
      areaEffects: { units: { light_sound: 15, bad: "x" }, attrs: { cool: 999 }, chars: { 1: 30, a: 5 } },
      characterRanks: { 1: 58, 2: -1 },
      gateLevels: { light_sound: 2, idol: 99 },
      fixtures: { 2: { S: 1, M: "x", L: null }, x: { S: 1 } },
      honorBonus: -3,
    });
    expect(parsed.areaEffects.units).toEqual({ light_sound: 15 });
    expect(parsed.areaEffects.attrs).toEqual({});
    expect(parsed.areaEffects.chars).toEqual({ 1: 30 });
    expect(parsed.characterRanks).toEqual({ 1: 58 });
    expect(parsed.gateLevels).toEqual({ light_sound: 2 });
    expect(parsed.fixtures).toEqual({ 2: { S: 1, M: 0, L: 0 } });
    expect(parsed.honorBonus).toBe(0);
  });

  it("壊れた JSON でも落ちない", () => {
    localStorage.setItem("sekaimaster:deck:player:v1", "{oops");
    expect(readPlayerSettings()).toEqual(EMPTY_PLAYER);
  });
});

/**
 * ★★ 画面の経路で実機の数字が出ることの確認。★★
 * ここが緑なら「保存 → 変換 → 計算」の全経路が実機と一致している。
 */
describe("実機との突き合わせ（保存形式からの通し）", () => {
  const deckOf = (i: number) => measurements.cases[i].deck as DeckPowerCard[];

  it("レオニ5枚・クール染め = 236,756", () => {
    const r = deckPower(deckOf(1), toPlayerState({ ...settings, fixtures: {} }), tables);
    expect(r.total).toBe(236756);
    expect(r.performance).toBe(129838);
    expect(r.areaItem).toBe(99968);
    expect(r.characterRank).toBe(6483);
    expect(r.gate).toBe(257);
    expect(r.missing).toEqual([]);
  });

  it("一歌 → MEIKO（純ピアプロ）= 215,593", () => {
    const r = deckPower(deckOf(2), toPlayerState({ ...settings, fixtures: {} }), tables);
    expect(r.total).toBe(215593);
  });

  it("咲希のぬいぐるみ/S を1個置くと 215,612（家具 +19）", () => {
    const r = deckPower(deckOf(3), toPlayerState(settings), tables);
    expect(r.fixture).toBe(19);
    expect(r.total).toBe(215612);
  });

  it("設定が空でもパフォーマンスだけは出る（未入力で落ちない）", () => {
    const r = deckPower(deckOf(1), toPlayerState(EMPTY_PLAYER), tables);
    expect(r.performance).toBe(129838);
    expect(r.total).toBe(129838);
  });
});
