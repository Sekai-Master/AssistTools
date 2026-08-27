/**
 * @vitest-environment jsdom
 *
 * 編成ビルダーの編成 → 全ツール共通のプロフィール。
 *
 * ★ 計算そのもの（evaluateDeck）はここでは確かめない。画面と同じ関数を呼んでいる
 *   ことが構造で保証されているので、ここで見るのは**取りこぼしの経路**
 *   ——「取り込んだのに呼べない編成をどう数えるか」「勝手に使用中を切り替えないか」
 *   「育成状態の既定値をどこで埋めるか」の3つ。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProfile,
  getActiveId,
  getProfiles,
  resetProfilesForTest,
  setActiveProfile,
} from "../../../lib/profiles";
import {
  deckProfileValues,
  decksWithoutProfile,
  profileValuesFromEval,
  syncDecksToProfiles,
  withDefaultStates,
  type DeckEvalBase,
} from "./deckProfiles";
import type { CardStates, SavedDeck } from "./deckStore";
import type { CatalogCard } from "./deckInputs";
import type { DeckEval } from "./evaluate";

beforeEach(() => {
  resetProfilesForTest();
});

const deck = (name: string, cardIds: (number | null)[] = [1, null, null, null, null]): SavedDeck => ({
  name,
  savedAt: 0,
  cardIds,
  leaderIndex: 0,
  supportBonus: 0,
});

/** 既定値の算出（maxLevelOf/isTrainable）が触るぶんだけ持たせた最小のカード。 */
const card = (id: number): CatalogCard =>
  ({
    id,
    rarity: "4",
    ch: 1,
    attr: "cute",
    skillId: 1,
    name: `card${id}`,
    // power[0] の長さが上限レベル、trained があれば特訓可。
    power: [new Array(60).fill(1000), new Array(60).fill(1000), new Array(60).fill(1000)],
    trained: [0, 0, 0],
  }) as unknown as CatalogCard;

describe("withDefaultStates — 育成状態の既定値", () => {
  it("状態が無いカードだけ埋める", () => {
    const catalog = new Map([[1, card(1)], [2, card(2)]]);
    const states: CardStates = { 1: { level: 50 } as CardStates[number] };
    const next = withDefaultStates([1, 2, null], catalog, states);
    expect(next[1]).toBe(states[1]); // 既にある状態は触らない
    expect(next[2]).toBeDefined();
  });

  it("埋めるものが無ければ同じ参照を返す（無駄な書き込みをしない）", () => {
    const catalog = new Map([[1, card(1)]]);
    const states: CardStates = { 1: { level: 50 } as CardStates[number] };
    expect(withDefaultStates([1, null], catalog, states)).toBe(states);
  });

  it("カタログに無いカードは埋めない（壊れたデータで既定値を作らない）", () => {
    const next = withDefaultStates([99], new Map(), {});
    expect(Object.keys(next)).toHaveLength(0);
  });
});

describe("decksWithoutProfile — 呼べない編成の数え方", () => {
  it("同名でも source が違えば「呼べる」と見なさない", () => {
    // 手入力のプロフィールは編成ビルダーの値で潰さない仕様（upsertProfileByName）なので、
    // 同名の手入力があっても、その編成はまだツールから呼べない扱いになる。
    createProfile("WL用", { power: 300_000 });
    expect(decksWithoutProfile([deck("WL用")], getProfiles())).toHaveLength(1);
  });

  it("編成ビルダー由来の同名があれば呼べる扱い", () => {
    createProfile("WL用", { power: 300_000, source: "deck" });
    expect(decksWithoutProfile([deck("WL用")], getProfiles())).toHaveLength(0);
  });

  it("前後の空白は名前の同一性に影響しない", () => {
    createProfile("WL用", { source: "deck" });
    expect(decksWithoutProfile([deck("  WL用  ")], getProfiles())).toHaveLength(0);
  });
});

describe("profileValuesFromEval — プロフィールに置く値", () => {
  const ev = (o: Partial<DeckEval>): DeckEval =>
    ({
      power: { total: 336_000 },
      skill: { leader: 150.04, total: 710.06 },
      bonus: { total: 821.5 },
      ...o,
    }) as unknown as DeckEval;

  it("スキルは小数第1位まで、ボーナスは丸めない", () => {
    expect(profileValuesFromEval(ev({}))).toEqual({
      source: "deck",
      power: 336_000,
      skillLeader: 150,
      skillTotal: 710.1,
      bonus: 821.5,
    });
  });

  it("ボーナスが無い編成（チャレンジライブ等）では bonus を入れない", () => {
    const values = profileValuesFromEval(ev({ bonus: null }));
    expect("bonus" in values).toBe(false);
  });
});

describe("syncDecksToProfiles", () => {
  const base = { data: { events: [] }, catalog: new Map(), states: {}, player: {} } as unknown as DeckEvalBase;

  it("カードが1枚も入っていない編成は書かない", () => {
    const empty = deck("空", [null, null, null, null, null]);
    expect(deckProfileValues(empty, base)).toBeNull();
    expect(syncDecksToProfiles([empty], base).written).toBe(0);
    expect(getProfiles()).toHaveLength(0);
  });

  it("使用中の編成を勝手に切り替えない", () => {
    const mine = createProfile("手入力", { power: 300_000 });
    setActiveProfile(mine.id);
    syncDecksToProfiles([deck("空", [null, null, null, null, null])], base);
    expect(getActiveId()).toBe(mine.id);
  });
});
