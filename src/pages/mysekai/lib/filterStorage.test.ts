/**
 * @vitest-environment jsdom
 *
 * localStorage を触るので jsdom が要る（既存の playerStore.test.ts と同じ）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "./filter";
import { FILTER_STORAGE_KEY, loadFilter, saveFilter } from "./filterStorage";
import { loadOwned, OWNED_STORAGE_KEY, saveOwned } from "./ownedStorage";

/**
 * localStorage は旧バージョンの自分や手書きに汚染されうる。
 * **壊れていたら既定へ倒す**（誤った条件で「0件」を出して原因を分からなくしない）。
 */

beforeEach(() => localStorage.clear());

describe("filterStorage", () => {
  it("保存して読み戻せる", () => {
    saveFilter({ ...DEFAULT_FILTER, charId: 5, kinds: ["talk"], sketchableOnly: true, sort: "cost" });
    const f = loadFilter();
    expect(f.charId).toBe(5);
    expect(f.kinds).toEqual(["talk"]);
    expect(f.sketchableOnly).toBe(true);
    expect(f.sort).toBe("cost");
  });

  // 前回の検索語が残っていると「なぜ0件なのか」が分からなくなる。
  it("検索語は保存しない", () => {
    saveFilter({ ...DEFAULT_FILTER, query: "ソファ" });
    expect(loadFilter().query).toBe("");
  });

  it("何も無ければ既定", () => {
    expect(loadFilter()).toEqual(DEFAULT_FILTER);
  });

  it("壊れた JSON は既定に倒す", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, "{oops");
    expect(loadFilter()).toEqual(DEFAULT_FILTER);
  });

  it("バージョンが違えば既定に倒す", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: 99, charId: 3 }));
    expect(loadFilter()).toEqual(DEFAULT_FILTER);
  });

  it("配列や文字列が入っていても既定に倒す", () => {
    for (const bad of ["[]", '"x"', "null", "123"]) {
      localStorage.setItem(FILTER_STORAGE_KEY, bad);
      expect(loadFilter()).toEqual(DEFAULT_FILTER);
    }
  });

  it("知らない種別・並び順は捨てる", () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ v: 1, kinds: ["talk", "うそ"], sort: "でたらめ" })
    );
    const f = loadFilter();
    expect(f.kinds).toEqual(["talk"]);
    expect(f.sort).toBe(DEFAULT_FILTER.sort);
  });

  it("kinds が配列でなければ既定の種別に戻す", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: 1, kinds: "talk" }));
    expect(loadFilter().kinds).toEqual(DEFAULT_FILTER.kinds);
  });

  it("charId が整数でなければ捨てる", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: 1, charId: "3" }));
    expect(loadFilter().charId).toBeNull();
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: 1, charId: 1.5 }));
    expect(loadFilter().charId).toBeNull();
  });

  // ★ 実在しないIDはここでは弾けない（キャラ一覧を知らないため）。
  //   画面側が読み込み後に突き合わせて無効化する（MysekaiReactions の effectiveFilter）。
  it("実在しない charId はここでは通す（画面側で無効化する契約）", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ v: 1, charId: 999 }));
    expect(loadFilter().charId).toBe(999);
  });
});

describe("ownedStorage", () => {
  it("保存して読み戻せる", () => {
    saveOwned(new Set([3, 1, 2]));
    expect([...loadOwned()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("何も無ければ空", () => {
    expect(loadOwned().size).toBe(0);
  });

  // 誤って「全部持っている」状態にしないこと。壊れていたら空に倒す。
  it("壊れていたら空に倒す", () => {
    for (const bad of ["{oops", "[]", '{"v":1}', '{"v":99,"ids":[1]}', "null"]) {
      localStorage.setItem(OWNED_STORAGE_KEY, bad);
      expect(loadOwned().size).toBe(0);
    }
  });

  it("整数でない要素は捨てる", () => {
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify({ v: 1, ids: [1, "2", null, 3.5, 4] }));
    expect([...loadOwned()].sort((a, b) => a - b)).toEqual([1, 4]);
  });

  it("並びを揃えて保存する（書き出しの差分が読めるように）", () => {
    saveOwned(new Set([5, 1, 3]));
    expect(JSON.parse(localStorage.getItem(OWNED_STORAGE_KEY)!).ids).toEqual([1, 3, 5]);
  });
});
