/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BingoMusic } from "./bingoLogic";
import { decodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import {
  type OdaiCell,
  type OdaiTheme,
  DEEP_MIN_RATE,
  DEFAULT_ODAI_LEVEL,
  MAX_RATE,
  MIN_RATE,
  ODAI_KIND_CAPS,
  ODAI_LEVELS,
  ODAI_LEVEL_KEYS,
  ODAI_THEMES,
  ODAI_THEME_KEYS,
  OVERLAP_LIMIT,
  THEME_CAP_BONUS,
  buildOdaiCandidates,
  buildOdaiCard,
  clashes,
  createRng,
  decodeOdaiSeed,
  encodeOdaiSeed,
  groupOdaiSongs,
  hasBingo,
  isOdaiSeed,
  odaiCapsFor,
  odaiThemeFloor,
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
    // × (U+00D7) は英字に数えない
    ["きみ×ぼく", "hiragana"],
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

  // ★ 花・春・桜（9 曲）のような語のお題も、曲が増えれば MIN_RATE を割る。そうなっても毎日の更新は止めない
  it("MIN_RATE を下回るお題は、曲の少ない作者を中心に 24 以上（HARD・EXPERT・MASTER で使う）", () => {
    const deep = CANDIDATES.filter((o) => o.rate < MIN_RATE);
    expect(deep.filter((o) => o.kind === "creator").length).toBeGreaterThanOrEqual(24);
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

  it("14 種類（ユニット・歌うキャラ・歌唱 ver.・曲の種類・読みの頭・読み・長さ・曲名・曲名の語・MV・追加・譜面・作り手・作者）がそろう", () => {
    const kinds = new Set(CANDIDATES.map((o) => o.kind));
    expect([...kinds].sort()).toEqual(Object.keys(ODAI_KIND_CAPS).sort());
    expect(kinds.size).toBe(14);
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
      // 札は幅で数える（MASTER は 6 字だが全角 3.3 字ぶん）
      expect(textEm(o.caption)).toBeLessThanOrEqual(4);
      for (const chunk of o.chunks) expect(/[A-Za-z0-9]{8,}/.test(chunk)).toBe(false);
    }
  });
});

describe("曲の種類のお題（書き下ろし・劇場版・コラボ）", () => {
  const byKey = (key: string) => CANDIDATES.find((o) => o.key === key);
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8")
  ) as { id: string; published?: boolean; collab?: string; isNewlyWrittenMusic?: boolean; Unit: string }[];
  const playable = raw.filter((m) => m.published !== false);

  it("楽曲データに、コラボ・タイアップの名前が入っている", () => {
    expect(MUSICS.filter((m) => m.collab !== undefined).length).toBeGreaterThanOrEqual(40);
    expect(MUSICS.filter((m) => m.collab === "劇場版プロジェクトセカイ").length).toBeGreaterThanOrEqual(8);
  });

  it("ユニットの書き下ろしは 6 ユニットぶんあり、当てはまるのはそのユニットの書き下ろしだけ", () => {
    for (const [key, unit] of [["w0", "0_VS"], ["w1", "1_L/n"], ["w2", "2_MMJ"], ["w3", "3_VBS"], ["w4", "4_WxS"], ["w5", "5_25"]]) {
      const o = byKey(key);
      expect(o?.kind).toBe("origin");
      expect(o?.caption).toBe("書下ろし");
      const expected = playable.filter((m) => m.isNewlyWrittenMusic && m.Unit === unit).length;
      expect(MUSICS.filter((m) => o!.test(m)).length).toBe(expected);
    }
  });

  it("劇場版は劇場版プロジェクトセカイの曲だけ", () => {
    const o = byKey("om")!;
    expect(o.text).toBe("劇場版");
    const songs = MUSICS.filter((m) => o.test(m));
    expect(songs.length).toBe(playable.filter((m) => m.collab === "劇場版プロジェクトセカイ").length);
    expect(songs.every((m) => m.collab === "劇場版プロジェクトセカイ")).toBe(true);
  });

  it("コラボは劇場版・エイプリルフールを除いたコラボ・タイアップの曲（遊べない曲は入らない）", () => {
    const o = byKey("oc")!;
    const songs = MUSICS.filter((m) => o.test(m));
    // 期間が過ぎた太鼓の達人タイアップは、楽曲データで遊べない曲になっているので入らない
    expect(songs.some((m) => ["707", "708", "709"].includes(m.id))).toBe(false);
    expect(songs.length).toBeGreaterThanOrEqual(30);
    expect(songs.some((m) => m.collab === "劇場版プロジェクトセカイ")).toBe(false);
    expect(songs.some((m) => /エイプリルフール|ボスラッシュ/.test(m.collab ?? ""))).toBe(false);
    expect(songs.some((m) => m.title === "Bad Apple!! feat.SEKAI")).toBe(true);
  });

  it("どれもお題の候補に入り、コードで開ける", () => {
    // ★ 下限は候補全体の DEEP_MIN_RATE で見る。劇場版は 8 曲で MIN_RATE すれすれ（1.1%）なので、
    //   曲が増えて易しい段から外れても、毎日の楽曲データの更新（npm test）は止めない
    for (const key of ["w0", "w1", "w2", "w3", "w4", "w5", "om", "oc"]) {
      const o = byKey(key);
      expect(o, key).toBeTruthy();
      expect(o!.rate).toBeGreaterThanOrEqual(DEEP_MIN_RATE);
      expect(o!.rate).toBeLessThanOrEqual(MAX_RATE);
    }
    const keys = ["w1", "om", "oc"];
    const odais = [...keys.map((k) => byKey(k)!), ...CANDIDATES.filter((o) => !keys.includes(o.key)).slice(0, 21)];
    const card: OdaiCell[] = [...odais.slice(0, 12), null, ...odais.slice(12)].map((o) =>
      o ? { odai: o, cleared: false } : "FREE"
    );
    expect(decodeOdaiSeed(encodeOdaiSeed(card), MUSICS).slice(0, 3).map((c) => c !== "FREE" && c.odai.key)).toEqual(keys);
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

describe("似たお題を並べない（当てはまる曲の重なり・同じユニット）", () => {
  const byKey = (key: string) => {
    const o = CANDIDATES.find((c) => c.key === key);
    if (!o) throw new Error(`候補に無い: ${key}`);
    return o;
  };
  // 当てはまる曲の集合。実装のビット集合とは別の道筋で数える
  const songsOf = new Map(CANDIDATES.map((o) => [o.key, new Set(MUSICS.filter((m) => o.test(m)).map((m) => m.id))]));
  const overlap = (a: string, b: string) => {
    const A = songsOf.get(a)!;
    const B = songsOf.get(b)!;
    let n = 0;
    for (const id of A) if (B.has(id)) n++;
    return n / Math.min(A.size, B.size);
  };

  it("並べない組は、重なり（|A∩B| / min(|A|,|B|)）が OVERLAP_LIMIT 以上か、同じユニットの色の印を持つ組とちょうど一致する", () => {
    for (const a of CANDIDATES) {
      for (const b of CANDIDATES) {
        if (a.key === b.key) continue;
        const expected = overlap(a.key, b.key) >= OVERLAP_LIMIT || (a.unit !== undefined && a.unit === b.unit);
        expect(clashes(a, b), `${a.key} ${b.key}`).toBe(expected);
      }
    }
  });

  it.each([
    ["dm32", "dm33", "MASTER Lv.32 以上と Lv.33 以上（入れ子）"],
    ["a0", "a2020", "サービス開始時と 2020 年（入れ子）"],
    ["u1", "s1", "ユニットとそのメンバー"],
    ["u1", "w1", "ユニットとその書き下ろし"],
    ["s1", "w1", "メンバーとその書き下ろし"],
    ["s1", "s2", "同じユニットのメンバー"],
  ])("%s と %s は並べない（%s）", (a, b) => {
    expect(clashes(byKey(a), byKey(b))).toBe(true);
    expect(clashes(byKey(b), byKey(a))).toBe(true);
  });

  // ★ VS のメンバーどうしの重なりは 0.3〜0.4 しかなく、重なりの決まりだけでは止まらない。
  //   誰が候補に入るかは割合で変わる（ミクは易しすぎて外れる）ので、候補にいる VS のメンバーで見る
  it("VS のメンバーどうし・VS のメンバーと VS の書き下ろしは並べない（重なりは小さいが同じユニット）", () => {
    const vs = CANDIDATES.filter((o) => o.kind === "singer" && o.unit === "vs");
    expect(vs.length).toBeGreaterThanOrEqual(2);
    expect(overlap(vs[0].key, vs[1].key)).toBeLessThan(OVERLAP_LIMIT);
    for (const a of vs) {
      expect(clashes(a, byKey("w0"))).toBe(true);
      for (const b of vs) if (a !== b) expect(clashes(a, b)).toBe(true);
    }
  });

  it("重ならない組（読みの頭どうし・別のユニット）は並べてよい", () => {
    expect(clashes(byKey("ra"), byKey("rk"))).toBe(false);
    expect(clashes(byKey("u1"), byKey("u2"))).toBe(false);
    expect(clashes(byKey("s1"), byKey("s5"))).toBe(false);
  });

  it.each(ODAI_LEVEL_KEYS)("%s: 作ったカードに、重なる組と同じユニットの色の印が並ばない", (level) => {
    const rng = createRng(41);
    for (let t = 0; t < 60; t++) {
      const cells = buildOdaiCard(CANDIDATES, rng, level).filter((c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE");
      const units = cells.map((c) => c.odai.unit).filter((u) => u !== undefined);
      expect(new Set(units).size).toBe(units.length);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          expect(overlap(cells[i].odai.key, cells[j].odai.key), `${cells[i].odai.key} ${cells[j].odai.key}`).toBeLessThan(
            OVERLAP_LIMIT
          );
        }
      }
    }
  });

  // ★ Nori の不満「似たようなシートばっかりになる」への答え。前の版（#212）は NORMAL で、2 枚に共通するお題が
  //   平均 12.6、1 枚の種類が平均 5.8 だった（2026-11-09 実測）
  it("NORMAL の 2 枚に共通するお題は平均 10 未満、1 枚の中の種類は平均 9 以上", () => {
    const rng = createRng(77);
    let shared = 0;
    let kinds = 0;
    const pairs = 200;
    for (let p = 0; p < pairs; p++) {
      const [a, b] = [buildOdaiCard(CANDIDATES, rng), buildOdaiCard(CANDIDATES, rng)].map((card) =>
        card.filter((c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE").map((c) => c.odai)
      );
      const keys = new Set(a.map((o) => o.key));
      shared += b.filter((o) => keys.has(o.key)).length;
      kinds += new Set(a.map((o) => o.kind)).size;
    }
    expect(shared / pairs).toBeLessThan(10);
    expect(kinds / pairs).toBeGreaterThanOrEqual(9);
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

describe("テーマつきのカード（ODAI_THEMES）", () => {
  const THEMES = ODAI_THEME_KEYS.filter((t) => t !== "any");
  const COMBOS = THEMES.flatMap((theme) => ODAI_LEVEL_KEYS.map((level) => [theme, level] as const));
  const themedCount = (card: readonly OdaiCell[], theme: OdaiTheme) =>
    card.filter((c) => c !== "FREE" && ODAI_THEMES[theme].kinds.includes(c.odai.kind)).length;

  it("テーマを渡さなければおまかせ（\"any\" を渡したのと同じカード）。おまかせの下限は 0", () => {
    for (const level of ODAI_LEVEL_KEYS) {
      const a = buildOdaiCard(CANDIDATES, createRng(8), level);
      const b = buildOdaiCard(CANDIDATES, createRng(8), level, "any");
      expect(encodeOdaiSeed(b)).toBe(encodeOdaiSeed(a));
      expect(odaiThemeFloor(CANDIDATES, level, "any")).toBe(0);
    }
  });

  it("テーマどうしで種類は重ならず、作者はどのテーマにも入れない", () => {
    const kinds = THEMES.flatMap((t) => ODAI_THEMES[t].kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).not.toContain("creator");
  });

  it.each(COMBOS)("%s × %s: テーマのマスが下限以上で、上限・割合の下限・並べない組を守り、目安の曲数は段の曲数ちょうど", (theme, level) => {
    const def = ODAI_LEVELS[level];
    const floor = odaiThemeFloor(CANDIDATES, level, theme);
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThanOrEqual(ODAI_THEMES[theme].floor[level]);
    const rng = createRng(59);
    for (let t = 0; t < 100; t++) {
      const card = buildOdaiCard(CANDIDATES, rng, level, theme);
      expect(themedCount(card, theme)).toBeGreaterThanOrEqual(floor);
      expect(odaiSongsToHalf(card)).toBe(def.songs);
      const cells = card.filter((c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE").map((c) => c.odai);
      expect(new Set(cells.map((o) => o.key)).size).toBe(24);
      const count: Record<string, number> = {};
      for (const o of cells) count[o.kind] = (count[o.kind] ?? 0) + 1;
      // テーマの種類だけ上限が THEME_CAP_BONUS 増える
      const caps = odaiCapsFor(level, theme);
      for (const [kind, n] of Object.entries(count)) expect(n).toBeLessThanOrEqual(caps[kind as keyof typeof caps]);
      expect(cells.every((o) => o.rate >= def.minRate)).toBe(true);
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(clashes(cells[i], cells[j])).toBe(false);
    }
  });

  it.each(COMBOS)("%s × %s: 実測で、半分の人が BINGO になる曲数が段の曲数の ±15%", (theme, level) => {
    const rng = createRng(2026);
    const runs: number[] = [];
    for (let t = 0; t < 400; t++) runs.push(songsToBingo(buildOdaiCard(CANDIDATES, rng, level, theme), rng));
    runs.sort((a, b) => a - b);
    const median = runs[runs.length >> 1];
    const target = ODAI_LEVELS[level].songs;
    expect(median).toBeGreaterThanOrEqual(Math.floor(target * 0.85));
    expect(median).toBeLessThanOrEqual(Math.ceil(target * 1.15));
  });

  it("テーマを選んだときは、テーマの種類だけ上限を THEME_CAP_BONUS 足す（作者・ほかの種類・おまかせは段の上限のまま）", () => {
    for (const level of ODAI_LEVEL_KEYS) {
      const base = ODAI_LEVELS[level].caps;
      expect(odaiCapsFor(level, "any")).toEqual(base);
      for (const theme of THEMES) {
        const caps = odaiCapsFor(level, theme);
        for (const kind of Object.keys(base) as (keyof typeof base)[]) {
          const bonus = ODAI_THEMES[theme].kinds.includes(kind) ? THEME_CAP_BONUS : 0;
          expect(caps[kind], `${theme} ${level} ${kind}`).toBe(base[kind] + bonus);
        }
        expect(caps.creator).toBe(base.creator);
      }
    }
  });

  // ★ 曲が増えて候補が割合の範囲から外れたり、並べない組が増えたりしても、届かない下限を課さない
  it.each([
    // 譜面は Lv.32 以上・Lv.33 以上・EXPERT Lv.28 以上が互いに並べない組なので 4 つまで（上限の 5 ではない）。譜面 4＋追加 4
    ["chart", ["kl", "m2", "mo", "m3"], 8, "作り手と MV が全部外れる"],
    ["title", ["l0", "l1", "yi", "yn", "y4", "gn", "gf", "gc", "gl", "gw", "gs"], 10, "曲名と読みの頭だけが残る"],
    // 残るのはユニットの色の印を持つお題だけ。同じユニットは 1 枚に 1 つなので、色の数（6）まで
    ["singer", ["u9", "om", "oc", "v6", "va"], 6, "色の印を持たないお題が全部外れる"],
  ] as const)("%s: 候補から %j が外れたら、下限は %i に下がり、そのカードが作れる（%s）", (theme, keys, expected, _why) => {
    const without = CANDIDATES.filter((o) => !(keys as readonly string[]).includes(o.key));
    for (const level of ["easy", "master"] as const) {
      const floor = odaiThemeFloor(without, level, theme);
      expect(floor).toBe(expected);
      const rng = createRng(61);
      for (let t = 0; t < 20; t++) {
        const card = buildOdaiCard(without, rng, level, theme);
        expect(themedCount(card, theme)).toBeGreaterThanOrEqual(floor);
        expect(odaiSongsToHalf(card)).toBe(ODAI_LEVELS[level].songs);
      }
    }
  });
});

describe("groupOdaiSongs（コラボのお題はコラボごとに区切る）", () => {
  const collab = CANDIDATES.find((o) => o.key === "oc")!;

  it("区切りはコラボの名前ごと。曲の多いコラボから、同じ数なら名前の順。曲は一覧と同じ", () => {
    const groups = groupOdaiSongs(collab, MUSICS);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      expect(g.songs.every((m) => m.collab === g.label)).toBe(true);
      expect(g.total).toBe(g.songs.length);
    }
    for (let i = 1; i < groups.length; i++) {
      const [a, b] = [groups[i - 1], groups[i]];
      expect(a.total > b.total || (a.total === b.total && a.label.localeCompare(b.label, "ja") <= 0)).toBe(true);
    }
    expect(groups.flatMap((g) => g.songs.map((m) => m.id)).sort()).toEqual(
      listOdaiSongs(collab, MUSICS).map((m) => m.id).sort()
    );
  });

  it("絞り込みは区切りの中で効き、当てはまる曲が無い区切りは出さない。見出しの数は絞り込む前のまま", () => {
    const all = groupOdaiSongs(collab, MUSICS);
    // 曲の多いコラボの 1 曲で絞る（見出しの数が絞り込み後の数とずれるように）
    expect(all[0].total).toBeGreaterThanOrEqual(2);
    const target = all[0].songs[0];
    const narrowed = groupOdaiSongs(collab, MUSICS, target.title);
    expect(narrowed.map((g) => g.label)).toContain(target.collab);
    expect(narrowed.length).toBeLessThan(all.length);
    const g = narrowed.find((x) => x.label === target.collab)!;
    expect(g.songs.map((m) => m.id)).toContain(target.id);
    expect(g.songs.length).toBeLessThan(g.total);
    expect(g.total).toBe(all[0].total);
    expect(groupOdaiSongs(collab, MUSICS, "存在しない曲名xyz")).toEqual([]);
  });

  it("区切りを持たないお題は空", () => {
    expect(groupOdaiSongs(CANDIDATES.find((o) => o.key === "u1")!, MUSICS)).toEqual([]);
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
  it("段の曲数は EASY < NORMAL < HARD < EXPERT < MASTER。既定は NORMAL の 20 曲（これまでのカード）", () => {
    const songs = ODAI_LEVEL_KEYS.map((k) => ODAI_LEVELS[k].songs);
    expect([...songs].sort((a, b) => a - b)).toEqual(songs);
    expect(new Set(songs).size).toBe(songs.length);
    expect(DEFAULT_ODAI_LEVEL).toBe("normal");
    expect(ODAI_LEVELS.normal.songs).toBe(20);
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

  it.each(ODAI_LEVEL_KEYS)("%s: 作ったカードの目安の曲数は段の曲数ちょうどで、段を当てられる", (level) => {
    const rng = createRng(23);
    for (let t = 0; t < 200; t++) {
      const card = buildOdaiCard(CANDIDATES, rng, level);
      expect(odaiSongsToHalf(card)).toBe(ODAI_LEVELS[level].songs);
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
