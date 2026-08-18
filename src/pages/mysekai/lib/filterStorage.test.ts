/**
 * @vitest-environment jsdom
 *
 * localStorage を触るので jsdom が要る（既存の playerStore.test.ts と同じ）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "./filter";
import { FILTER_STORAGE_KEY, loadFilter, saveFilter } from "./filterStorage";
import { loadProgress, OWNED_STORAGE_KEY, partyKey, saveProgress } from "./ownedStorage";

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

describe("ownedStorage（進み具合）", () => {
  const P = (owned: number[] = [], collected: string[] = [], wish: number[] = []) => ({
    owned: new Set(owned),
    collected: new Set(collected),
    wish: new Set(wish),
  });

  it("持っている家具と、見た会話を別々に保存して読み戻せる", () => {
    saveProgress(P([3, 1, 2], ["10:1", "10:1,2"]));
    const got = loadProgress();
    expect([...got.owned].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...got.collected].sort()).toEqual(["10:1", "10:1,2"]);
  });

  it("何も無ければ両方とも空", () => {
    const got = loadProgress();
    expect(got.owned.size).toBe(0);
    expect(got.collected.size).toBe(0);
  });

  // 誤って「全部持っている／全部見た」状態にしないこと。壊れていたら空に倒す。
  it("壊れていたら空に倒す", () => {
    for (const bad of ["{oops", "[]", '{"v":99,"ids":[1]}', "null", '"x"']) {
      localStorage.setItem(OWNED_STORAGE_KEY, bad);
      const got = loadProgress();
      expect(got.owned.size).toBe(0);
      expect(got.collected.size).toBe(0);
    }
  });

  it("整数でない家具IDは捨てる", () => {
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify({ v: 1, ids: [1, "2", null, 3.5, 4] }));
    expect([...loadProgress().owned].sort((a, b) => a - b)).toEqual([1, 4]);
  });

  it("形の違う会話キーは捨てる", () => {
    localStorage.setItem(
      OWNED_STORAGE_KEY,
      JSON.stringify({ v: 1, seen: ["10:1", "", "こわれた", "10:", 5, "11:2,3"] })
    );
    expect([...loadProgress().collected].sort()).toEqual(["10:1", "11:2,3"]);
  });

  it("並びを揃えて保存する（書き出しの差分が読めるように）", () => {
    saveProgress(P([5, 1, 3], ["2:9", "1:1"], [9, 2]));
    const raw = JSON.parse(localStorage.getItem(OWNED_STORAGE_KEY)!);
    expect(raw.ids).toEqual([1, 3, 5]);
    expect(raw.seen).toEqual(["1:1", "2:9"]);
    expect(raw.wish).toEqual([2, 9]);
  });

  it("ほしいものリストを所持とは別に保存して読み戻せる", () => {
    saveProgress(P([1], ["10:1"], [4, 7]));
    const got = loadProgress();
    expect([...got.owned]).toEqual([1]);
    expect([...got.wish].sort((a, b) => a - b)).toEqual([4, 7]);
  });

  /** ★ v1.13 までの保存には wish が無い。読めずに全部消える、が起きないこと。 */
  it("wish の無い古い保存を読んでも、所持と既読は生き残る", () => {
    localStorage.setItem(OWNED_STORAGE_KEY,
      JSON.stringify({ v: 1, ids: [1, 2], seen: ["10:1"] }));
    const got = loadProgress();
    expect([...got.owned].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...got.collected]).toEqual(["10:1"]);
    expect(got.wish.size).toBe(0);
  });
});

describe("partyKey", () => {
  // 並びが違うだけで別物になると、同じ会話に2つ印が立つ。
  it("顔ぶれの並びが違っても同じキーになる", () => {
    expect(partyKey(10, [2, 1])).toBe(partyKey(10, [1, 2]));
    expect(partyKey(10, [1, 2])).toBe("10:1,2");
  });

  it("家具が違えば別のキー", () => {
    expect(partyKey(10, [1])).not.toBe(partyKey(11, [1]));
  });
});
