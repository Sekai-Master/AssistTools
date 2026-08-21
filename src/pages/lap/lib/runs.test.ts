/**
 * @vitest-environment jsdom
 *
 * localStorage を触るので jsdom が要る（filterStorage.test.ts と同じ）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { addRun, LAP_RUNS_KEY, loadRuns, MAX_RUNS, removeRun } from "./runs";
import { initialState, tap, toRun, type LapRun } from "./lap";

const T0 = 1_700_000_000_000;

function makeRun(id: string, savedAt: number): LapRun {
  let s = tap(initialState(), T0);
  s = tap(s, T0 + 100_000);
  return toRun(s, id, savedAt)!;
}

beforeEach(() => localStorage.clear());

describe("保存と読み出し", () => {
  it("足した記録が読み出せる", () => {
    const { runs, saved } = addRun(makeRun("a", T0));
    expect(saved).toBe(true);
    expect(runs).toHaveLength(1);
    expect(loadRuns()[0].id).toBe("a");
  });

  it("新しい順に並ぶ", () => {
    addRun(makeRun("old", T0));
    addRun(makeRun("new", T0 + 1000));
    expect(loadRuns().map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("消せる", () => {
    addRun(makeRun("a", T0));
    addRun(makeRun("b", T0 + 1));
    expect(removeRun("a").map((r) => r.id)).toEqual(["b"]);
    expect(loadRuns()).toHaveLength(1);
  });

  /** ★ 1件ごとにマーク列を持つので、無制限だと localStorage を静かに食い潰す。 */
  it("上限を超えたら古いものから捨てる", () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) addRun(makeRun(`r${i}`, T0 + i));
    const all = loadRuns();
    expect(all).toHaveLength(MAX_RUNS);
    expect(all[0].id).toBe(`r${MAX_RUNS + 4}`);
    expect(all.some((r) => r.id === "r0")).toBe(false);
  });
});

describe("壊れた保存で落ちない", () => {
  it("読めない中身は空扱い", () => {
    for (const junk of ["{oops", "null", '"x"', "{}", "[1,2,3]"]) {
      localStorage.setItem(LAP_RUNS_KEY, junk);
      expect(() => loadRuns()).not.toThrow();
      expect(loadRuns()).toEqual([]);
    }
  });

  it("欠けた記録は捨て、生きているものだけ残す", () => {
    const ok = makeRun("ok", T0);
    localStorage.setItem(
      LAP_RUNS_KEY,
      JSON.stringify([ok, { id: "ng" }, { savedAt: 1 }, null])
    );
    expect(loadRuns().map((r) => r.id)).toEqual(["ok"]);
  });

  it("マーク列に数値以外が混ざっていても落とすだけ", () => {
    const bad = { ...makeRun("x", T0), marks: [1, "a", null, 4] };
    localStorage.setItem(LAP_RUNS_KEY, JSON.stringify([bad]));
    expect(loadRuns()[0].marks).toEqual([1, 4]);
  });
});
