import { describe, expect, it } from "vitest";
import { bannerFields, indexBannerCharacters, previousBannersFrom, resolveBanners } from "./musicBanner.mjs";

// 小さな表。並びと項目名はマスタ（Sekai-World/sekai-master-db-diff、2026-11-10 取得）のまま
const story = (eventId, bannerGameCharacterUnitId) => ({ id: eventId, eventId, outline: "", bannerGameCharacterUnitId });
const eventMusic = (eventId, musicId) => ({ eventId, musicId, seq: 1, releaseConditionId: 1 });
const unit = (id, gameCharacterId) => ({ id, gameCharacterId, unit: "x" });
const bloom = (eventId) => ({ id: eventId * 100 + 1, eventId, gameCharacterId: 1, chapterNo: 1 });

/** 瑞希（20）がバナーの「荊棘の道は何処へ」（145）と、その曲「化けの花」（549）。 */
const BASE = {
  eventMusics: [eventMusic(145, 549), eventMusic(39, 310)],
  eventStories: [story(145, 20), story(39, 20)],
  gameCharacterUnits: [unit(20, 20), unit(31, 21)],
  worldBlooms: [bloom(112)],
};

describe("バナーの表（eventMusics・eventStories・gameCharacterUnits）の索引", () => {
  it("回 → バナーのキャラのユニット → キャラ で、曲ごとにバナーのキャラを引く", () => {
    const { index, problem } = indexBannerCharacters(BASE);
    expect(problem).toBeNull();
    expect(index.get(549)).toBe(20);
    expect(index.get(310)).toBe(20);
  });

  // 持ち主の決定（2026-11-10）: ワールドリンクの曲は入れない。
  // 第 1・2 弾（112〜179）の回は eventStories にバナーがある（今は曲の行が無いだけ）
  it("ワールドリンクの回の曲は、バナーがあっても入れない", () => {
    const { index } = indexBannerCharacters({
      ...BASE,
      eventMusics: [...BASE.eventMusics, eventMusic(112, 700)],
      eventStories: [...BASE.eventStories, story(112, 20)],
    });
    expect(index.has(700)).toBe(false);
  });

  it("バナーの無い回（ワールドリンク第 3 弾など）の曲は入れない", () => {
    const { index } = indexBannerCharacters({
      ...BASE,
      eventMusics: [...BASE.eventMusics, eventMusic(202, 739)],
      eventStories: [...BASE.eventStories, { id: 202, eventId: 202, outline: "" }],
    });
    expect(index.has(739)).toBe(false);
  });

  it("壊れた行は捨てる（null・数でない id・表に無いユニット・キャラの id が正の整数でない）", () => {
    const { index, problem } = indexBannerCharacters({
      eventMusics: [...BASE.eventMusics, null, { eventId: 145 }, eventMusic("146", 600), eventMusic(147, 601), eventMusic(148, 602)],
      eventStories: [...BASE.eventStories, null, story(147, 99), story(148, 40)],
      gameCharacterUnits: [...BASE.gameCharacterUnits, null, unit(40, 0), unit("41", 3)],
      worldBlooms: [...BASE.worldBlooms, null, { eventId: "x" }],
    });
    expect(problem).toBeNull();
    expect([...index.keys()].sort((a, b) => a - b)).toEqual([310, 549]);
  });

  // 読む側（src/pages/bingo/useBingoMusics.ts）も 1〜26 だけ通す。書く側でそろえないと、範囲外の値が引き継がれ続ける
  it("キャラの id が 26 を超えるユニットの回は入れない", () => {
    const { index } = indexBannerCharacters({
      ...BASE,
      eventMusics: [...BASE.eventMusics, eventMusic(149, 603)],
      eventStories: [...BASE.eventStories, story(149, 57)],
      gameCharacterUnits: [...BASE.gameCharacterUnits, unit(57, 27)],
    });
    expect(index.has(603)).toBe(false);
  });

  it("1 曲が 2 回のイベントに出たら、先の回のバナーにする（後の回は始まっていないことがある）", () => {
    const { index, duplicates } = indexBannerCharacters({
      ...BASE,
      eventMusics: [eventMusic(200, 549), ...BASE.eventMusics],
      eventStories: [...BASE.eventStories, story(200, 31)],
    });
    expect(index.get(549)).toBe(20);
    expect(duplicates).toBe(1);
  });

  it("表が取れない日は索引を作らず、どの表かを返す", () => {
    const { index, problem } = indexBannerCharacters({ ...BASE, eventStories: null });
    expect(index).toBeNull();
    expect(problem).toContain("eventStories.json が取れない");
  });

  // ★ 項目の名前が変わると、取れても全曲のバナーが消える。取れないときと同じに扱う
  it("表の形が変わった日（配列でない・使える行が 1 つも無い）も索引を作らない", () => {
    const renamed = BASE.eventStories.map(({ bannerGameCharacterUnitId, ...rest }) => ({ ...rest, banner: bannerGameCharacterUnitId }));
    const a = indexBannerCharacters({ ...BASE, eventStories: renamed });
    expect(a.index).toBeNull();
    expect(a.problem).toContain("eventStories.json の形が変わった");
    const b = indexBannerCharacters({ ...BASE, gameCharacterUnits: { rows: [] } });
    expect(b.index).toBeNull();
    expect(b.problem).toContain("gameCharacterUnits.json の形が変わった");
    // ワールドリンクの表が壊れると、ワールドリンクの曲を外せないので同じに扱う
    const c = indexBannerCharacters({ ...BASE, worldBlooms: [] });
    expect(c.index).toBeNull();
    expect(c.problem).toContain("worldBlooms.json の形が変わった");
  });
});

