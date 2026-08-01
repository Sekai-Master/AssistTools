/**
 * @vitest-environment jsdom
 *
 * 保存は外部由来（別バージョンの残骸・手で書き換えた値・容量超過）を必ず通る経路なので、
 * 「壊れたものが混ざっても健全なものだけ残る」ことを固定する。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DECK_SIZE,
  DECK_STORAGE_KEYS,
  defaultCardState,
  deleteDeck,
  listDecks,
  parseCardStates,
  parseDecks,
  readCardStates,
  saveDeck,
  writeCardStates,
  type SavedDeck,
} from "./deckStore";

const deck = (over: Partial<SavedDeck> = {}): SavedDeck => ({
  name: "編成1",
  savedAt: 100,
  cardIds: [1, 2, 3, 4, 5],
  leaderIndex: 0,
  supportBonus: 0,
  ...over,
});

beforeEach(() => localStorage.clear());

describe("育成状態", () => {
  it("往復して同じものが返る", () => {
    const states = { 471: { ...defaultCardState(60, true), masterRank: 3 } };
    writeCardStates(states);
    expect(readCardStates()).toEqual(states);
  });

  it("マスターランクの既定は 0（未設定という状態を持たない）", () => {
    expect(defaultCardState(60, true).masterRank).toBe(0);
  });

  it("以前のバージョンの「未設定」は読み込み時に 0 へ寄せる", () => {
    const { masterRank: _drop, ...old } = defaultCardState(60, true);
    expect(parseCardStates({ 471: old })[471].masterRank).toBe(0);
  });

  it("レアリティに応じた既定値になる（★1は特訓しても加算が無いので false）", () => {
    expect(defaultCardState(20, false)).toMatchObject({ level: 20, trained: false });
    expect(defaultCardState(60, true)).toMatchObject({
      level: 60,
      trained: true,
      episodes: { first: true, latter: true },
      canvas: false,
    });
  });

  it("壊れた値は1件ずつ落とす（他の健全な行は残す）", () => {
    const ok = defaultCardState(60, true);
    const parsed = parseCardStates({
      1: ok,
      2: { ...ok, level: 0 }, // 範囲外
      3: { ...ok, trained: "yes" }, // 型違い
      4: { ...ok, episodes: null }, // 欠け
      5: { ...ok, masterRank: 9 }, // 範囲外
      abc: ok, // 数値でないキー
    });
    expect(Object.keys(parsed)).toEqual(["1"]);
  });

  it("配列や null を渡されても空で返る", () => {
    expect(parseCardStates([1, 2])).toEqual({});
    expect(parseCardStates(null)).toEqual({});
    expect(parseCardStates("{}")).toEqual({});
  });

  it("localStorage に壊れた JSON が入っていても落ちない", () => {
    localStorage.setItem(DECK_STORAGE_KEYS.cards, "{oops");
    expect(readCardStates()).toEqual({});
  });
});

describe("名前付き編成", () => {
  it("保存して新しい順で読める", () => {
    saveDeck(deck({ name: "A", savedAt: 1 }));
    saveDeck(deck({ name: "B", savedAt: 2 }));
    expect(listDecks().map((d) => d.name)).toEqual(["B", "A"]);
  });

  it("同名は上書き（増えない）", () => {
    saveDeck(deck({ name: "A", savedAt: 1, supportBonus: 10 }));
    const after = saveDeck(deck({ name: "A", savedAt: 3, supportBonus: 25 }));
    expect(after).toHaveLength(1);
    expect(after[0].supportBonus).toBe(25);
  });

  it("削除できる", () => {
    saveDeck(deck({ name: "A" }));
    saveDeck(deck({ name: "B" }));
    expect(deleteDeck("A").map((d) => d.name)).toEqual(["B"]);
  });

  it("枠数が違う編成は5枠に正規化する", () => {
    const [short] = parseDecks([deck({ cardIds: [1, 2] })]);
    expect(short.cardIds).toEqual([1, 2, null, null, null]);
    const [long] = parseDecks([deck({ cardIds: [1, 2, 3, 4, 5, 6, 7] })]);
    expect(long.cardIds).toHaveLength(DECK_SIZE);
  });

  it("壊れた要素だけ落として健全な編成は残す", () => {
    const parsed = parseDecks([
      deck({ name: "ok" }),
      { name: "", cardIds: [1] }, // 名前なし
      { name: "x", cardIds: "1,2" }, // 配列でない
      null,
    ]);
    expect(parsed.map((d) => d.name)).toEqual(["ok"]);
  });

  it("範囲外のリーダー枠・負のサポートボーナスは既定に戻す", () => {
    const [d] = parseDecks([deck({ leaderIndex: 9, supportBonus: -5 })]);
    expect(d.leaderIndex).toBe(0);
    expect(d.supportBonus).toBe(0);
  });

  it("カード id に文字列や 0 が混ざっていたら空き枠にする", () => {
    const [d] = parseDecks([deck({ cardIds: ["1", 0, 3, null, 5] as unknown as (number | null)[] })]);
    expect(d.cardIds).toEqual([null, null, 3, null, 5]);
  });
});
