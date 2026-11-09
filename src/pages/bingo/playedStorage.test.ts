import { describe, expect, it } from "vitest";
import {
  MAX_PLAYED,
  PLAYED_STORAGE_KEY,
  type PlayedEntry,
  loadPlayed,
  parsePlayedArray,
  parseSavedPlayed,
  savePlayed,
  summarizeSavedPlayed,
  withAppended,
  withCellsAdded,
  withoutEntry,
} from "./playedStorage";
import { BROKEN, STORED_ITEM_BY_KEY } from "../settings/lib/storedItems";

function memoryStorage(init: Record<string, string> = {}) {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

const T0 = 1_790_000_000_000;
const e = (id: string, at: number, cells?: PlayedEntry["cells"]): PlayedEntry => ({ id, at, ...(cells ? { cells } : {}) });

describe("遊んだ曲の一覧の保存", () => {
  it("保存して読み直すと同じものが戻る（遊んだ順・埋めたマスの記録つき）", () => {
    const s = memoryStorage();
    const list = [e("549", T0, [{ card: "odai@1790000000000", filled: [3, 7] }]), e("74", T0 + 60_000), e("549", T0 + 120_000)];
    savePlayed(list, s);
    expect(loadPlayed(s)).toEqual(list);
  });

  it("空の一覧は保存から消す（設定画面の一覧に 0 件で残さない）", () => {
    const s = memoryStorage({ [PLAYED_STORAGE_KEY]: "[]" });
    savePlayed([], s);
    expect(s.data[PLAYED_STORAGE_KEY]).toBeUndefined();
    expect(loadPlayed(s)).toEqual([]);
  });

  it("壊れた値・形の違う値は空の一覧", () => {
    for (const raw of ["{", "null", "{}", '"x"', "5"]) {
      expect(parseSavedPlayed(raw)).toEqual([]);
    }
    expect(parseSavedPlayed(null)).toEqual([]);
  });

  it("1 件ずつ見て、形の合わない件だけ落とす（null・id が曲の番号でない・時刻が数でない）", () => {
    const raw = JSON.stringify([
      null,
      e("549", T0),
      { id: 549, at: T0 },
      { id: "abc", at: T0 },
      { id: "12345", at: T0 },
      { id: "74", at: "x" },
      { id: "74", at: -1 },
      { id: "74", at: Number.MAX_VALUE * 2 },
      [],
      e("74", T0 + 1),
    ]);
    expect(parseSavedPlayed(raw)).toEqual([e("549", T0), e("74", T0 + 1)]);
  });

  it("埋めたマスの記録が壊れていても、その件は落とさず記録だけ外す", () => {
    const raw = JSON.stringify([
      { id: "549", at: T0, cells: "x" },
      { id: "550", at: T0, cells: [null, { card: "a1", filled: [1, 1, 25, -1, 2.5, "3", 4] }, { card: "a b", filled: [1] }, { card: "a2", filled: "x" }] },
      { id: "551", at: T0, cells: [{ card: "a1", filled: [] }] },
    ]);
    expect(parseSavedPlayed(raw)).toEqual([e("549", T0), e("550", T0, [{ card: "a1", filled: [1, 4] }]), e("551", T0)]);
  });

  it(`${MAX_PLAYED + 1} 件の保存は、新しい ${MAX_PLAYED} 件だけ読む`, () => {
    const list = Array.from({ length: MAX_PLAYED + 1 }, (_, i) => e(String((i % 700) + 1), T0 + i));
    const read = parseSavedPlayed(JSON.stringify(list));
    expect(read).toHaveLength(MAX_PLAYED);
    expect(read[0].at).toBe(T0 + 1);
    expect(read.at(-1)!.at).toBe(T0 + MAX_PLAYED);
  });

  it("localStorage が使えないときは null（読めないことと、空の一覧を分ける）。書くときも落ちない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadPlayed(broken)).toBeNull();
    expect(loadPlayed(null)).toBeNull();
    expect(() => savePlayed([e("1", T0)], broken)).not.toThrow();
    expect(() => savePlayed([], broken)).not.toThrow();
  });

  it("書き出しのファイルの一覧は、読めなかった件の数も返す", () => {
    expect(parsePlayedArray([e("549", T0), { id: "x" }, null])).toEqual({ entries: [e("549", T0)], dropped: 2 });
    expect(parsePlayedArray("x")).toEqual({ entries: [], dropped: 0 });
  });
});

describe("一覧の操作（もとの配列は変えない）", () => {
  it("足すと最後に入り、上限を超えたら古いほうから落とす", () => {
    const full = Array.from({ length: MAX_PLAYED }, (_, i) => e("1", T0 + i));
    const next = withAppended(full, e("2", T0 + MAX_PLAYED));
    expect(next).toHaveLength(MAX_PLAYED);
    expect(next[0].at).toBe(T0 + 1);
    expect(next.at(-1)).toEqual(e("2", T0 + MAX_PLAYED));
    expect(full).toHaveLength(MAX_PLAYED);
  });

  it("同じ曲を 2 回遊べば 2 件。消すのは id と時刻が同じ 1 件だけ", () => {
    const list = [e("549", T0), e("549", T0 + 1), e("74", T0 + 2)];
    expect(withoutEntry(list, e("549", T0 + 1))).toEqual([e("549", T0), e("74", T0 + 2)]);
    expect(withoutEntry(list, e("549", T0 + 9))).toEqual(list);
  });

  it("一覧から埋めたマスを、その曲の記録に足す（同じカードの記録はまとめ、番号順にそろえる）", () => {
    const list = [e("549", T0, [{ card: "a1", filled: [7] }]), e("74", T0 + 1)];
    const next = withCellsAdded(withCellsAdded(list, e("549", T0), "a1", [3, 7]), e("74", T0 + 1), "b2", [5]);
    expect(next).toEqual([e("549", T0, [{ card: "a1", filled: [3, 7] }]), e("74", T0 + 1, [{ card: "b2", filled: [5] }])]);
    expect(list[0].cells).toEqual([{ card: "a1", filled: [7] }]);
  });
});

describe("summarizeSavedPlayed（設定画面とプライバシーポリシーの台帳）", () => {
  it("台帳に載っていて、曲数を出す。0 件は null、読めなければ broken", () => {
    const item = STORED_ITEM_BY_KEY.get(PLAYED_STORAGE_KEY);
    expect(item).toBeDefined();
    expect(item!.summarize(JSON.stringify([e("549", T0), e("74", T0)]))).toBe("2 曲");
    expect(summarizeSavedPlayed("[]", "壊れ")).toBeNull();
    expect(summarizeSavedPlayed("{", "壊れ")).toBe("壊れ");
    expect(summarizeSavedPlayed("{}", "壊れ")).toBe("壊れ");
    expect(item!.summarize("{")).toBe(BROKEN);
  });
});
