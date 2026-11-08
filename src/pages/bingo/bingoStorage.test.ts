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
