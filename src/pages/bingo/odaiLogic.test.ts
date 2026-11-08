/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BingoMusic } from "./bingoLogic";
import { decodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import {
  type OdaiCell,
  DEEP_MIN_RATE,
  DEFAULT_ODAI_LEVEL,
  MAX_RATE,
  MIN_RATE,
  ODAI_KIND_CAPS,
  ODAI_LEVELS,
  ODAI_LEVEL_KEYS,
  buildOdaiCandidates,
  buildOdaiCard,
  createRng,
  decodeOdaiSeed,
  encodeOdaiSeed,
  hasBingo,
  isOdaiSeed,
  listOdaiSongs,
  setOdaiCleared,
  odaiLevelOf,
  odaiSongsToHalf,
  textEm,
  readingRow,
  titleKind,
} from "./odaiLogic";

// 実データ（public の楽曲マスタ）。お題の割合と難しさはこれで測る。
const MUSICS: BingoMusic[] = parseMusics(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8")
  )
);
const CANDIDATES = buildOdaiCandidates(MUSICS);

/** 全曲から一様に songs 曲流したとき、ビンゴになったカードの割合。 */
function bingoRate(cards: number, songs: number, seed: number): number {
  const rng = createRng(seed);
  let bingo = 0;
  for (let t = 0; t < cards; t++) {
    const card = buildOdaiCard(CANDIDATES, rng);
    const filled = card.map((c) => c === "FREE");
    for (let s = 0; s < songs; s++) {
      const m = MUSICS[Math.floor(rng() * MUSICS.length)];
      card.forEach((c, i) => {
        if (c !== "FREE" && c.odai.test(m)) filled[i] = true;
      });
    }
    if (hasBingo(filled)) bingo++;
  }
  return bingo / cards;
}

describe("readingRow（読みの最初の行）", () => {
  it("清音・濁音・半濁音・カタカナ・小書きを行にまとめる", () => {
    expect(readingRow("てるゆあわーるど")).toBe("t");
    expect(readingRow("がらす")).toBe("k");
    expect(readingRow("ぱれっと")).toBe("h");
    expect(readingRow("ゔぃらん")).toBe("a");
    expect(readingRow("ヴィラン")).toBe("a");
    expect(readingRow("カタカナ")).toBe("k");
    expect(readingRow("ゃ")).toBe("y");
    expect(readingRow("んっあっあっ")).toBe("w");
  });

  it("かな以外・空は行なし", () => {
    expect(readingRow("")).toBeNull();
    expect(readingRow(undefined)).toBeNull();
    expect(readingRow("abc")).toBeNull();
  });
});

describe("titleKind（曲名の文字の種類。数字・記号・空白は数えない）", () => {
  it.each([
    ["Tell Your World", "latin"],
    ["Glory Steady Go!", "latin"],
    ["千本桜", "kanji"],
    ["威風堂々", "kanji"],
    ["いーあるふぁんくらぶ", "hiragana"],
    ["ぼうけんのしょがきえました！", "hiragana"],
    ["potatoになっていく", null],
    ["初音ミクの消失", null],
    ["ロキ", null],
  ])("%s → %s", (title, kind) => {
    expect(titleKind(title)).toBe(kind);
  });
});

