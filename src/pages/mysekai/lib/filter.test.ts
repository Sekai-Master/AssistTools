import { describe, expect, it } from "vitest";
import {
  applyFilter,
  DEFAULT_FILTER,
  normalizeQuery,
  sortFixtures,
  summary,
  talksOf,
} from "./filter";
import type { Fixture } from "./types";

const fx = (
  over: Partial<Fixture> & Pick<Fixture, "id" | "name"> & { talks?: [number, number][] }
): Fixture => {
  const talkPairs = over.talks ?? [];
  const talkChars = talkPairs.map(([c]) => c);
  const likeChars = over.likeChars ?? [];
  const talkCount = over.talkCount ?? talkPairs.reduce((a, [, n]) => a + n, 0);
  const action = over.action ?? false;
  const { talks: _talks, ...rest } = over;
  return {
    reading: over.name,
    type: "normal",
    mainGenreId: 2,
    size: [1, 1, 1],
    site: "room",
    layout: "floor",
    cost: 10,
    sketch: null,
    ...rest,
    talkChars,
    talkCountBy: new Map(talkPairs),
    // 既定は「全部ソロ」。人数条件のテストだけ明示的に上書きする。
    talkSoloBy: over.talkSoloBy ?? new Map(talkPairs),
    maxParty: over.maxParty ?? 1,
    parties: over.parties ?? talkChars.map((c) => [c]),
    likeChars,
    talkCount,
    action,
    reactive: talkCount > 0 || action || likeChars.length > 0,
    charSet: new Set([...talkChars, ...likeChars]),
  } as Fixture;
};

// ソファ: 一歌4本・咲希1本（家具全体では5本）、一歌のお気に入り
const ソファ = fx({ id: 1, name: "ソファ", reading: "そふぁ", talks: [[1, 4], [2, 1]], likeChars: [1], sketch: true, cost: 20 });
const ベッド = fx({ id: 2, name: "ベッド", reading: "べっど", talks: [[2, 2]], sketch: false, cost: 30 });
// 動くだけの家具。会話も好みも無い＝誰の反応とも言えない
const 作業台 = fx({ id: 3, name: "作業台", reading: "さぎょうだい", action: true, sketch: true, cost: 5, size: [2, 2, 1] });
const ラグ = fx({ id: 4, name: "ラグ", reading: "らぐ", action: true, likeChars: [3], sketch: true, cost: 5 });
const 置物 = fx({ id: 5, name: "置物", reading: "おきもの", sketch: true, cost: 1 });
const ALL = [ソファ, ベッド, 作業台, ラグ, 置物];

const ids = (list: Fixture[]) => list.map((f) => f.id).sort((a, b) => a - b);

describe("applyFilter", () => {
  it("既定では反応のある家具だけ出す（未実装家具が既定で目に入らないようにする）", () => {
    expect(ids(applyFilter(ALL, DEFAULT_FILTER))).toEqual([1, 2, 3, 4]);
  });

  it("reactiveOnly を外すと全件出る", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, reactiveOnly: false }))).toEqual([1, 2, 3, 4, 5]);
  });

  it("キャラで絞ると、そのキャラが関わる家具だけになる", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 1 }))).toEqual([1]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 2 }))).toEqual([1, 2]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 3 }))).toEqual([4]);
  });

  // ★ 無関心(normal)を charSet に混ぜていた頃は、誰を選んでも結果がほぼ同じになった
  //   （実測 Jaccard 0.957・上位10件が26人全員一致）。キャラごとに違う結果になることを固定する。
  it("キャラごとに結果が変わる", () => {
    const a = ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 1 }));
    const b = ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 3 }));
    expect(a).not.toEqual(b);
  });

  it("キャラ×種別で絞る（会話だけ・好みだけ）", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 1, kinds: ["talk"] }))).toEqual([1]);
    // キャラ3は好み(ラグ)のみ。会話で絞ると消える。
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 3, kinds: ["talk"] }))).toEqual([]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 3, kinds: ["like"] }))).toEqual([4]);
  });

  // ★ isGameCharacterAction は家具単位のフラグで、誰が動くかを持たない。
  //   キャラ選択中に action を条件へ混ぜると、会話も好みも無い家具（作業台）が
  //   そのキャラの結果に紛れ込む（偽陽性）一方、誰の反応も無い動く家具は
  //   どのキャラを選んでも出てこない（偽陰性）。キャラ選択時は action で絞らない。
  it("キャラ選択中は「キャラが動く」で絞らない（誰が動くかの情報が無いため）", () => {
    // 一歌＋action → action で絞られず、一歌が関わる家具がそのまま出る
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 1, kinds: ["action"] }))).toEqual([1]);
    // 作業台（動くが誰の反応も無い）はどのキャラを選んでも出ない
    for (const charId of [1, 2, 3]) {
      expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId, kinds: ["action"] }))).not.toContain(3);
    }
  });

  it("キャラ未選択なら「キャラが動く」で絞れる", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, kinds: ["action"] }))).toEqual([3, 4]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, kinds: ["talk"] }))).toEqual([1, 2]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, kinds: ["like"] }))).toEqual([1, 4]);
  });

  it("種別を複数選ぶと OR になる", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, kinds: ["talk", "like"] }))).toEqual([1, 2, 4]);
  });

  // ★ 「設計図が無い」(null) と「模写不可」(false) を混ぜない。
  it("模写可のみで絞ると sketch=true だけ残る", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, sketchableOnly: true }))).toEqual([1, 3, 4]);
  });

  it("持っている家具を隠せる", () => {
    const owned = new Set([1, 2]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, hideOwned: true }, owned))).toEqual([3, 4]);
    // hideOwned が false なら owned は効かない
    expect(ids(applyFilter(ALL, DEFAULT_FILTER, owned))).toEqual([1, 2, 3, 4]);
  });

  it("名前でも読みでも検索できる", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, query: "ソファ" }))).toEqual([1]);
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, query: "べっど" }))).toEqual([2]);
  });

  it("ジャンルで絞れる", () => {
    const 別ジャンル = fx({ id: 9, name: "壁掛け", talks: [[1, 1]], mainGenreId: 4 });
    expect(ids(applyFilter([...ALL, 別ジャンル], { ...DEFAULT_FILTER, mainGenreId: 4 }))).toEqual([9]);
  });

  it("条件を重ねられる（キャラ＋模写可）", () => {
    expect(ids(applyFilter(ALL, { ...DEFAULT_FILTER, charId: 2, sketchableOnly: true }))).toEqual([1]);
  });
});

