/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusics } from "./useBingoMusics";
import { buildOdaiCandidates, buildOdaiCard, createRng } from "./odaiLogic";
import { cardCode } from "./bingoShare";
import { restoreInitial } from "./bingoRestore";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const ODAI = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(4));
const CODE = cardCode({ kind: "odai", card: ODAI });

describe("restoreInitial（開いたときのカード）", () => {
  it("初めて開いた（保存もリンクも無い）ときは、お題ビンゴのカードを 1 枚作っておく", () => {
    const init = restoreInitial(MUSICS, null, null);
    expect(init.kind).toBe("odai");
    expect(init.odai).toHaveLength(25);
    expect(init.odai![12]).toBe("FREE");
    expect(init.song).toBeNull();
  });

  it("保存された途中経過があれば、それを戻す（新しく作らない）", () => {
    const init = restoreInitial(MUSICS, null, { kind: "odai", odai: CODE });
    expect(cardCode({ kind: "odai", card: init.odai! })).toBe(CODE);
  });

  it("曲名ビンゴだけ保存されていれば、お題のカードは作らない", () => {
    const init = restoreInitial(MUSICS, null, { kind: "song" });
    expect(init.odai).toBeNull();
    expect(init.kind).toBe("song");
  });

  it("リンクがあればリンクのカードを出す（初めてでも作らない）", () => {
    const init = restoreInitial(MUSICS, CODE, null);
    expect(cardCode({ kind: "odai", card: init.odai! })).toBe(CODE);
    expect(init.viewing).toBeNull();
    expect(init.linked).toBe("odai");
  });

  it("埋めたマスのある同じ種類のカードがあれば、リンクのカードは「見るだけ」にし、今のカードは変えない", () => {
    const own = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(9));
    const first = own.findIndex((c) => c !== "FREE");
    own[first] = { ...(own[first] as Exclude<(typeof own)[number], "FREE">), cleared: true };
    const ownCode = cardCode({ kind: "odai", card: own });
    const init = restoreInitial(MUSICS, CODE, { kind: "song", odai: ownCode });
    expect(cardCode({ kind: "odai", card: init.odai! })).toBe(ownCode);
    expect(init.viewing && cardCode(init.viewing)).toBe(CODE);
    expect(init.linked).toBe("odai");
    expect(init.kind).toBe("odai");
  });

  it("読めないリンクなら文言を出し、カードは作らない", () => {
    const init = restoreInitial(MUSICS, "OD1:broken", null);
    expect(init.error).toMatch(/リンク/);
    expect(init.odai).toBeNull();
    expect(init.linked).toBeNull();
  });

  it("楽曲データが届く前は何もしない", () => {
    expect(restoreInitial([], null, null).odai).toBeNull();
  });
});
