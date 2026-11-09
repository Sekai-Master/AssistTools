/// <reference types="node" />
/**
 * 楽曲データの読み込み（parseMusics）: お題ビンゴ用に足した項目を、型を確かめて読む。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusics } from "./useBingoMusics";

const base = { id: "001", title: "Tell Your World", Unit: "0_VS", categories: ["mv_3d"], default: 1 };

describe("parseMusics（お題ビンゴ用の項目）", () => {
  it("歌うキャラ・人数・ver.・踊る人数・作詞と作曲・譜面・追加日を読む", () => {
    const [m] = parseMusics([
      {
        ...base,
        publishedAt: 1560148031000,
        singers: [1, 21],
        maxSingers: 6,
        hasAprilFool: true,
        dancerCount: 3,
        lyricsByOther: true,
        expertLevel: 28,
        masterLevel: 32,
        appendLevel: 30,
        masterNotes: 650,
      },
    ]);
    expect(m).toMatchObject({
      publishedAt: 1560148031000,
      singers: [1, 21],
      maxSingers: 6,
      hasAprilFool: true,
      dancerCount: 3,
      lyricsByOther: true,
      expertLevel: 28,
      masterLevel: 32,
      appendLevel: 30,
      masterNotes: 650,
    });
  });

  it("項目が無ければ「無い・偽」（楽曲データは偽の項目を書かない）", () => {
    const [m] = parseMusics([base]);
    expect(m.singers).toBeUndefined();
    expect(m.maxSingers).toBeUndefined();
    expect(m.hasAprilFool).toBe(false);
    expect(m.lyricsByOther).toBe(false);
    expect(m.appendLevel).toBeUndefined();
    expect(m.publishedAt).toBeUndefined();
  });

  it("型の違う値は読まない（文字列の数・小数・0・true 以外の真）", () => {
    const [m] = parseMusics([
      {
        ...base,
        publishedAt: "2020",
        singers: [1, "2", 3.5, 0, -1, null],
        maxSingers: "6",
        hasAprilFool: "yes",
        dancerCount: 0,
        lyricsByOther: 1,
        masterLevel: 32.5,
        masterNotes: null,
      },
    ]);
    expect(m.publishedAt).toBeUndefined();
    expect(m.singers).toEqual([1]);
    expect(m.maxSingers).toBeUndefined();
    expect(m.hasAprilFool).toBe(false);
    expect(m.dancerCount).toBeUndefined();
    expect(m.lyricsByOther).toBe(false);
    expect(m.masterLevel).toBeUndefined();
    expect(m.masterNotes).toBeUndefined();
    expect(parseMusics([{ ...base, singers: "1,2" }])[0].singers).toBeUndefined();
  });

  // scripts/lib/musicBanner.mjs が書く。ゲームのキャラ（1〜26）の整数だけ通す
  it("バナーのキャラ（bannerCharacterId）は 1〜26 の整数だけ読む", () => {
    expect(parseMusics([{ ...base, bannerCharacterId: 20 }])[0].bannerCharacterId).toBe(20);
    expect(parseMusics([{ ...base, bannerCharacterId: 26 }])[0].bannerCharacterId).toBe(26);
    for (const bad of ["20", 0, 27, 3.5, -1, null, true]) {
      expect(parseMusics([{ ...base, bannerCharacterId: bad }])[0].bannerCharacterId).toBeUndefined();
    }
    expect(parseMusics([base])[0].bannerCharacterId).toBeUndefined();
  });

  it("配信している楽曲データの項目を読める", () => {
    const musics = parseMusics(
      JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
    );
    const tyw = musics.find((m) => m.id === "001")!;
    expect(tyw.singers).toContain(21);
    expect(typeof tyw.masterLevel).toBe("number");
    expect(typeof tyw.masterNotes).toBe("number");
    expect(typeof tyw.publishedAt).toBe("number");
    expect(musics.filter((m) => m.singers).length / musics.length).toBeGreaterThan(0.85);
  });
});
