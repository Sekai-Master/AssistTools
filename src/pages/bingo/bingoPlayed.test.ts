/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusics } from "./useBingoMusics";
import { type Cell, buildRandomCard } from "./bingoLogic";
import { buildOdaiCandidates, buildOdaiCard, createRng } from "./odaiLogic";
import { matchingCells } from "./bingoPlayed";
import { withClearedAll } from "./bingoProgress";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const ODAI = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(3));
const SONG = buildRandomCard(MUSICS, "free", null);

describe("matchingCells（遊んだ曲から当てはまるマス）", () => {
  it("お題: お題の test が通るマスだけを、カードの番号順に返す", () => {
    for (const m of MUSICS.slice(0, 60)) {
      const expected = ODAI.flatMap((c, i) => (c !== "FREE" && c.odai.test(m) ? [i] : []));
      expect(matchingCells(ODAI, m)).toEqual(expected);
    }
  });

  it("お題: 当てはまるマスがある曲も、無い曲も実データにある", () => {
    const counts = MUSICS.map((m) => matchingCells(ODAI, m).length);
    expect(counts.some((n) => n > 0)).toBe(true);
    expect(counts.some((n) => n === 0)).toBe(true);
  });

  it("曲名: 同じ曲のマスだけを返す。FREE は数えない", () => {
    const onCard = SONG.find((c): c is Exclude<Cell, "FREE"> => c !== "FREE")!;
    expect(matchingCells(SONG, onCard)).toEqual([SONG.indexOf(onCard)]);
    const ids = new Set(SONG.flatMap((c) => (c === "FREE" ? [] : [c.id])));
    const offCard = MUSICS.find((m) => !ids.has(m.id))!;
    expect(matchingCells(SONG, offCard)).toEqual([]);
  });
});

describe("withClearedAll（まとめて埋める）", () => {
  it("指定したマスだけを埋め、元のカードは変えない", () => {
    const next = withClearedAll(ODAI, [0, 1, 12]);
    expect(next.map((c) => c !== "FREE" && c.cleared)).toEqual(ODAI.map((_, i) => i === 0 || i === 1));
    expect(next[12]).toBe("FREE");
    expect(ODAI.every((c) => c === "FREE" || !c.cleared)).toBe(true);
  });

  it("埋めてあるマスは埋めたまま", () => {
    const once = withClearedAll(ODAI, [3]);
    const twice = withClearedAll(once, [3, 4]);
    expect(twice[3]).toMatchObject({ cleared: true });
    expect(twice[4]).toMatchObject({ cleared: true });
  });
});
