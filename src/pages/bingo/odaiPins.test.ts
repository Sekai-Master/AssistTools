/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BingoMusic } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { fitsCell } from "./odaiDefs";
import {
  type Odai,
  type OdaiCell,
  DEEP_MIN_RATE,
  MAX_ODAI_PINS,
  MAX_RATE,
  ODAI_LEVELS,
  ODAI_LEVEL_KEYS,
  ODAI_THEMES,
  ODAI_THEME_KEYS,
  OVERLAP_LIMIT,
  buildOdaiCandidates,
  buildOdaiCard,
  clashes,
  createRng,
  decodeOdaiSeed,
  encodeOdaiSeed,
  odaiCapsFor,
  odaiLevelOf,
  odaiSongsToHalf,
  odaiThemeFloor,
  replaceOdaiCell,
  resolvePinnedOdais,
  setOdaiCleared,
} from "./odaiLogic";
import { PICK_GROUPS, listPickableOdais, pickSections } from "./odaiPins";
import { ODAI_PINS_STORAGE_KEY, loadOdaiPins, parseSavedPins, saveOdaiPins, summarizeSavedPins } from "./odaiPinStorage";

const MUSICS: BingoMusic[] = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const CANDIDATES = buildOdaiCandidates(MUSICS);
const PICKABLE = listPickableOdais(MUSICS);
const pickable = (key: string) => {
  const o = PICKABLE.find((p) => p.key === key);
  if (!o) throw new Error(`選べるお題に無い: ${key}`);
  return o;
};

// 当てはまる曲の集合。実装のビット集合とは別の道筋で数える
const songsOf = new Map(PICKABLE.map((o) => [o.key, new Set(MUSICS.filter((m) => o.test(m)).map((m) => m.id))]));
const overlap = (a: string, b: string) => {
  const A = songsOf.get(a)!;
  const B = songsOf.get(b)!;
  let n = 0;
  for (const id of A) if (B.has(id)) n++;
  return n / Math.min(A.size, B.size);
};
const inRange = (o: Odai) => o.rate >= DEEP_MIN_RATE && o.rate <= MAX_RATE;
/** 入れたお題と自動のマスが並べない組か（実装とは別に数える。範囲外の入れたお題は同じユニットの色だけ）。 */
const clashesWithPin = (pin: Odai, auto: Odai) =>
  (pin.unit !== undefined && pin.unit === auto.unit) || (inRange(pin) && overlap(pin.key, auto.key) >= OVERLAP_LIMIT);

const cellsOf = (card: readonly OdaiCell[]) =>
  card.filter((c): c is Exclude<OdaiCell, "FREE"> => c !== "FREE").map((c) => c.odai);

// ---- 入れたお題の材料 ----

