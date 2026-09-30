import { describe, expect, it } from "vitest";
import {
  MIN_TABLE_SHARE,
  indexMusicCategories,
  previousCategoriesFrom,
  resolveCategories,
  tableShare,
} from "./musicCategories.mjs";

const row = (id, musicId, musicCategoryName) => ({ id, musicId, musicCategoryName });

describe("別表（musicCategories.json）の索引", () => {
  it("曲ごとに、行の id 順でまとめる（入力の並びに頼らない）", () => {
    const index = indexMusicCategories([row(3, 10, "mv_2d"), row(1, 10, "mv"), row(2, 20, "image")]);
    expect(index.get(10)).toEqual(["mv", "mv_2d"]);
    expect(index.get(20)).toEqual(["image"]);
  });

  it("壊れた行は捨てる", () => {
    const index = indexMusicCategories([
      null,
      { id: 1, musicCategoryName: "mv" },
      { id: 2, musicId: 10, musicCategoryName: 5 },
      row(3, 10, "mv"),
    ]);
    expect([...index.keys()]).toEqual([10]);
    expect(index.get(10)).toEqual(["mv"]);
  });

  it("配列でなければ空の索引", () => {
    expect(indexMusicCategories(undefined).size).toBe(0);
  });
});

describe("1曲のカテゴリ", () => {
  const index = indexMusicCategories([row(1, 10, "mv"), row(2, 10, "original")]);
  const none = new Map();

  it("別表の行があれば、musics.json の欄より優先する", () => {
    const r = resolveCategories({ id: 10, categories: ["image"] }, index, none);
    expect(r).toEqual({ categories: ["mv_3d", "original"], source: "table" });
  });

  // ★ 241・290 の2曲は、別表に行が無く musics.json に欄が残っている（2026-09-30 時点）。
  it("別表に行が無ければ musics.json の欄を使う", () => {
    const r = resolveCategories({ id: 241, categories: ["original"] }, index, none);
    expect(r).toEqual({ categories: ["original"], source: "field" });
  });

  // ★ 別表が取れない・形が変わったときに、ビンゴのためだけに更新全体を止めない。
  it("どちらにも無ければ、直前の配信データのカテゴリを引き継ぐ", () => {
    const previous = new Map([[99, ["mv_3d", "mv_2d"]]]);
    const r = resolveCategories({ id: 99 }, index, previous);
    expect(r).toEqual({ categories: ["mv_3d", "mv_2d"], source: "previous" });
  });

  it("どこにも無ければ空", () => {
    expect(resolveCategories({ id: 1234 }, index, none)).toEqual({ categories: [], source: "none" });
  });

  describe("変換の規則（以前の欄と同じ）", () => {
    const one = (names) =>
      resolveCategories({ id: 1 }, indexMusicCategories(names.map((n, i) => row(i + 1, 1, n))), none)
        .categories;

    it("mv は 3D の MV なので mv_3d に読み替える", () => {
      expect(one(["mv"])).toEqual(["mv_3d"]);
    });

    it("image は、ほかのカテゴリがあるときだけ落とす", () => {
      expect(one(["image"])).toEqual(["image"]);
      // 740 羽歌: 2D MV が足されて image と並んだ
      expect(one(["image", "mv_2d"])).toEqual(["mv_2d"]);
    });

    // ★ 別表には同じ曲・同じカテゴリの行が2つあることがある（121・195・441・477 の mv_2d）。
    //   以前の欄は重複を持たなかった。
    it("同じカテゴリの行が2つあっても1つにまとめる", () => {
      expect(one(["mv", "mv_2d", "mv_2d"])).toEqual(["mv_3d", "mv_2d"]);
    });
  });
});

describe("直前の配信データ", () => {
  it("id を数値に直してカテゴリを引けるようにする", () => {
    const previous = previousCategoriesFrom([
      { id: "007", categories: ["mv_3d"] },
      { id: "662", categories: ["mv_3d", "mv_2d"] },
    ]);
    expect(previous.get(7)).toEqual(["mv_3d"]);
    expect(previous.get(662)).toEqual(["mv_3d", "mv_2d"]);
  });

  it("壊れていたら空（初回や読み込み失敗でも落ちない）", () => {
    expect(previousCategoriesFrom(null).size).toBe(0);
    expect(previousCategoriesFrom([null, { id: "1" }, { id: "2", categories: "mv" }]).size).toBe(0);
  });
});

describe("別表から取れた曲の割合", () => {
  it("source が table の曲の割合", () => {
    const rs = [{ source: "table" }, { source: "table" }, { source: "field" }, { source: "previous" }];
    expect(tableShare(rs)).toBe(0.5);
  });

  it("曲が無ければ 1（警告しない）", () => {
    expect(tableShare([])).toBe(1);
  });

  it("警告の境目は半分", () => {
    expect(MIN_TABLE_SHARE).toBe(0.5);
  });
});