describe("buildOdaiCandidates（実データから計算）", () => {
  it("当てはまる割合はすべて DEEP_MIN_RATE〜MAX_RATE（30% を超える易しいものは無い）", () => {
    expect(CANDIDATES.filter((o) => o.rate >= MIN_RATE).length).toBeGreaterThanOrEqual(30);
    for (const o of CANDIDATES) {
      expect(o.rate).toBeGreaterThanOrEqual(DEEP_MIN_RATE);
      expect(o.rate).toBeLessThanOrEqual(MAX_RATE);
    }
  });

  it("MIN_RATE を下回るのは作者のお題だけ（曲の少ない作者は EXPERT・MASTER で使う）", () => {
    const deep = CANDIDATES.filter((o) => o.rate < MIN_RATE);
    expect(deep.length).toBeGreaterThanOrEqual(24);
    expect(deep.every((o) => o.kind === "creator")).toBe(true);
  });

  it("割合は実データの数え上げと一致する", () => {
    for (const o of CANDIDATES) {
      const n = MUSICS.filter((m) => o.test(m)).length;
      expect(o.rate).toBeCloseTo(n / MUSICS.length, 10);
    }
  });

  it("バーチャル・シンガー（約 40%）は外れ、ほかのユニットは入る", () => {
    const keys = CANDIDATES.map((o) => o.key);
    expect(keys).not.toContain("u0");
    for (const k of ["u1", "u2", "u3", "u4", "u5", "u9"]) expect(keys).toContain(k);
  });

  it("ユニット・読み・長さ・曲名・作者の 5 種類がそろう", () => {
    const kinds = new Set(CANDIDATES.map((o) => o.kind));
    expect([...kinds].sort()).toEqual(["creator", "length", "row", "title", "unit"]);
  });

  it("易しい（10%〜）・中くらい（4〜10%）・難しい（〜4%）がそれぞれある", () => {
    expect(CANDIDATES.some((o) => o.rate >= 0.1)).toBe(true);
    expect(CANDIDATES.some((o) => o.rate >= 0.04 && o.rate < 0.1)).toBe(true);
    expect(CANDIDATES.some((o) => o.rate < 0.04)).toBe(true);
  });

  it("作者のお題は creatorArtistId を鍵にし、名前を文言にする", () => {
    const deco = CANDIDATES.find((o) => o.key === "c4");
    expect(deco?.text).toBe("DECO*27");
    expect(deco?.kind).toBe("creator");
  });

  it("作者名は記号の後ろと、かな・漢字の切り替わりで区切る（英字の途中では区切らない）", () => {
    const chunksOf = (name: string) => CANDIDATES.find((o) => o.text === name)?.chunks;
    expect(chunksOf("ナユタン星人")).toEqual(["ナユタン", "星人"]);
    expect(chunksOf("かいりきベア")).toEqual(["かいりき", "ベア"]);
    expect(chunksOf("cosMo@暴走P")).toEqual(["cosMo@", "暴走P"]);
    expect(chunksOf("DECO*27")).toEqual(["DECO*", "27"]);
    expect(chunksOf("みきとP")).toEqual(["みきとP"]);
    expect(chunksOf("emon(Tes.)")).toEqual(["emon", "(Tes.)"]);
  });

  it("1 マスに 3 行で収まらない長い名前は使わない", () => {
    expect(CANDIDATES.every((o) => textEm(o.text) <= 10)).toBe(true);
    expect(CANDIDATES.some((o) => o.text === "ビートまりお×まろん")).toBe(true);
    expect(CANDIDATES.some((o) => o.text === "ワンダフル☆オポチュニティ！")).toBe(false);
  });

  it("お題の文言は短い（区切りの 1 つが長すぎない）", () => {
    for (const o of CANDIDATES) {
      expect(o.caption.length).toBeLessThanOrEqual(4);
      for (const chunk of o.chunks) expect(/[A-Za-z0-9]{8,}/.test(chunk)).toBe(false);
    }
  });
});

