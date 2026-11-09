import { describe, expect, it } from "vitest";
import {
  EMPTY_MULTI,
  MULTI_STORAGE_KEY,
  type SavedMultiCard,
  cleanCardName,
  isPaused,
  loadMulti,
  parseMultiObject,
  parseSavedMulti,
  saveMulti,
  summarizeSavedMulti,
  withPaused,
} from "./multiStorage";

const card = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  name: "",
  code: "OD1:u1.u2",
  addedAt: 1_790_000_000_000,
  paused: [],
  ...over,
});

function memoryStorage(initial: Record<string, string> = {}, throws = false) {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (throws) throw new Error("denied");
  };
  return {
    data,
    getItem: (k: string) => (guard(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void data.set(k, v)),
  };
}

describe("parseSavedMulti（まとめて遊ぶの保存を読む）", () => {
  it("形の合う保存をそのまま読む", () => {
    const saved = { open: true, active: 1, cols: 3, cards: [card(), card({ id: "b2", name: "友だち", startedAt: 1_790_000_100_000 })] };
    expect(parseSavedMulti(JSON.stringify(saved))).toEqual(saved);
  });

  it("無い・JSON でない・オブジェクトでない・配列は空のセット", () => {
    for (const raw of [null, "{oops", "3", "null", "[]", '"x"']) expect(parseSavedMulti(raw)).toEqual(EMPTY_MULTI);
  });

  it("カードは 1 件ずつ見て、id・コードの形が合わない件だけ落とす", () => {
    const saved = parseSavedMulti(
      JSON.stringify({
        open: true,
        cards: [card(), null, 3, card({ id: "" }), card({ id: "b2", code: 5 }), card({ id: "c3", code: "has space" }), card({ id: "d4" })],
      })
    );
    expect(saved.cards.map((c) => c.id)).toEqual(["a1", "d4"]);
  });

  it("名前・時刻・区間が型違いなら、その欄だけ無いことにする（カードは落とさない）", () => {
    const [c] = parseSavedMulti(
      JSON.stringify({ cards: [card({ name: 5, addedAt: "x", startedAt: -1, paused: [[1, 2], ["x", 3], [5, 4], [6, null], 7] })] })
    ).cards;
    expect(c.name).toBe("");
    expect(c.addedAt).toBe(0);
    expect(c.startedAt).toBeUndefined();
    expect(c.paused).toEqual([
      [1, 2],
      [6, null],
    ]);
  });

  it("Date が表せない巨大な時刻（1e300）は時刻として読まない（画面の時刻が NaN にならないように。検分 M2 安全の低-1）", () => {
    const [c] = parseSavedMulti(
      JSON.stringify({ cards: [card({ addedAt: 1e300, startedAt: 8.64e15 + 1, paused: [[1e300, null], [1, 2]] })] })
    ).cards;
    expect(c.addedAt).toBe(0);
    expect(c.startedAt).toBeUndefined();
    expect(c.paused).toEqual([[1, 2]]);
  });

  it("5 枚まで。active・cols は範囲に収め、open は真偽でなければ偽", () => {
    const cards = Array.from({ length: 7 }, (_, i) => card({ id: `c${i}` }));
    const saved = parseSavedMulti(JSON.stringify({ open: "yes", active: 9, cols: 8, cards }));
    expect(saved.cards).toHaveLength(5);
    expect(saved.active).toBe(4);
    expect(saved.cols).toBe(0);
    expect(saved.open).toBe(false);
  });

  it("同じ id が 2 件あれば後の件を落とす", () => {
    expect(parseSavedMulti(JSON.stringify({ cards: [card(), card({ name: "後" })] })).cards).toHaveLength(1);
  });

  it("parseMultiObject は形が違えば null（書き出しの読み込みで理由を出すため）", () => {
    expect(parseMultiObject(null)).toBeNull();
    expect(parseMultiObject([])).toBeNull();
    expect(parseMultiObject({ cards: [] })).toEqual(EMPTY_MULTI);
  });
});