describe("会話の人数で絞る", () => {
  // ソファ: 一歌はソロ4本、咲希はソロ0本（一歌と居るときの1本だけ）
  const ソファ2 = fx({
    id: 20,
    name: "ソファ2",
    talks: [[1, 4], [2, 1]],
    talkSoloBy: new Map([[1, 4], [2, 0]]),
    maxParty: 2,
  });
  const ベンチ = fx({ id: 21, name: "ベンチ", talks: [[3, 2]], talkSoloBy: new Map([[3, 2]]) });
  const 二人掛け = fx({
    id: 22,
    name: "二人掛け",
    talks: [[4, 3], [5, 3]],
    talkSoloBy: new Map([[4, 0], [5, 0]]),
    maxParty: 2,
  });
  const LIST = [ソファ2, ベンチ, 二人掛け];

  it("ひとりで喋る家具だけに絞れる", () => {
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "solo" }))).toEqual([20, 21]);
  });

  it("複数人でしか喋らない家具だけに絞れる", () => {
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "group" }))).toEqual([20, 22]);
  });

  // ★ 同じ家具でも人によって違う（実測で38件が該当）。家具単位で決めると誤る。
  it("キャラを選んだらその人について判定する", () => {
    // 一歌はソファでソロ会話を持つ
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "solo", charId: 1 }))).toEqual([20]);
    // 咲希は同じソファでソロ会話を持たない（一歌と居るときだけ）
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "solo", charId: 2 }))).toEqual([]);
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "group", charId: 2 }))).toEqual([20]);
  });

  it("any なら人数で絞らない", () => {
    expect(ids(applyFilter(LIST, { ...DEFAULT_FILTER, party: "any" }))).toEqual([20, 21, 22]);
  });
});

describe("talksOf", () => {
  // ★ 家具全体の本数をキャラ選択中に出すと実数の19倍になった（一歌 4205本 / 実数 220本）。
  it("キャラを選べばその人の本数、選ばなければ家具全体の本数", () => {
    expect(talksOf(ソファ, null)).toBe(5);
    expect(talksOf(ソファ, 1)).toBe(4);
    expect(talksOf(ソファ, 2)).toBe(1);
    expect(talksOf(ソファ, 99)).toBe(0);
  });
});

describe("normalizeQuery", () => {
  it("全角英数と大文字を吸収する", () => {
    expect(normalizeQuery("ＡＢＣ１２３")).toBe("abc123");
    expect(normalizeQuery("  Sofa  ")).toBe("sofa");
  });
});

describe("sortFixtures", () => {
  it("会話数の多い順に並ぶ（同点は読み順）", () => {
    expect(sortFixtures(ALL, "talks", true).map((f) => f.id)).toEqual([1, 2, 5, 3, 4]);
  });

  // キャラを選んでいるときに家具全体の本数で並べると、誰を選んでも
  // 「多人数で使えるソファ」が先頭に来る（＝並びがキャラを反映しない）。
  it("キャラを選んだらその人の会話数で並ぶ", () => {
    const list = [ソファ, ベッド];
    expect(sortFixtures(list, "talks", true, 1).map((f) => f.id)).toEqual([1, 2]); // 一歌 4 vs 0
    expect(sortFixtures(list, "talks", true, 2).map((f) => f.id)).toEqual([2, 1]); // 咲希 2 vs 1
  });

  it("昇順に切り替えられる", () => {
    expect(sortFixtures([ソファ, ベッド], "cost", false).map((f) => f.id)).toEqual([1, 2]);
    expect(sortFixtures([ソファ, ベッド], "cost", true).map((f) => f.id)).toEqual([2, 1]);
  });

  it("名前順は読みで並べる（漢字の並びが直感とずれないように）", () => {
    expect(sortFixtures(ALL, "name", false).map((f) => f.id)).toEqual([5, 3, 1, 2, 4]);
  });

  it("元の配列を壊さない", () => {
    const before = ALL.map((f) => f.id);
    sortFixtures(ALL, "cost", true);
    expect(ALL.map((f) => f.id)).toEqual(before);
  });

  it("同点でも並びが安定する", () => {
    const a = fx({ id: 10, name: "あ", talks: [[1, 1]] });
    const b = fx({ id: 11, name: "い", talks: [[1, 1]] });
    expect(sortFixtures([b, a], "talks", true).map((f) => f.id)).toEqual([10, 11]);
    expect(sortFixtures([a, b], "talks", true).map((f) => f.id)).toEqual([10, 11]);
  });
});

describe("summary", () => {
  it("件数と模写可能数を出す", () => {
    const s = summary(ALL);
    expect(s.total).toBe(5);
    expect(s.sketchable).toBe(4);
    expect(s.talks).toBe(7); // 家具全体の合計
  });

  it("キャラを渡すとその人の会話本数だけ数える", () => {
    expect(summary(ALL, 1).talks).toBe(4);
    expect(summary(ALL, 2).talks).toBe(3);
  });
});
