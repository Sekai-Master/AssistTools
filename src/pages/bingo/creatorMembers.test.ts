/// <reference types="node" />
/**
 * 作者の表（creatorMembers.json・creatorMembers.ts）: 連名の曲がメンバーのマスでも埋まる・表記違いは一覧に出ない・表の形。
 * ★ 楽曲データは毎日更新されて、このテストは毎日の更新の門番になる。実データは表に載った作者の曲だけを見て、
 *   曲や作者が増えても落ちない書き方にする。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import table from "./creatorMembers.json";
import type { BingoMusic } from "./bingoLogic";
import { creatorAliasOf, creatorCovers, sameCreatorKey } from "./creatorMembers";
import { allOdaiDefs, odaiDefFromKey } from "./odaiDefs";
import { parseMusics } from "./useBingoMusics";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const LISTED = new Set(table.map((r) => r.id));

describe("作者のマスを埋めてよい曲（creatorCovers）", () => {
  it("ひとりの作者のマスは、その人が入った連名の曲でも埋まる（じんのマスと新人類）", () => {
    expect(creatorCovers(29, 198)).toBe(true);
    expect(creatorCovers(51, 198)).toBe(true);
    expect(creatorCovers(75, 198)).toBe(true);
  });

  it("連名のマスは、メンバーが全員入った曲で埋まる", () => {
    expect(creatorCovers(240, 241)).toBe(true); // ビートまりお×まろん のマスと ×まらしぃ の曲
    expect(creatorCovers(122, 198)).toBe(true); // まらしぃ × 堀江晶太(kemu) のマスと新人類
    expect(creatorCovers(241, 240)).toBe(false);
    expect(creatorCovers(198, 29)).toBe(false);
    expect(creatorCovers(198, 122)).toBe(false);
  });

  it("表記が違うだけの作者は、どちらのマスでも埋まる", () => {
    expect(creatorCovers(47, 17)).toBe(true);
    expect(creatorCovers(17, 47)).toBe(true);
    expect(creatorCovers(193, 22)).toBe(true);
    expect(creatorCovers(126, 350)).toBe(true); // 表記違いのマスも、メンバーの側と同じ曲で埋まる
  });

  it("表に無い作者どうしは、同じ ID だけ", () => {
    expect(creatorCovers(29, 29)).toBe(true);
    expect(creatorCovers(29, 4)).toBe(false);
  });

  it("名前で持つメンバー（Ado）は、作る側のマスを埋めるが、逆は埋めない", () => {
    expect(creatorCovers(28, 112)).toBe(true);
    expect(creatorCovers(112, 28)).toBe(false);
  });
});

describe("表の形", () => {
  it("作者 ID は重ならず、メンバーは 1 人以上で重ならない", () => {
    expect(LISTED.size).toBe(table.length);
    for (const r of table) {
      expect(r.members.length, r.name).toBeGreaterThan(0);
      expect(new Set(r.members).size, r.name).toBe(r.members.length);
    }
  });

  it("数のメンバーは、表に載っていない作者 ID（ひとりの作者）", () => {
    for (const r of table) {
      for (const m of r.members) if (typeof m === "number") expect(LISTED.has(m), `${r.name} の ${m}`).toBe(false);
    }
  });

  it("表記違いは、メンバーがほかの作者 ID ひとつの行だけ", () => {
    expect(creatorAliasOf(17)).toBe(47);
    expect(creatorAliasOf(22)).toBe(193);
    expect(creatorAliasOf(198)).toBeNull();
    expect(creatorAliasOf(240)).toBeNull(); // メンバーが名前だけの連名
    expect(creatorAliasOf(29)).toBeNull(); // 表に無い作者
  });

  it("表記違いの作者のお題の鍵は、同じ人の鍵に引ける（ほかの鍵は null）", () => {
    expect(sameCreatorKey("c49")).toBe("c36");
    expect(sameCreatorKey("c36")).toBeNull();
    expect(sameCreatorKey("c198")).toBeNull();
    expect(sameCreatorKey("s1")).toBeNull();
  });
});

describe("実データ", () => {
  const defs = new Map(
    allOdaiDefs(MUSICS)
      .filter((d) => d.kind === "creator")
      .map((d) => [d.key, d])
  );

  it("表に載った作者の曲は、ひとりの作者 ID があるメンバー全員のマスで当てはまる", () => {
    let checked = 0;
    for (const r of table) {
      const songs = MUSICS.filter((m) => m.creatorArtistId === r.id);
      for (const id of r.members) {
        const d = typeof id === "number" ? defs.get(`c${id}`) : undefined;
        if (!d) continue;
        for (const m of songs) {
          expect(d.test(m), `${d.text} のマスと ${m.title}（${r.name}）`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it("連名の曲には、なぜ当てはまるかの表記（曲の作者の名前）が添わる", () => {
    const jin = defs.get("c29");
    const song = MUSICS.find((m) => m.creatorArtistId === 198);
    if (!jin || !song) return; // 曲が配信停止になった日も落とさない
    expect(jin.hint?.(song)).toBe(song.artistName);
    const own = MUSICS.find((m) => m.creatorArtistId === 29);
    if (own) expect(jin.hint?.(own)).toBeNull();
  });

  it("表記違いの作者 ID はお題の一覧に出ず、コードからは開ける", () => {
    for (const r of table) {
      const same = creatorAliasOf(r.id);
      if (same === null || !MUSICS.some((m) => m.creatorArtistId === r.id)) continue;
      if (!MUSICS.some((m) => m.creatorArtistId === same)) continue; // 同じ人の自分の曲が無い日は表記違いの側を出す
      expect(defs.has(`c${r.id}`), r.name).toBe(false);
      expect(odaiDefFromKey(`c${r.id}`, MUSICS).kind).toBe("creator");
    }
  });
});

describe("表記違いをお題の一覧から外す（作った曲で）", () => {
  const song = (id: string, creatorArtistId: number, artistName: string): BingoMusic => ({
    id,
    title: id,
    default: 0,
    Unit: "0_VS",
    categories: [],
    isNewlyWrittenMusic: false,
    jacketLink: "",
    creatorArtistId,
    artistName,
  });
  const creatorKeys = (musics: BingoMusic[]) =>
    allOdaiDefs(musics)
      .filter((d) => d.kind === "creator")
      .map((d) => d.key);

  it("同じ人の自分の曲があれば、表記違いは出さず同じ人のお題にまとめる", () => {
    const musics = [song("1", 36, "和田たけあき"), song("2", 49, "和田たけあき(くらげP)")];
    expect(creatorKeys(musics)).toEqual(["c36"]);
  });

  it("同じ人の自分の曲が無ければ（配信停止）、表記違いのお題を出す", () => {
    expect(creatorKeys([song("2", 49, "和田たけあき(くらげP)")])).toEqual(["c49"]);
  });
});