describe("cleanCardName（リンクやファイルから来る名前）", () => {
  it("前後の空白を除き、16 字まで（絵文字などは 1 字に数える）", () => {
    expect(cleanCardName("  友だちのカード  ")).toBe("友だちのカード");
    expect(cleanCardName("あ".repeat(20))).toBe("あ".repeat(16));
    expect(cleanCardName("🎤".repeat(20))).toHaveLength(32); // サロゲートペア 16 字
  });

  it("改行などの制御文字・文字の向きを変える文字を落とす", () => {
    expect(cleanCardName("a\nb\tc‮d⁦e‏f")).toBe("abcdef");
  });

  it("文字列でなければ空", () => {
    expect(cleanCardName(5)).toBe("");
    expect(cleanCardName(null)).toBe("");
  });
});

describe("loadMulti / saveMulti", () => {
  it("書いて読み直せる", () => {
    const s = memoryStorage();
    const saved = { open: true, active: 0, cols: 0, cards: [card()] };
    saveMulti(saved, s);
    expect(JSON.parse(s.data.get(MULTI_STORAGE_KEY)!)).toEqual(saved);
    expect(loadMulti(s)).toEqual(saved);
  });

  it("localStorage が投げても、読みは空・書きは黙って何もしない", () => {
    const s = memoryStorage({}, true);
    expect(loadMulti(s)).toEqual(EMPTY_MULTI);
    expect(() => saveMulti(EMPTY_MULTI, s)).not.toThrow();
    expect(loadMulti(null)).toEqual(EMPTY_MULTI);
  });
});

describe("休止の区間（isPaused・withPaused）", () => {
  const base = card() as SavedMultiCard;

  it("休止すると終わりが null の区間を足し、再開するとその区間を閉じる。前の区間は残す", () => {
    const paused = withPaused(base, true, 1000);
    expect(paused.paused).toEqual([[1000, null]]);
    expect(isPaused(paused)).toBe(true);
    const resumed = withPaused(paused, false, 5000);
    expect(resumed.paused).toEqual([[1000, 5000]]);
    expect(isPaused(resumed)).toBe(false);
    expect(withPaused(resumed, true, 9000).paused).toEqual([
      [1000, 5000],
      [9000, null],
    ]);
    // 元のカードは変えない
    expect(base.paused).toEqual([]);
  });

  it("同じ状態にするだけなら何も変えない（同じものを返す）", () => {
    expect(withPaused(base, false, 1000)).toBe(base);
    const paused = withPaused(base, true, 1000);
    expect(withPaused(paused, true, 2000)).toBe(paused);
  });

  it("時計が戻っていても、閉じた区間の終わりは始まりより前にしない（読み直して落ちないように）", () => {
    const resumed = withPaused(withPaused(base, true, 5000), false, 3000);
    expect(resumed.paused).toEqual([[5000, 5000]]);
    expect(parseSavedMulti(JSON.stringify({ cards: [resumed] })).cards[0].paused).toEqual([[5000, 5000]]);
  });

  it("区間は新しい 200 件まで。読むときも新しい方を残し、今の休止を落とさない", () => {
    const many = Array.from({ length: 200 }, (_, i) => [i * 10 + 1, i * 10 + 5] as const);
    const paused = withPaused({ ...base, paused: many }, true, 99_999);
    expect(paused.paused).toHaveLength(200);
    expect(paused.paused.at(-1)).toEqual([99_999, null]);
    expect(paused.paused[0]).toEqual([11, 15]);
    const longer = { ...base, paused: [...many, [99_999, null]] };
    const read = parseSavedMulti(JSON.stringify({ cards: [longer] })).cards[0];
    expect(read.paused).toHaveLength(200);
    expect(isPaused(read)).toBe(true);
  });

  it("終わりが null の区間は最後の 1 件だけ読む（途中にあると、そこから先がずっと休止になる）", () => {
    const read = parseSavedMulti(JSON.stringify({ cards: [card({ paused: [[1, null], [3, 4], [6, null]] })] })).cards[0];
    expect(read.paused).toEqual([
      [3, 4],
      [6, null],
    ]);
  });
});

describe("summarizeSavedMulti（設定画面とプライバシーポリシーの台帳）", () => {
  it("カードの枚数。0 枚なら null、読めなければ壊れている", () => {
    expect(summarizeSavedMulti(JSON.stringify({ cards: [card(), card({ id: "b" })] }), "壊れています")).toBe("カード 2 枚");
    expect(summarizeSavedMulti(JSON.stringify({ cards: [] }), "壊れています")).toBeNull();
    expect(summarizeSavedMulti("{oops", "壊れています")).toBe("壊れています");
    expect(summarizeSavedMulti("[]", "壊れています")).toBe("壊れています");
  });
});
