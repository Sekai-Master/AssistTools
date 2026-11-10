import { describe, expect, it } from "vitest";
import {
  EMPTY_MULTI,
  MULTI_STORAGE_KEY,
  type SavedMultiCard,
  cleanCardName,
  MIN_TIME,
  isImportTime,
  isPaused,
  loadMulti,
  parseMultiObject,
  parseSavedMulti,
  saveMulti,
  summarizeSavedMulti,
  withPaused,
} from "./multiStorage";

/** 時刻の基準（2026-09-21）。ファイルの読み込みは 2020-09-30 以後・今から 1 日先までしか読まないので、区間はこれからの差で書く。 */
const B = 1_790_000_000_000;
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
      JSON.stringify({ cards: [card({ name: 5, addedAt: "x", startedAt: -1, paused: [[B + 1, B + 2], ["x", B + 3], [B + 5, B + 4], [B + 6, null], 7] })] })
    ).cards;
    expect(c.name).toBe("");
    expect(c.addedAt).toBe(0);
    expect(c.startedAt).toBeUndefined();
    expect(c.paused).toEqual([
      [B + 1, B + 2],
      [B + 6, null],
    ]);
  });

  it("Date が表せない巨大な時刻（1e300）は時刻として読まない（画面の時刻が NaN にならないように。検分 M2 安全の低-1）", () => {
    const [c] = parseSavedMulti(
      JSON.stringify({ cards: [card({ addedAt: 1e300, startedAt: 8.64e15 + 1, paused: [[1e300, null], [B + 1, B + 2]] })] })
    ).cards;
    expect(c.addedAt).toBe(0);
    expect(c.startedAt).toBeUndefined();
    expect(c.paused).toEqual([[B + 1, B + 2]]);
  });

  it("ファイルの読み込み（isImportTime）では、時刻は 2020-09-30 以後・今から 1 日先までだけ読む（西暦 275760 年・1970 年は読まない。検分 P 安全の低-1）", () => {
    const day = 86_400_000;
    const read = (over: Record<string, unknown>) => parseMultiObject({ cards: [card(over)] }, isImportTime)!.cards[0];
    const c = read({ addedAt: 1, startedAt: Date.now() + 2 * day, paused: [[8.64e15, null], [B + 1, B + 2]] });
    expect(c.addedAt).toBe(0);
    expect(c.startedAt).toBeUndefined();
    expect(c.paused).toEqual([[B + 1, B + 2]]);
    // 境目: 2020-09-30 00:00（日本時間）と、今から 1 日先の少し手前は読む
    const ok = read({ addedAt: MIN_TIME, startedAt: Date.now() + day - 60_000 });
    expect(ok.addedAt).toBe(MIN_TIME);
    expect(ok.startedAt).toBeGreaterThan(0);
  });

  // 検分 P2 中-1: この端末の保存は、端末の時計が 1 日より大きく戻っても消さない（開いた時点で書き返すので、落とすと保存からも消える）
  it("この端末の保存は、今より 3 日先の時刻（端末の時計が戻った）でも、休止の区間・足した時刻・プレイ開始を残す", () => {
    const later = Date.now() + 3 * 86_400_000;
    const [c] = parseSavedMulti(
      JSON.stringify({ cards: [card({ addedAt: later, startedAt: later + 1, paused: [[later + 2, later + 3], [later + 4, null]] })] })
    ).cards;
    expect(c.addedAt).toBe(later);
    expect(c.startedAt).toBe(later + 1);
    expect(c.paused).toEqual([
      [later + 2, later + 3],
      [later + 4, null],
    ]);
    expect(isPaused(c)).toBe(true);
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
    const paused = withPaused(base, true, B + 1000);
    expect(paused.paused).toEqual([[B + 1000, null]]);
    expect(isPaused(paused)).toBe(true);
    const resumed = withPaused(paused, false, B + 5000);
    expect(resumed.paused).toEqual([[B + 1000, B + 5000]]);
    expect(isPaused(resumed)).toBe(false);
    expect(withPaused(resumed, true, B + 9000).paused).toEqual([
      [B + 1000, B + 5000],
      [B + 9000, null],
    ]);
    // 元のカードは変えない
    expect(base.paused).toEqual([]);
  });

  it("同じ状態にするだけなら何も変えない（同じものを返す）", () => {
    expect(withPaused(base, false, B + 1000)).toBe(base);
    const paused = withPaused(base, true, B + 1000);
    expect(withPaused(paused, true, B + 2000)).toBe(paused);
  });

  it("時計が戻っていても、閉じた区間の終わりは始まりより前にしない（読み直して落ちないように）", () => {
    const resumed = withPaused(withPaused(base, true, B + 5000), false, B + 3000);
    expect(resumed.paused).toEqual([[B + 5000, B + 5000]]);
    expect(parseSavedMulti(JSON.stringify({ cards: [resumed] })).cards[0].paused).toEqual([[B + 5000, B + 5000]]);
  });

  it("区間は新しい 200 件まで。読むときも新しい方を残し、今の休止を落とさない", () => {
    const many = Array.from({ length: 200 }, (_, i) => [B + i * 10 + 1, B + i * 10 + 5] as const);
    const paused = withPaused({ ...base, paused: many }, true, B + 99_999);
    expect(paused.paused).toHaveLength(200);
    expect(paused.paused.at(-1)).toEqual([B + 99_999, null]);
    expect(paused.paused[0]).toEqual([B + 11, B + 15]);
    const longer = { ...base, paused: [...many, [B + 99_999, null]] };
    const read = parseSavedMulti(JSON.stringify({ cards: [longer] })).cards[0];
    expect(read.paused).toHaveLength(200);
    expect(isPaused(read)).toBe(true);
  });

  it("終わりが null の区間は最後の 1 件だけ読む（途中にあると、そこから先がずっと休止になる）", () => {
    const read = parseSavedMulti(JSON.stringify({ cards: [card({ paused: [[B + 1, null], [B + 3, B + 4], [B + 6, null]] })] })).cards[0];
    expect(read.paused).toEqual([
      [B + 3, B + 4],
      [B + 6, null],
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
