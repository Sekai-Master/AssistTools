import { describe, expect, it } from "vitest";
import {
  checkRow,
  emptyRow,
  initialLive,
  lossFromBest,
  nextName,
  overheadBasisNote,
  parseNum,
  parseState,
  uniqueNames,
  type QuickRow,
} from "./quickCompare";

const row = (power: string, bonus: string, leader: string, total: string, name = "A"): QuickRow => ({
  ...emptyRow(name),
  power,
  bonus,
  leader,
  total,
});

describe("parseNum", () => {
  it("カンマ・全角・前後の空白を許す", () => {
    expect(parseNum("351,149")).toBe(351_149);
    expect(parseNum("３５１，１４９")).toBe(351_149);
    expect(parseNum(" 425 ")).toBe(425);
    expect(parseNum("31.5")).toBe(31.5);
  });

  it("空と数でないものは null", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("  ")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });
});

describe("checkRow", () => {
  it("4つそろえば計算に回し、協力の実効値（リーダー＋ほか4枚の2割）も出す", () => {
    const c = checkRow(row("351149", "425", "150", "450"), "編成1");
    expect(c).toEqual({
      ok: true,
      candidate: { name: "A", power: 351_149, bonus: 425, skillLeader: 150, skillTotal: 450 },
      effective: 210,
    });
  });

  it("名前が空なら、代わりの名前を使う", () => {
    const c = checkRow(row("351149", "425", "150", "450", " "), "編成2");
    expect(c.ok && c.candidate.name).toBe("編成2");
  });

  it("全部空なら黙る。打ちかけ・数でない・内部値がリーダーより小さいときは理由を出す", () => {
    expect(checkRow(row("", "", "", ""), "x")).toEqual({ ok: false, reason: null });
    expect(checkRow(row("351149", "", "", ""), "x")).toEqual({ ok: false, reason: "4つとも入れると計算します" });
    expect(checkRow(row("35万", "425", "150", "450"), "x")).toEqual({ ok: false, reason: "数字で入れてください" });
    expect(checkRow(row("351149", "425", "150", "100"), "x")).toEqual({
      ok: false,
      reason: "内部値はリーダーを含む5枚の合計です（リーダー以上）",
    });
    expect(checkRow(row("0", "425", "150", "450"), "x")).toEqual({ ok: false, reason: "総合力は0より大きい数で" });
    expect(checkRow(row("351149", "-1", "150", "450"), "x")).toEqual({ ok: false, reason: "マイナスは入れられません" });
  });
});

describe("lossFromBest", () => {
  it("最良に対して何%下か。計算できなければ null", () => {
    expect(lossFromBest(38_950, 40_675)).toBeCloseTo(38_950 / 40_675 - 1, 10);
    expect(lossFromBest(40_675, 40_675)).toBe(0);
    expect(lossFromBest(null, 40_675)).toBeNull();
    expect(lossFromBest(100, null)).toBeNull();
  });
});

describe("nextName", () => {
  it("使っていない一番前の英字", () => {
    expect(nextName([])).toBe("A");
    expect(nextName([emptyRow("A"), emptyRow("C")])).toBe("B");
  });
});

describe("parseState（保存してあった値の読み直し）", () => {
  it("形が合うものだけ通す", () => {
    const s = parseState({
      rows: [{ id: "r1", name: "A", power: "351149", bonus: "425", leader: "150", total: "450" }, null, { name: 3 }],
      songId: "074",
      difficulty: "master",
      live: "multi",
      taki: 5,
    });
    expect(s.rows).toEqual([{ id: "r1", name: "A", power: "351149", bonus: "425", leader: "150", total: "450" }]);
    expect(s).toMatchObject({ songId: "074", difficulty: "master", live: "multi", taki: 5 });
  });

  it("壊れていれば空（既定値に任せる）", () => {
    expect(parseState(null)).toEqual({});
    expect(parseState("x")).toEqual({});
    expect(parseState({ rows: 3, difficulty: "hell", live: "x", taki: 99 })).toEqual({});
  });

  it("難易度は画面で選べる3つ（MASTER・APPEND・EXPERT）だけ通す", () => {
    expect(parseState({ difficulty: "append" })).toEqual({ difficulty: "append" });
    expect(parseState({ difficulty: "easy" })).toEqual({});
  });

  it("id が重なった行は1つにする（1回の操作が2行に効かないように）", () => {
    const r = { id: "r1", name: "A", power: "1", bonus: "1", leader: "1", total: "1" };
    expect(parseState({ rows: [r, { ...r, name: "B" }] }).rows).toEqual([r]);
  });

  it("「みんなでライブが止まっている間に選び直した」印は真偽値だけ通す", () => {
    expect(parseState({ live: "multi", liveInSuspension: true })).toEqual({ live: "multi", liveInSuspension: true });
    expect(parseState({ live: "multi", liveInSuspension: false })).toEqual({ live: "multi", liveInSuspension: false });
    expect(parseState({ live: "multi", liveInSuspension: "yes" })).toEqual({ live: "multi" });
  });
});