const ONE_SONG = PICKABLE.filter((o) => o.kind === "creator" && o.count === 1);
const LONG_NAMES = PICKABLE.filter((o) => !fitsCell(o)).sort((a, b) => b.text.length - a.text.length);
/** 1 曲だけの作者のうち、重なりで数えると候補との並べない組がいちばん多い 5 人（範囲外の決まりの確かめ）。 */
const ONE_SONG_HEAVY = [...ONE_SONG]
  .map((o) => ({ o, n: CANDIDATES.filter((c) => overlap(o.key, c.key) >= OVERLAP_LIMIT).length }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 5)
  .map((x) => x.o.key);

const FIXED_SETS: Record<string, string[]> = {
  ミク: ["s21"],
  "割合の大きい 3 つ（ミク・リン・VS）": ["s21", "s22", "u0"],
  "ユニットとそのメンバー": ["u1", "s1", "s2", "s3", "s4"],
  "同じ種類を 5 つ（読みの頭）": ["ra", "rk", "rs", "rt", "rn"],
  "同じ種類を 5 つ（譜面）": ["dm32", "dm33", "de28", "da", "dl26"],
  "同じ種類を 5 つ（作者）": ["c4", "c65", "c10", "c16", "c106"],
  "1 曲だけの作者（重なりの多い 5 人）": ONE_SONG_HEAVY,
  "名前の長い作者 5 人": LONG_NAMES.slice(0, 5).map((o) => o.key),
  "25時のユニット・メンバー・書き下ろしとミク": ["u5", "s17", "w5", "s21", "c286"],
};

/** 乱数の組: ミク・1 曲だけの作者・長い名前・ユニットとそのメンバー・同じ種類を混ぜる。 */
function randomPins(rng: () => number): string[] {
  const pools = [
    ["s21", "s22", "u0"],
    ONE_SONG.map((o) => o.key),
    LONG_NAMES.map((o) => o.key),
    ["u1", "s1", "s2", "w1", "u5", "s17", "s18", "w5", "u2", "s5"],
    ["ra", "rk", "rs", "rt", "c4", "c65", "dm32", "dm33", "a2021", "a2022", "a0"],
    PICKABLE.map((o) => o.key),
  ];
  const k = Math.floor(rng() * (MAX_ODAI_PINS + 1));
  const keys = new Set<string>();
  while (keys.size < k) {
    const pool = pools[Math.floor(rng() * pools.length)];
    keys.add(pool[Math.floor(rng() * pool.length)]);
  }
  return [...keys];
}

/** カードが入れたお題の決まりを守っているか。破れていたら理由を返す。 */
function checkCard(card: readonly OdaiCell[], pins: readonly Odai[], level: (typeof ODAI_LEVEL_KEYS)[number], theme: (typeof ODAI_THEME_KEYS)[number]): string[] {
  const errors: string[] = [];
  if (card.length !== 25) errors.push(`マスの数 ${card.length}`);
  if (card[12] !== "FREE") errors.push("中央が FREE でない");
  if (card.filter((c) => c === "FREE").length !== 1) errors.push("FREE が 1 つでない");
  const cells = cellsOf(card);
  const keys = cells.map((o) => o.key);
  if (new Set(keys).size !== keys.length) errors.push("重複");
  for (const p of pins) if (!keys.includes(p.key)) errors.push(`入れたお題が無い ${p.key}`);
  const pinKeys = new Set(pins.map((p) => p.key));
  const autos = cells.filter((o) => !pinKeys.has(o.key));
  for (const p of pins) for (const a of autos) if (clashesWithPin(p, a)) errors.push(`入れたお題と並べない組 ${p.key} ${a.key}`);
  for (let i = 0; i < autos.length; i++) {
    for (let j = i + 1; j < autos.length; j++) if (clashes(autos[i], autos[j])) errors.push(`自動どうし ${autos[i].key} ${autos[j].key}`);
  }
  const caps = odaiCapsFor(level, theme);
  for (const kind of new Set(autos.map((o) => o.kind))) {
    const pinned = pins.filter((p) => p.kind === kind).length;
    const auto = autos.filter((o) => o.kind === kind).length;
    if (auto > Math.max(0, caps[kind] - pinned)) errors.push(`種類の上限 ${kind} 入れた ${pinned} 自動 ${auto}`);
  }
  const minRate = ODAI_LEVELS[level].minRate;
  for (const a of autos) if (a.rate < minRate) errors.push(`段の割合の下限 ${a.key}`);
  return errors;
}

describe("resolvePinnedOdais（入れたいお題の鍵 → 生成で使うお題）", () => {
  it("候補にあるお題は候補のまま、無いお題は割合と並べない組を付けて戻す。読めない・重複の鍵は落とし、5 つまで", () => {
    const pins = resolvePinnedOdais(["u1", "s21", "zz", "c999999", "u1", "c286", "ra", "rk", "rs"], MUSICS, CANDIDATES);
    expect(pins.map((p) => p.key)).toEqual(["u1", "s21", "c286", "ra", "rk"]);
    expect(pins[0]).toBe(CANDIDATES.find((c) => c.key === "u1"));
    const miku = pins[1];
    expect(miku.rate).toBeCloseTo(songsOf.get("s21")!.size / MUSICS.length, 10);
    expect(miku.rate).toBeGreaterThan(MAX_RATE);
  });

  it("範囲外のお題（ミク・1 曲だけの作者）は、同じユニットの色の印を持つ候補とだけ並べない組になる", () => {
    const [miku, ...oneSong] = resolvePinnedOdais(["s21", ...ONE_SONG_HEAVY], MUSICS, CANDIDATES);
    for (const c of CANDIDATES) expect(clashes(miku, c), c.key).toBe(c.unit === "vs");
    // VS のメンバー（ミク以外）と VS の書き下ろしは自動では入らない
    expect(CANDIDATES.filter((c) => clashes(miku, c)).map((c) => c.key)).toContain("w0");
    for (const p of oneSong) {
      expect(inRange(p)).toBe(false);
      expect(CANDIDATES.some((c) => clashes(p, c))).toBe(false);
    }
  });

  it("範囲内で 1 マスに収まらないだけの作者は、候補と同じ決まり（重なり・同じユニット）で数える", () => {
    const long = LONG_NAMES.filter(inRange);
    expect(long.length).toBeGreaterThan(0);
    for (const p of resolvePinnedOdais(long.slice(0, 5).map((o) => o.key), MUSICS, CANDIDATES)) {
      for (const c of CANDIDATES) expect(clashes(p, c), `${p.key} ${c.key}`).toBe(clashesWithPin(p, c));
    }
  });
});

describe("buildOdaiCard に入れたお題を渡す", () => {
  it.each(Object.entries(FIXED_SETS))("%s: どの段・テーマでも例外を出さず、決まりを守る", (_name, keys) => {
    const pins = resolvePinnedOdais(keys, MUSICS, CANDIDATES);
    expect(pins).toHaveLength(keys.length);
    const rng = createRng(3);
    for (const level of ODAI_LEVEL_KEYS) {
      for (const theme of ODAI_THEME_KEYS) {
        for (let t = 0; t < 3; t++) {
          const card = buildOdaiCard(CANDIDATES, rng, level, theme, pins);
          expect(checkCard(card, pins, level, theme), `${level} ${theme}`).toEqual([]);
        }
      }
    }
  });

  it("段 5 × テーマ 4 × 乱数の組（0〜5 個）で、例外を出さず、決まりを守り、テーマの下限に届く", () => {
    const rng = createRng(20261109);
    let cards = 0;
    let floorShort = 0;
    for (const level of ODAI_LEVEL_KEYS) {
      for (const theme of ODAI_THEME_KEYS) {
        for (let t = 0; t < 12; t++) {
          const keys = randomPins(rng);
          const pins = resolvePinnedOdais(keys, MUSICS, CANDIDATES);
          expect(pins.map((p) => p.key)).toEqual(keys);
          const card = buildOdaiCard(CANDIDATES, rng, level, theme, pins);
          expect(checkCard(card, pins, level, theme), `${level} ${theme} ${keys.join(",")}`).toEqual([]);
          const floor = odaiThemeFloor(CANDIDATES, level, theme, pins);
          const themed = cellsOf(card).filter((o) => ODAI_THEMES[theme].kinds.includes(o.kind)).length;
          if (themed < floor) floorShort++;
          cards++;
        }
      }
    }
    expect(cards).toBe(240);
    expect(floorShort).toBe(0);
  });

  it("入れたお題と並べない組で残りが埋まらなくても、例外を出さずに入れたお題の入ったカードを出す", () => {
    // 候補のうち 10 個としか並べられない、作り物の入れたお題（実データでは起きないが、決まりを緩めて埋める道を通す）
    const keep = new Set(CANDIDATES.slice(0, 10).map((c) => c.key));
    const pin: Odai = { ...pickable("c4"), clashes: new Set(CANDIDATES.filter((c) => !keep.has(c.key)).map((c) => c.key)) };
    const rng = createRng(5);
    for (const level of ODAI_LEVEL_KEYS) {
      const card = buildOdaiCard(CANDIDATES, rng, level, "any", [pin]);
      const keys = cellsOf(card).map((o) => o.key);
      expect(keys).toContain("c4");
      expect(new Set(keys).size).toBe(24);
      expect(card[12]).toBe("FREE");
    }
  });

  it("入れたお題が無ければ、今までと同じカード（同じ乱数の種で同じコード）", () => {
    for (const level of ODAI_LEVEL_KEYS) {
      const a = buildOdaiCard(CANDIDATES, createRng(8), level, "any");
      const b = buildOdaiCard(CANDIDATES, createRng(8), level, "any", []);
      expect(encodeOdaiSeed(b)).toBe(encodeOdaiSeed(a));
    }
  });

  it("入れたお題は 1 か所に固まらない（どの位置にも来る）", () => {
    const pins = resolvePinnedOdais(["u1"], MUSICS, CANDIDATES);
    const rng = createRng(12);
    const positions = new Set<number>();
    for (let t = 0; t < 200; t++) positions.add(buildOdaiCard(CANDIDATES, rng, "normal", "any", pins).findIndex((c) => c !== "FREE" && c.odai.key === "u1"));
    expect(positions.size).toBe(24);
  });

  it("カードの枠の時間と段は、入れたお題を含めたカードの中身から出る（ミクを入れると易しい側のお題が減る）", () => {
    const pins = resolvePinnedOdais(["s21"], MUSICS, CANDIDATES);
    const card = buildOdaiCard(CANDIDATES, createRng(4), "normal", "any", pins);
    const decoded = decodeOdaiSeed(encodeOdaiSeed(card), MUSICS);
    expect(odaiSongsToHalf(decoded)).toBe(odaiSongsToHalf(card));
    expect(odaiLevelOf(decoded)).toBe(odaiLevelOf(card));
  });

  // ★ PR に書く数: 範囲内の入れたお題 1〜2 個のとき、段の曲数ちょうどの目安になるカードの割合（入れないカードと比べる）
  it.each(ODAI_LEVEL_KEYS)("%s: 範囲内の入れたお題 1〜2 個でも、目安の曲数が段の曲数ちょうどになる割合が、入れないカードより 10 ポイント以上は落ちない", (level) => {
    const rng = createRng(31);
    const N = 60;
    const target = ODAI_LEVELS[level].songs;
    let hitNone = 0;
    let hitPinned = 0;
    for (let t = 0; t < N; t++) {
      if (odaiSongsToHalf(buildOdaiCard(CANDIDATES, rng, level)) === target) hitNone++;
      const k = 1 + Math.floor(rng() * 2);
      const keys = new Set<string>();
      while (keys.size < k) keys.add(CANDIDATES[Math.floor(rng() * CANDIDATES.length)].key);
      const pins = resolvePinnedOdais([...keys], MUSICS, CANDIDATES);
      if (odaiSongsToHalf(buildOdaiCard(CANDIDATES, rng, level, "any", pins)) === target) hitPinned++;
    }
    expect(hitPinned / N).toBeGreaterThanOrEqual(hitNone / N - 0.1);
  });
});

describe("odaiThemeFloor に入れたお題を渡す", () => {
  it("入れたお題が無ければ今までと同じ。テーマの種類の入れたお題は下限に数える", () => {
    for (const level of ODAI_LEVEL_KEYS) {
      for (const theme of ODAI_THEME_KEYS) {
        expect(odaiThemeFloor(CANDIDATES, level, theme, [])).toBe(odaiThemeFloor(CANDIDATES, level, theme));
      }
    }
    const rows = resolvePinnedOdais(["ra", "rk", "rs", "rt", "rn"], MUSICS, CANDIDATES);
    expect(odaiThemeFloor(CANDIDATES, "normal", "title", rows)).toBe(ODAI_THEMES.title.floor.normal);
  });
});

describe("replaceOdaiCell（作ったカードの 1 マスを替える）", () => {
  const card = setOdaiCleared(buildOdaiCard(CANDIDATES, createRng(9)), 3, true);

  it("そのマスだけ替わり、埋めた印は外れる。ほかのマスと元のカードは変わらない", () => {
    const miku = pickable("s21");
    const next = replaceOdaiCell(card, 3, miku);
    expect(next[3]).toEqual({ odai: miku, cleared: false });
    next.forEach((c, i) => {
      if (i !== 3) expect(c).toBe(card[i]);
    });
    expect(card[3] !== "FREE" && card[3].cleared).toBe(true);
    // コードはお題の鍵を並べたものなので、そのまま開ける
    const decoded = decodeOdaiSeed(encodeOdaiSeed(next), MUSICS);
    expect(decoded[3] !== "FREE" && decoded[3].odai.key).toBe("s21");
  });

  it("名前の長い作者・1 曲だけの作者にも替えられる", () => {
    const long = LONG_NAMES[0];
    const next = replaceOdaiCell(replaceOdaiCell(card, 0, long), 1, ONE_SONG[0]);
    expect(cellsOf(next).map((o) => o.key)).toEqual(expect.arrayContaining([long.key, ONE_SONG[0].key]));
    expect(odaiSongsToHalf(next)).toBeGreaterThan(0);
  });

  it("ほかのマスにあるお題・FREE のマスは拒む（同じマスを同じお題にするのはよい）", () => {
    const other = card[0] !== "FREE" ? card[0].odai : null;
    expect(() => replaceOdaiCell(card, 3, other!)).toThrow(/もうカードにあります/);
    expect(() => replaceOdaiCell(card, 12, pickable("s21"))).toThrow();
    expect(() => replaceOdaiCell(card, 25, pickable("s21"))).toThrow();
    const same = card[3] !== "FREE" ? card[3].odai : null;
    expect(replaceOdaiCell(card, 3, same!)[3]).toEqual({ odai: same, cleared: false });
  });
});

describe("前の版のコード", () => {
  // ★ この版より前に作ったカード（2026-11-09 の本番で作ったもの）。形は変えていないので、そのまま開ける
  const OLD = "OD1:u1.ra*.c4.dm32.a2021.w2.yi.l1.te.gn.m3.kl.F.s5*.oc.rk.th.c65.da.mo.a0.u9.v6.rs.c10";
  it("読めて、埋めた印も戻る", () => {
    const card = decodeOdaiSeed(OLD, MUSICS);
    expect(card).toHaveLength(25);
    expect(card[12]).toBe("FREE");
    expect(card[1] !== "FREE" && card[1].cleared).toBe(true);
    expect(card[13] !== "FREE" && card[13].odai.key).toBe("s5");
    expect(encodeOdaiSeed(card)).toBe(OLD);
  });
});

describe("選ぶ小窓の一覧（listPickableOdais・pickSections）", () => {
  it("1 曲以上当てはまるすべてのお題（作者・年を含む）で、割合の範囲・1 マスに収まるかでは絞らない", () => {
    expect(PICKABLE.every((o) => o.count >= 1)).toBe(true);
    const keys = new Set(PICKABLE.map((o) => o.key));
    for (const c of CANDIDATES) expect(keys.has(c.key)).toBe(true);
    for (const k of ["s21", "u0", "s22", ...ONE_SONG.slice(0, 3).map((o) => o.key), ...LONG_NAMES.slice(0, 3).map((o) => o.key)]) expect(keys.has(k)).toBe(true);
    expect(PICKABLE.filter((o) => o.kind === "creator").length).toBeGreaterThanOrEqual(300);
    // 種類の絞り込みで、どのお題もどれかの種類に入る
    const grouped = new Set(PICK_GROUPS.flatMap((g) => g.kinds));
    expect(PICKABLE.every((o) => grouped.has(o.kind))).toBe(true);
  });

  it("種類ごとに、曲数の多い順", () => {
    const sections = pickSections(PICKABLE, "", null);
    expect(sections.reduce((a, s) => a + s.items.length, 0)).toBe(PICKABLE.length);
    for (const s of sections) {
      for (let i = 1; i < s.items.length; i++) expect(s.items[i - 1].count).toBeGreaterThanOrEqual(s.items[i].count);
    }
  });

  it("作者名・キャラ名（名前・名字）・文言・札で引け、大文字小文字・ひらがなカタカナを問わない", () => {
    const keysOf = (q: string, group: string | null = null) => pickSections(PICKABLE, q, group).flatMap((s) => s.items.map((o) => o.key));
    expect(keysOf("deco*27")).toContain("c4");
    expect(keysOf("星乃")).toContain("s1");
    expect(keysOf("いちか")).toEqual([]);
    expect(keysOf("みく")).toContain("s21");
    expect(keysOf("ミク")).toContain("s21");
    expect(keysOf("orangestar")).toContain("c10");
    expect(keysOf("MASTER")).toContain("dm32");
    expect(keysOf("ボーカル", "vocal").length).toBeGreaterThanOrEqual(26);
    expect(keysOf("ミク", "creator").every((k) => k.startsWith("c"))).toBe(true);
    expect(keysOf("存在しない名前xyz")).toEqual([]);
  });
});

describe("入れたいお題の保存（odaiPinStorage）", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      raw: () => m.get(ODAI_PINS_STORAGE_KEY) ?? null,
    };
  };

  it("書いて読み直せる。空にしたら消す", () => {
    const s = memory();
    saveOdaiPins(["u1", "s21", "c286"], s);
    expect(loadOdaiPins(s)).toEqual(["u1", "s21", "c286"]);
    saveOdaiPins([], s);
    expect(s.raw()).toBeNull();
    expect(loadOdaiPins(s)).toEqual([]);
  });

  it("壊れた値・形の合わない鍵・重複は黙って落とし、5 つまで", () => {
    expect(parseSavedPins(null)).toEqual([]);
    expect(parseSavedPins("{")).toEqual([]);
    expect(parseSavedPins('{"a":1}')).toEqual([]);
    expect(parseSavedPins('["u1", 3, null, "U1", "u1", "<x>", "s21", "ra", "rk", "rs", "rt"]')).toEqual(["u1", "s21", "ra", "rk", "rs"]);
  });

  it("読み書きで例外が出ても止まらない", () => {
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(loadOdaiPins(broken)).toEqual([]);
    expect(() => saveOdaiPins(["u1"], broken)).not.toThrow();
    expect(loadOdaiPins(null)).toEqual([]);
  });

  it("設定画面の要約は個数。空なら null、配列でなければ読めない", () => {
    expect(summarizeSavedPins('["u1","s21"]', "B")).toBe("2 個");
    expect(summarizeSavedPins("[]", "B")).toBeNull();
    expect(summarizeSavedPins("{", "B")).toBe("B");
    expect(summarizeSavedPins('"u1"', "B")).toBe("B");
  });
});
