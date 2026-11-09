import { describe, expect, it } from "vitest";
import { type SearchableSong, searchSongs } from "./songSearch";

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