/**
 * 開いたときのライブ種別（2026-11-18〜 みんなでライブの停止期間）。
 *
 * ★ 止まっている間は ひとりでライブで開く。古い保存値が みんなでライブでも同じ（保存値は書き換えない）。
 * ★ 止まっている間に利用者が選び直した種類は、ふだんどおり保存して次も使う（印 liveInSuspension で古い保存値と見分ける）。
 */
describe("initialLive（開いたときのライブ種別）", () => {
  it("止まっている間は、保存値が無い・古い みんなでライブ なら ひとりでライブ", () => {
    expect(initialLive({}, true)).toBe("solo");
    expect(initialLive({ live: "multi" }, true)).toBe("solo");
    expect(initialLive({ live: "multi", liveInSuspension: false }, true)).toBe("solo");
  });

  it("止まっている間でも、保存値がオート・ひとりでライブならそのまま", () => {
    expect(initialLive({ live: "auto" }, true)).toBe("auto");
    expect(initialLive({ live: "solo" }, true)).toBe("solo");
  });

  it("止まっている間に選び直した みんなでライブ は、次に開いたときもそのまま", () => {
    expect(initialLive({ live: "multi", liveInSuspension: true }, true)).toBe("multi");
  });

  it("再開したら保存値どおり。無ければ今までどおり みんなでライブ", () => {
    expect(initialLive({}, false)).toBe("multi");
    expect(initialLive({ live: "multi" }, false)).toBe("multi");
    expect(initialLive({ live: "solo", liveInSuspension: true }, false)).toBe("solo");
    expect(initialLive({ live: "auto" }, false)).toBe("auto");
  });
});

/**
 * オーバーヘッドの出どころの断り書き（楽曲比較と編成ビルダーの比較で共通）。
 *
 * ★ ひとりでライブのロス（OVERHEAD_SEC.solo）は実測前の仮の値。「仮」と書くかは
 *   src/lib/overhead.ts の SOLO_OVERHEAD_PROVISIONAL だけで決める（値が 33 かどうかでは決めない）。
 */
describe("overheadBasisNote", () => {
  it("印が立っている間、ひとりでライブは「仮の値」と書き、「実測値」と書かない", () => {
    const note = overheadBasisNote("solo", true);
    expect(note).toContain("仮");
    expect(note).not.toContain("実測値");
  });

  it("印が下りたら（Nori が測ったら）、ひとりでライブも「実測値」になり「仮」が消える", () => {
    const note = overheadBasisNote("solo", false);
    expect(note).toBe("（ライブ種別ごとの実測値）");
    expect(note).not.toContain("仮");
  });

  it("みんなでライブ・オートは印によらず「実測値」", () => {
    for (const p of [true, false]) {
      expect(overheadBasisNote("multi", p)).toBe("（ライブ種別ごとの実測値）");
      expect(overheadBasisNote("auto", p)).toBe("（ライブ種別ごとの実測値）");
    }
  });
});

describe("uniqueNames", () => {
  // ★ 同じ名前が並ぶと、表と「ボーナスが低い方が勝っています」の文でどれのことか分からない
  it("2つ目からは (2)・(3) を付ける。付けた名前とも重ならないようにする", () => {
    expect(uniqueNames(["A", "B", "A"])).toEqual(["A", "B", "A (2)"]);
    expect(uniqueNames(["A", "A (2)", "A"])).toEqual(["A", "A (2)", "A (3)"]);
    expect(uniqueNames(["A", "A", "A"])).toEqual(["A", "A (2)", "A (3)"]);
  });
});
