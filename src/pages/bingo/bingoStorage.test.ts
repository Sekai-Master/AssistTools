import { describe, expect, it } from "vitest";
import { BINGO_STORAGE_KEY, loadBingo, parseSavedBingo, saveBingo, summarizeSavedBingo } from "./bingoStorage";
import { BROKEN, STORED_ITEM_BY_KEY } from "../settings/lib/storedItems";

function memoryStorage(init: Record<string, string> = {}) {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("ビンゴの途中経過の保存", () => {
  it("保存して読み直すと同じものが戻る", () => {
    const s = memoryStorage();
    saveBingo({ kind: "song", odai: "OD1:abc", song: "A".repeat(50) }, s);
    expect(loadBingo(s)).toEqual({ kind: "song", odai: "OD1:abc", song: "A".repeat(50) });
  });

  it("壊れた値・形の違う値は無視する", () => {
    for (const raw of ["{", "null", "[]", '"x"', '{"kind":"other"}', '{"kind":"odai","odai":5}', '{"kind":"odai","odai":"' + "x".repeat(2000) + '"}']) {
      expect(parseSavedBingo(raw)).toBeNull();
      expect(loadBingo(memoryStorage({ [BINGO_STORAGE_KEY]: raw }))).toBeNull();
    }
    expect(parseSavedBingo(null)).toBeNull();
  });

  it("localStorage が使えなくても落ちない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadBingo(broken)).toBeNull();
    expect(() => saveBingo({ kind: "odai" }, broken)).not.toThrow();
  });

  it("設定画面・プライバシーポリシーの台帳に載っている", () => {
    const item = STORED_ITEM_BY_KEY.get(BINGO_STORAGE_KEY);
    expect(item).toBeDefined();
    expect(item!.summarize(JSON.stringify({ kind: "odai", odai: "OD1:x" }))).toBe("お題ビンゴ");
    expect(summarizeSavedBingo(JSON.stringify({ kind: "odai", odai: "OD1:x", song: "A" }), "壊れ")).toBe("お題ビンゴ・曲名ビンゴ");
    expect(summarizeSavedBingo(JSON.stringify({ kind: "odai" }), "壊れ")).toBeNull();
    // 壊れていても「消す」導線は出したいので null にしない
    expect(item!.summarize("{")).toBe(BROKEN);
  });
});

describe("1 枚で遊ぶの時刻（足した時刻・プレイ開始。遊んだ曲の一覧の PR で足した省略できる項目）", () => {
  const T = 1_790_000_000_000;

  it("時刻つきで保存して読み直すと同じものが戻る", () => {
    const s = memoryStorage();
    const saved = { kind: "odai" as const, odai: "OD1:abc", odaiAddedAt: T, odaiStartedAt: T + 60_000, song: "A".repeat(50), songAddedAt: T + 1 };
    saveBingo(saved, s);
    expect(loadBingo(s)).toEqual(saved);
  });

  it("時刻が壊れていても、カードは捨てずに時刻だけ無いことにする", () => {
    const raw = JSON.stringify({ kind: "odai", odai: "OD1:abc", odaiAddedAt: "x", odaiStartedAt: -5, songStartedAt: Number.NaN, songAddedAt: 1e300 });
    expect(parseSavedBingo(JSON.stringify({ kind: "odai", odai: "OD1:abc", odaiAddedAt: 1, odaiStartedAt: 8.64e15 }))).toEqual({ kind: "odai", odai: "OD1:abc" });
    expect(parseSavedBingo(raw)).toEqual({ kind: "odai", odai: "OD1:abc" });
  });

  it("時刻を足した保存を、前の版の読み方（知っている項目だけ取り出す）で読んでもカードが戻る", () => {
    // 前の版（#231 まで）の parseSavedBingo の写し
    const parseOld = (r: string | null) => {
      if (r === null) return null;
      try {
        const v: unknown = JSON.parse(r);
        if (!v || typeof v !== "object" || Array.isArray(v)) return null;
        const o = v as Record<string, unknown>;
        if (o.kind !== "odai" && o.kind !== "song") return null;
        const ok = (x: unknown) => typeof x === "string" && x.length > 0 && x.length <= 400;
        if (o.odai !== undefined && !ok(o.odai)) return null;
        if (o.song !== undefined && !ok(o.song)) return null;
        return { kind: o.kind, ...(o.odai !== undefined ? { odai: o.odai } : {}), ...(o.song !== undefined ? { song: o.song } : {}) };
      } catch {
        return null;
      }
    };
    const s = memoryStorage();
    saveBingo({ kind: "song", odai: "OD1:abc", odaiAddedAt: T, odaiStartedAt: T + 1, song: "A".repeat(50), songAddedAt: T }, s);
    expect(parseOld(s.data[BINGO_STORAGE_KEY])).toEqual({ kind: "song", odai: "OD1:abc", song: "A".repeat(50) });
    // 前の版が書いた（時刻の無い）保存も、今の版で読める
    expect(parseSavedBingo(JSON.stringify({ kind: "odai", odai: "OD1:abc" }))).toEqual({ kind: "odai", odai: "OD1:abc" });
  });
});
