/**
 * 1枠差し替えのテスト。
 *
 * ★ 見たいのは「差が正しく出るか」と「**最終Pt で並ぶか**」。
 *   総合力だけで並べると、このツールの存在意義（ボーナスを落として総合力を取る判断）が
 *   そのまま消えるので、そこを固定する。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { swapCandidates } from "./swap";
import { toPlayerState, type PlayerSettings } from "./playerStore";
import type { EvalContext } from "./evaluate";
import type { CatalogCard } from "./deckInputs";
import type { CardStates } from "./deckStore";
import type { EfficiencyEntry } from "../../ranking/lib/efficiency";
import type { BonusTables } from "./eventBonus";
import type { SkillRow } from "./skill";

const DATA = path.join(process.cwd(), "public/CardDatas");
const read = (n: string) => JSON.parse(fs.readFileSync(path.join(DATA, n), "utf8"));
const cardsJson = read("cards.json") as { cards: CatalogCard[]; skills: SkillRow[] };
const bonuses = read("bonuses.json") as BonusTables & { events: { id: number }[] };
const power = read("power.json");

const catalog = new Map(cardsJson.cards.map((c) => [c.id, c]));
const card = (id: number) => {
  const c = catalog.get(id);
  if (!c) throw new Error(`card ${id} が無い`);
  return c;
};

const state = (level: number, mr: number, trained: boolean) => ({
  level,
  trained,
  masterRank: mr,
  skillLevel: 4,
  episodes: { first: true, latter: true },
  canvas: false,
});

/** 実測編成（レオニ5枚・クール染め）を土台にする。 */
const DECK = [900, 419, 579, 846, 1];
const states: CardStates = {
  900: state(60, 5, true),
  419: state(50, 5, true),
  579: state(50, 0, true),
  846: state(30, 5, false),
  1: state(20, 5, false),
  101: state(20, 5, false), // MEIKO（一歌と同じ強さ・ユニット枠だけ違う）
  471: state(60, 0, true), // レン★4
};

const player: PlayerSettings = {
  areaEffects: {
    units: { piapro: 11, light_sound: 15, idol: 9, street: 8, theme_park: 8, school_refusal: 8.5 },
    attrs: { cool: 8.5, pure: 8, mysterious: 8.5, happy: 9, cute: 8.5 },
    chars: Object.fromEntries(Array.from({ length: 26 }, (_, i) => [i + 1, 20])),
  },
  characterRanks: {},
  gateLevels: { light_sound: 2 },
  fixtures: {},
  honorBonus: 210,
};

const ctx: EvalContext = {
  catalog,
  states,
  player: toPlayerState(player),
  bonusTables: {
    deckBonuses: bonuses.deckBonuses,
    cardBonuses: bonuses.cardBonuses,
    rarityBonuses: bonuses.rarityBonuses,
    bonusLimits: bonuses.bonusLimits,
    unitCharacters: bonuses.unitCharacters,
  },
  powerTables: {
    cards: cardsJson.cards,
    masterBonuses: power.masterBonuses,
    episodes: power.episodes,
    canvasBonuses: power.canvasBonuses,
    characterRanks: power.characterRanks,
    gates: power.gates,
    unitCharacters: bonuses.unitCharacters,
  },
  skills: cardsJson.skills,
  eventId: bonuses.events[bonuses.events.length - 1].id,
};

const song: EfficiencyEntry = {
  musicId: "test",
  title: "テスト曲",
  difficulty: "master",
  playLevel: 32,
  noteCount: 1000,
  baseScore: 4,
  skillScoreSolo: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  baseScoreAuto: 3,
  skillScoreAuto: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  skillScoreMulti: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  feverScore: 1,
  musicTime: 100,
  eventRate: 100,
};
const cond = { live: "multi" as const, taki: 5, overheadSec: 20 };
const opts = { leaderIndex: 0, supportBonus: 0 };

describe("1枠差し替え", () => {
  it("いまの編成の値を基準として返す", () => {
    const { baseline } = swapCandidates(DECK, 4, [card(101)], ctx, opts);
    expect(baseline.power).toBeGreaterThan(200000);
    expect(baseline.pt).toBeNull(); // 曲を渡していないので出さない
  });

  it("差し替えたときの差が出る（ユニット枠が変わると総合力が落ちる）", () => {
    // 一歌(1) → MEIKO(101) は同じ強さで、レオニ枠が1つ減るぶんだけ総合力が落ちる。
    const { rows } = swapCandidates(DECK, 4, [card(101)], ctx, opts);
    expect(rows).toHaveLength(1);
    expect(rows[0].cardId).toBe(101);
    expect(rows[0].deltaPower).toBeLessThan(0);
  });

  it("いま入っているカード自身は候補にしない", () => {
    const { rows } = swapCandidates(DECK, 4, [card(1), card(101)], ctx, opts);
    expect(rows.map((r) => r.cardId)).toEqual([101]);
  });

  it("曲を渡すと最終Ptの差が出て、その順に並ぶ", () => {
    const { baseline, rows } = swapCandidates(DECK, 4, [card(101), card(471)], ctx, {
      ...opts,
      entry: song,
      cond,
    });
    expect(baseline.pt).toBeGreaterThan(0);
    expect(rows.every((r) => r.deltaPt != null)).toBe(true);
    // 降順に並んでいること。
    expect(rows[0].deltaPt!).toBeGreaterThanOrEqual(rows[1].deltaPt!);
  });

  it("曲が無いときは総合力の差で並ぶ", () => {
    const { rows } = swapCandidates(DECK, 4, [card(101), card(471)], ctx, opts);
    expect(rows[0].deltaPower).toBeGreaterThanOrEqual(rows[1].deltaPower);
    expect(rows.every((r) => r.deltaPt === null)).toBe(true);
  });

  it("★ ボーナスが下がっても最終Ptで勝つ候補を、ちゃんと上に置く", () => {
    // レン★4（Lv60）は一歌★1（Lv20）より総合力がずっと高い。
    // 一方でイベントボーナスは編成対象から外れて下がりうる。
    const { rows } = swapCandidates(DECK, 4, [card(471), card(101)], ctx, {
      ...opts,
      entry: song,
      cond,
    });
    const ren = rows.find((r) => r.cardId === 471)!;
    expect(ren.deltaPower).toBeGreaterThan(0);
    // 総合力が大きく上がる候補が先頭に来ていること（Pt でも勝つはず）。
    expect(rows[0].cardId).toBe(471);
  });
});