describe("直前の配信データのバナー", () => {
  it("数の曲 id → バナーのキャラ。壊れた値は捨てる", () => {
    const p = previousBannersFrom([
      { id: "549", bannerCharacterId: 20 },
      { id: "310", bannerCharacterId: "20" },
      { id: "311", bannerCharacterId: 0 },
      { id: "312", bannerCharacterId: 3.5 },
      { id: "313" },
      { id: "314", bannerCharacterId: 27 },
      null,
      { id: "x", bannerCharacterId: 1 },
    ]);
    expect([...p]).toEqual([[549, 20]]);
    expect(previousBannersFrom(undefined).size).toBe(0);
  });
});

describe("1 曲ずつのバナーをどこから取るか", () => {
  const ids = [310, 549, 600];
  const built = indexBannerCharacters(BASE);

  it("表が取れれば表から（公開済みの曲だけ）", () => {
    const r = resolveBanners(ids, built, new Map());
    expect(r.source).toBe("table");
    expect(r.problem).toBeNull();
    expect([...r.bannerOf]).toEqual([
      [310, 20],
      [549, 20],
    ]);
    expect(r.tableCount).toBe(2);
  });

  it("公開前の曲（渡した id に無い曲）には書かない", () => {
    const r = resolveBanners([310], built, new Map());
    expect(r.bannerOf.has(549)).toBe(false);
    expect(r.tableCount).toBe(1);
  });

  // ★ ビンゴのためだけに毎日の更新を止めない。誤ったデータも出さない
  it("表が取れない・形が変わった日は、直前の配信データの値を引き継ぐ", () => {
    const previous = previousBannersFrom([
      { id: "549", bannerCharacterId: 20 },
      { id: "600", bannerCharacterId: 5 },
    ]);
    const r = resolveBanners(ids, indexBannerCharacters({ ...BASE, eventMusics: null }), previous);
    expect(r.source).toBe("previous");
    expect(r.problem).toContain("eventMusics.json が取れない");
    expect([...r.bannerOf]).toEqual([
      [549, 20],
      [600, 5],
    ]);
  });

  it("バナー曲が直前より 1 割以上減ったら、直前の値を引き継ぐ（理由は件数だけ）", () => {
    const previous = new Map(Array.from({ length: 10 }, (_, i) => [1000 + i, 20]));
    const allIds = [...previous.keys()];
    const nine = indexBannerCharacters({
      ...BASE,
      eventMusics: allIds.slice(0, 9).map((id, i) => eventMusic(300 + i, id)),
      eventStories: allIds.map((_, i) => story(300 + i, 20)),
    });
    const r = resolveBanners(allIds, nine, previous);
    expect(r.source).toBe("previous");
    expect(r.bannerOf.size).toBe(10);
    expect(r.problem).toBe("バナー曲が直前の 10曲から 9曲に減った");
  });

  it("表は取れたが公開済みの曲のバナーが 0 曲になった日も、直前の値を引き継ぐ", () => {
    const previous = new Map([[549, 20]]);
    const r = resolveBanners([549], indexBannerCharacters({ ...BASE, eventMusics: [eventMusic(145, 9999)] }), previous);
    expect(r.source).toBe("previous");
    expect([...r.bannerOf]).toEqual([[549, 20]]);
    expect(r.problem).toBe("バナー曲が直前の 1曲から 0曲に減った");
  });

  it("減り方が 1 割より小さければ表を使う（表が正。行の消えた曲は引き継がない）", () => {
    const previous = new Map(Array.from({ length: 20 }, (_, i) => [1000 + i, 20]));
    const allIds = [...previous.keys()];
    const most = indexBannerCharacters({
      ...BASE,
      eventMusics: allIds.slice(0, 19).map((id, i) => eventMusic(300 + i, id)),
      eventStories: allIds.map((_, i) => story(300 + i, 20)),
    });
    const r = resolveBanners(allIds, most, previous);
    expect(r.source).toBe("table");
    expect(r.bannerOf.size).toBe(19);
    expect(r.previousCount).toBe(20);
  });

  it("直前の配信データにバナーが無い（初めての日）なら、表をそのまま使う", () => {
    const r = resolveBanners(ids, built, new Map());
    expect(r.source).toBe("table");
    expect(r.previousCount).toBe(0);
  });
});

describe("楽曲データに書く項目", () => {
  it("バナーのある曲だけ bannerCharacterId を書き、ほかの曲には項目自体を書かない", () => {
    const bannerOf = new Map([[549, 20]]);
    expect(bannerFields(549, bannerOf)).toEqual({ bannerCharacterId: 20 });
    expect(bannerFields(1, bannerOf)).toEqual({});
  });
});