describe("buildOdaiCard", () => {
  it("25 マス・中央は FREE・お題は重ならない・種類ごとの上限を守る", () => {
    const rng = createRng(1);
    for (let t = 0; t < 50; t++) {
      const card = buildOdaiCard(CANDIDATES, rng);
      expect(card).toHaveLength(25);
      expect(card[12]).toBe("FREE");
      const cells = card.filter((c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE");
      expect(cells).toHaveLength(24);
      expect(new Set(cells.map((c) => c.odai.key)).size).toBe(24);
      expect(cells.every((c) => !c.cleared)).toBe(true);
      const count: Record<string, number> = {};
      for (const c of cells) count[c.odai.kind] = (count[c.odai.kind] ?? 0) + 1;
      for (const [kind, n] of Object.entries(count)) {
        expect(n).toBeLessThanOrEqual(ODAI_KIND_CAPS[kind as keyof typeof ODAI_KIND_CAPS]);
      }
    }
  });

  it("同じ乱数の種なら同じカード（決定的）", () => {
    const a = buildOdaiCard(CANDIDATES, createRng(42));
    const b = buildOdaiCard(CANDIDATES, createRng(42));
    expect(encodeOdaiSeed(a)).toBe(encodeOdaiSeed(b));
  });

  it("候補が 24 に足りなければ例外", () => {
    expect(() => buildOdaiCard(CANDIDATES.slice(0, 10), createRng(1))).toThrow();
  });

  // ★ 難しさの目安: 全曲から一様に流れるとして、20 曲でビンゴがおよそ半分
  it("2,000 枚 × 20 曲でビンゴの割合が 35〜65%", () => {
    const r20 = bingoRate(2000, 20, 2026);
    expect(r20).toBeGreaterThanOrEqual(0.35);
    expect(r20).toBeLessThanOrEqual(0.65);
  });

  it("曲数が増えるほどビンゴしやすい（10 曲 < 20 曲 < 30 曲）", () => {
    const r10 = bingoRate(1000, 10, 7);
    const r20 = bingoRate(1000, 20, 7);
    const r30 = bingoRate(1000, 30, 7);
    expect(r10).toBeLessThan(r20);
    expect(r20).toBeLessThan(r30);
  });
});

describe("hasBingo", () => {
  it("縦・横・斜めの 12 本のどれかがそろえば true", () => {
    const none = Array(25).fill(false);
    expect(hasBingo(none)).toBe(false);
    const row = none.map((_, i) => i >= 5 && i < 10);
    expect(hasBingo(row)).toBe(true);
    const col = none.map((_, i) => i % 5 === 3);
    expect(hasBingo(col)).toBe(true);
    const diag = none.map((_, i) => [4, 8, 12, 16, 20].includes(i));
    expect(hasBingo(diag)).toBe(true);
    const almost = none.map((_, i) => [0, 6, 12, 18].includes(i));
    expect(hasBingo(almost)).toBe(false);
  });
});

describe("お題のシード値", () => {
  const card = buildOdaiCard(CANDIDATES, createRng(5)).map((c, i) =>
    c === "FREE" ? c : { ...c, cleared: i % 4 === 0 }
  );

  it("目印付きで、曲名ビンゴの 50 文字シードと区別できる", () => {
    const seed = encodeOdaiSeed(card);
    expect(isOdaiSeed(seed)).toBe(true);
    expect(isOdaiSeed(` ${seed} `)).toBe(true);
    expect(isOdaiSeed("A".repeat(50))).toBe(false);
    // 目印の大文字・小文字は問わない
    const lower = seed.replace("OD1:", "od1:");
    expect(isOdaiSeed(lower)).toBe(true);
    expect(decodeOdaiSeed(lower, MUSICS)).toHaveLength(25);
  });

  it("往復で同じお題・同じ埋めた状態に戻る", () => {
    const decoded = decodeOdaiSeed(encodeOdaiSeed(card), MUSICS);
    expect(decoded).toHaveLength(25);
    decoded.forEach((c, i) => {
      const orig = card[i];
      if (orig === "FREE") {
        expect(c).toBe("FREE");
      } else {
        expect(c).not.toBe("FREE");
        if (c === "FREE") return;
        expect(c.odai.key).toBe(orig.odai.key);
        expect(c.odai.text).toBe(orig.odai.text);
        expect(c.cleared).toBe(orig.cleared);
      }
    });
  });

  it("曲の並びが変わっても同じお題に戻る（安定した鍵）", () => {
    const seed = encodeOdaiSeed(card);
    const reversed = [...MUSICS].reverse();
    const a = decodeOdaiSeed(seed, MUSICS).map((c) => (c === "FREE" ? "F" : c.odai.text));
    const b = decodeOdaiSeed(seed, reversed).map((c) => (c === "FREE" ? "F" : c.odai.text));
    expect(b).toEqual(a);
  });

  it("割合の範囲から外れた作者でも、データにいれば戻せる", () => {
    const rare = MUSICS.find((m) => m.creatorArtistId !== undefined && !CANDIDATES.some((o) => o.key === `c${m.creatorArtistId}`));
    expect(rare).toBeDefined();
    const seed = encodeOdaiSeed(card).split(".");
    seed[1] = `c${rare!.creatorArtistId}`;
    const decoded = decodeOdaiSeed(seed.join("."), MUSICS);
    const cell = decoded[1];
    expect(cell !== "FREE" && cell.odai.text).toBe(rare!.artistName);
  });

  it("読めないシードは分かるエラー", () => {
    const seed = encodeOdaiSeed(card);
    const parts = seed.split(".");
    expect(() => decodeOdaiSeed("OD1:u1.u2", MUSICS)).toThrow(/25/);
    const withCell1 = (token: string) => [parts[0], token, ...parts.slice(2)].join(".");
    expect(() => decodeOdaiSeed(withCell1("zz"), MUSICS)).toThrow(/お題/);
    expect(() => decodeOdaiSeed(withCell1("c999999"), MUSICS)).toThrow(/作者/);
    // c04 は c4 と同じ作者に解決されて重複を見逃すので受けない
    expect(() => decodeOdaiSeed(withCell1("c04"), MUSICS)).toThrow(/お題/);
    // FREE は中央だけ
    const movedFree = [...parts];
    movedFree[1] = "F";
    expect(() => decodeOdaiSeed(movedFree.join("."), MUSICS)).toThrow(/FREE/);
    // 同じお題が 2 回
    const dup = [...parts];
    dup[2] = dup[1];
    expect(() => decodeOdaiSeed(dup.join("."), MUSICS)).toThrow(/重複/);
  });

  it("曲名ビンゴの 50 文字シードは今まで通り読める", () => {
    const legacy = MUSICS.slice(0, 25)
      .map((m, i) => {
        if (i === 12) return "AA";
        const id = parseInt(m.id, 10);
        const b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        return b[Math.floor(id / 64)] + b[id % 64];
      })
      .join("");
    expect(isOdaiSeed(legacy)).toBe(false);
    const decoded = decodeSeed(legacy, MUSICS);
    expect(decoded[12]).toBe("FREE");
    expect(decoded[0] !== "FREE" && decoded[0].id).toBe(MUSICS[0].id);
  });
});

describe("listOdaiSongs（お題に当てはまる曲の一覧）", () => {
  it("お題の判定そのものと同じ曲が、読み順で並ぶ", () => {
    for (const o of CANDIDATES) {
      const list = listOdaiSongs(o, MUSICS);
      expect(list.map((m) => m.id).sort()).toEqual(MUSICS.filter((m) => o.test(m)).map((m) => m.id).sort());
      for (let i = 1; i < list.length; i++) {
        expect((list[i - 1].pronunciation ?? "").localeCompare(list[i].pronunciation ?? "", "ja")).toBeLessThanOrEqual(0);
      }
    }
  });

  it("曲名・読みで絞り込める（大文字小文字・カタカナの読みも問わない）", () => {
    const deco = CANDIDATES.find((o) => o.key === "c4")!;
    const all = listOdaiSongs(deco, MUSICS);
    const byTitle = listOdaiSongs(deco, MUSICS, "ヴァンパイア");
    expect(byTitle.map((m) => m.title)).toContain("ヴァンパイア");
    expect(byTitle.length).toBeLessThan(all.length);
    const target = all[0];
    expect(listOdaiSongs(deco, MUSICS, target.title.toUpperCase()).map((m) => m.id)).toContain(target.id);
    const reading = target.pronunciation!.slice(0, 3);
    const kata = [...reading].map((c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).join("");
    expect(listOdaiSongs(deco, MUSICS, kata).map((m) => m.id)).toContain(target.id);
    expect(listOdaiSongs(deco, MUSICS, "  ")).toHaveLength(all.length);
    expect(listOdaiSongs(deco, MUSICS, "存在しない曲名xyz")).toHaveLength(0);
  });
});

describe("setOdaiCleared", () => {
  it("指定したマスだけ埋める／戻す（元のカードは変えない）。FREE は変えない", () => {
    const card = buildOdaiCard(CANDIDATES, createRng(9));
    const filled = setOdaiCleared(card, 0, true);
    expect(filled[0] !== "FREE" && filled[0].cleared).toBe(true);
    expect(card[0] !== "FREE" && card[0].cleared).toBe(false);
    expect(encodeOdaiSeed(filled).split(".")[0].endsWith("*")).toBe(true);
    const back = setOdaiCleared(filled, 0, false);
    expect(encodeOdaiSeed(back)).toBe(encodeOdaiSeed(card));
    expect(setOdaiCleared(card, 12, true)[12]).toBe("FREE");
  });
});

/** 1 枚のカードを全曲から一様に流して、何曲目に BINGO になったか。 */
function songsToBingo(card: readonly OdaiCell[], rng: () => number, max = 400): number {
  const filled = card.map((c) => c === "FREE");
  for (let s = 1; s <= max; s++) {
    const m = MUSICS[Math.floor(rng() * MUSICS.length)];
    card.forEach((c, i) => {
      if (c !== "FREE" && c.odai.test(m)) filled[i] = true;
    });
    if (hasBingo(filled)) return s;
  }
  return Infinity;
}

describe("難易度（ODAI_LEVELS）", () => {
  it("段の曲数は EASY < NORMAL < HARD < EXPERT < MASTER。既定は HARD の 20 曲", () => {
    const songs = ODAI_LEVEL_KEYS.map((k) => ODAI_LEVELS[k].songs);
    expect([...songs].sort((a, b) => a - b)).toEqual(songs);
    expect(new Set(songs).size).toBe(songs.length);
    expect(DEFAULT_ODAI_LEVEL).toBe("hard");
    expect(ODAI_LEVELS.hard.songs).toBe(20);
  });

  it.each(ODAI_LEVEL_KEYS)("%s: 種類ごとの上限と、割合の下限を守る", (level) => {
    const def = ODAI_LEVELS[level];
    const rng = createRng(17);
    for (let t = 0; t < 20; t++) {
      const cells = buildOdaiCard(CANDIDATES, rng, level).filter(
        (c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE"
      );
      expect(new Set(cells.map((c) => c.odai.key)).size).toBe(24);
      const count: Record<string, number> = {};
      for (const c of cells) count[c.odai.kind] = (count[c.odai.kind] ?? 0) + 1;
      for (const [kind, n] of Object.entries(count)) {
        expect(n).toBeLessThanOrEqual(def.caps[kind as keyof typeof def.caps]);
      }
      expect(cells.every((c) => c.odai.rate >= def.minRate)).toBe(true);
    }
  });

  it.each(ODAI_LEVEL_KEYS)("%s: 作ったカードの目安の曲数は段の曲数（±1）で、段を当てられる", (level) => {
    const rng = createRng(23);
    for (let t = 0; t < 30; t++) {
      const card = buildOdaiCard(CANDIDATES, rng, level);
      expect(Math.abs(odaiSongsToHalf(card) - ODAI_LEVELS[level].songs)).toBeLessThanOrEqual(1);
      expect(odaiLevelOf(card)).toBe(level);
    }
  });

  // ★ 難易度の数字の意味: 全曲から一様に流れるとして、半分の人が BINGO になる曲数
  it.each(ODAI_LEVEL_KEYS)("%s: 実測で、半分の人が BINGO になる曲数が段の曲数の ±15%", (level) => {
    const rng = createRng(2026);
    const runs: number[] = [];
    for (let t = 0; t < 400; t++) runs.push(songsToBingo(buildOdaiCard(CANDIDATES, rng, level), rng));
    runs.sort((a, b) => a - b);
    const median = runs[runs.length >> 1];
    const target = ODAI_LEVELS[level].songs;
    expect(median).toBeGreaterThanOrEqual(Math.floor(target * 0.85));
    expect(median).toBeLessThanOrEqual(Math.ceil(target * 1.15));
  });

  it("目安の曲数は、埋めたマスに左右されない（カードのお題だけで決まる）", () => {
    const card = buildOdaiCard(CANDIDATES, createRng(31));
    expect(odaiSongsToHalf(setOdaiCleared(card, 0, true))).toBe(odaiSongsToHalf(card));
  });
});
