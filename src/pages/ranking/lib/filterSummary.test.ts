/**
 * 「絞り込み」の閉じた段の見出しに出す要約と、既定から変えた数（2026-11-19 指揮の追加依頼）。
 *
 * ★ 難易度・譜面レベル・並べ方（1曲1行）は閉じた段に畳む。畳んでも表に効くので、
 *   閉じたままでも今の条件が分かる要約と、既定から変えた数を見出しに出す（周回プラン・ついぼ・マイセカイと同じ作法）。
 * ★ 要約は短く（半分より多く選んでいれば「◯以外」）。長いと見出しの中で語の途中から折れる。
 */
import { describe, expect, it } from "vitest";
import { filterSummary } from "./filterSummary";

const ALL = ["EASY", "NORMAL", "HARD", "EXPERT", "MASTER", "APPEND"];
const base = { all: ALL, selected: ALL, levelFiltered: false, lo: 5, hi: 38, allDiffs: false };

describe("filterSummary", () => {
  it("既定（すべての難易度・全レベル・1曲1行）なら変えた数は 0", () => {
    expect(filterSummary(base)).toEqual({ text: "すべての難易度・全レベル・1曲1行", changed: 0 });
  });

  it("難易度を半分以下に絞ると、選んだ難易度を並べて 1 と数える", () => {
    expect(filterSummary({ ...base, selected: ["EXPERT", "MASTER"] })).toEqual({
      text: "EXPERT・MASTER・全レベル・1曲1行",
      changed: 1,
    });
    expect(filterSummary({ ...base, selected: ["HARD", "EXPERT", "MASTER"] }).text).toBe(
      "HARD・EXPERT・MASTER・全レベル・1曲1行",
    );
  });

  it("半分より多く選んでいるときは、外した方を「◯以外」と書く", () => {
    expect(filterSummary({ ...base, selected: ALL.filter((d) => d !== "EXPERT") })).toEqual({
      text: "EXPERT以外・全レベル・1曲1行",
      changed: 1,
    });
    expect(filterSummary({ ...base, selected: ["HARD", "EXPERT", "MASTER", "APPEND"] }).text).toBe(
      "EASY・NORMAL以外・全レベル・1曲1行",
    );
  });

  it("難易度を 1 つも選んでいないときもそう書く", () => {
    expect(filterSummary({ ...base, selected: [] }).text).toBe("難易度なし・全レベル・1曲1行");
  });

  it("譜面レベルを絞ると範囲を書いて 1 と数える", () => {
    expect(filterSummary({ ...base, levelFiltered: true, lo: 26, hi: 32 })).toEqual({
      text: "すべての難易度・レベル26〜32・1曲1行",
      changed: 1,
    });
  });

  it("難易度ごとに全部並べると「難易度ごと」と書いて 1 と数え、3 つとも変えれば 3", () => {
    expect(filterSummary({ ...base, allDiffs: true })).toEqual({
      text: "すべての難易度・全レベル・難易度ごと",
      changed: 1,
    });
    expect(
      filterSummary({ ...base, selected: ["APPEND"], levelFiltered: true, lo: 30, hi: 38, allDiffs: true }).changed,
    ).toBe(3);
  });
});
