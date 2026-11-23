import { describe, expect, it } from "vitest";
import { type SearchableSong, parseAliases, searchSongs } from "./songSearch";

const song = (id: string, title: string, over: Partial<SearchableSong> = {}): SearchableSong => ({
  id,
  title,
  jacketLink: `jacket_s_${id}.webp`,
  ...over,
});

const SONGS = [
  song("001", "Tell Your World", { pronunciation: "てるゆあわーるど", artistName: "livetune" }),
  song("002", "ロキ", { pronunciation: "ろき", artistName: "みきとP" }),
  song("003", "ヴァンパイア", { pronunciation: "ゔぁんぱいあ", artistName: "DECO*27" }),
  song("004", "ゴーストルール", { pronunciation: "ごーするーる", artistName: "DECO*27" }),
];

describe("searchSongs（曲名・読み・作者・別名で引く）", () => {
  it("空・空白だけなら全部を元の順で返す", () => {
    expect(searchSongs(SONGS, [], "")).toEqual(SONGS);
    expect(searchSongs(SONGS, [], "   ")).toEqual(SONGS);
  });

  it("曲名は大文字小文字を問わず、前後の空白を除いて引く", () => {
    expect(searchSongs(SONGS, [], "  tell ").map((s) => s.id)).toEqual(["001"]);
  });

  it("読みで引く", () => {
    expect(searchSongs(SONGS, [], "ろき").map((s) => s.id)).toEqual(["002"]);
  });

  it("作者で引く（大文字小文字を問わない）", () => {
    expect(searchSongs(SONGS, [], "deco").map((s) => s.id)).toEqual(["003", "004"]);
  });

  it("別名で引く（別名の大文字小文字も問わない）", () => {
    const aliases = [{ alias: "TYW", songIds: ["001"] }, { alias: "ゴスルー", songIds: ["004"] }];
    expect(searchSongs(SONGS, aliases, "tyw").map((s) => s.id)).toEqual(["001"]);
    expect(searchSongs(SONGS, aliases, "ゴス").map((s) => s.id)).toEqual(["004"]);
  });

  it("件数で切らない（切るのは呼ぶ側）", () => {
    const many = Array.from({ length: 120 }, (_, i) => song(String(i), `曲${i}`));
    expect(searchSongs(many, [], "")).toHaveLength(120);
    expect(searchSongs(many, [], "曲")).toHaveLength(120);
  });
});

describe("parseAliases（aliasMapping.json の読み込み）", () => {
  it("alias が配列なら 1 つずつの行に分け、検索で引ける（エビ・カゲプロが引けなかった不具合）", () => {
    const aliases = parseAliases([
      { alias: "LOKI", songIds: ["002"] },
      { alias: ["ゴスルー", "ゴールー"], songIds: ["004"] },
    ]);
    expect(aliases).toEqual([
      { alias: "LOKI", songIds: ["002"] },
      { alias: "ゴスルー", songIds: ["004"] },
      { alias: "ゴールー", songIds: ["004"] },
    ]);
    expect(searchSongs(SONGS, aliases, "ゴールー").map((s) => s.id)).toEqual(["004"]);
    expect(searchSongs(SONGS, aliases, "ゴスルー").map((s) => s.id)).toEqual(["004"]);
  });

  it("壊れた行は捨てる（null・別名なし・曲なし・文字列でない値）", () => {
    expect(
      parseAliases([
        null,
        "x",
        { alias: "", songIds: ["001"] },
        { alias: ["", 3, "ろっく"], songIds: ["001", "", 5] },
        { alias: "曲なし", songIds: [] },
        { alias: 7, songIds: ["001"] },
      ])
    ).toEqual([{ alias: "ろっく", songIds: ["001"] }]);
    expect(parseAliases({ alias: "x" })).toEqual([]);
  });
});
