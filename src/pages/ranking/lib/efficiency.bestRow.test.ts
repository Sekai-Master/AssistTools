/**
 * 1曲1行への間引き（bestRowPerSong）。2026-11-19 表の直し。
 *
 * ★ rankSongs・rankSongsInWindow の出力そのものは変えない。間引きはその出力に後から掛ける純粋関数。
 * ★ 残すのは「その曲の一番上の行」。並べ替えはしない（同点のときも rankSongs が先に置いた方を残す）。
 * ★ 難易度・レベルの絞り込みは rankSongs に渡す前に済ませる。絞り込みの中での一番上が残る。
 *
 * フィクスチャは並びだけを見るための作り物（実データの写しではない）。
 */
import { describe, expect, it } from "vitest";
import {
  bestRowPerSong,
  rankSongs,
  rankSongsInWindow,
  DEFAULT_PARAMS,
  type EfficiencyEntry,
} from "./efficiency";

const WEIGHTS = [0.07, 0.07, 0.07, 0.07, 0.07, 0.08];

/** 曲と難易度と base だけ変えた作り物。base が高いほど上に来る。 */
function entry(musicId: string, difficulty: string, base: number, musicTime = 100): EfficiencyEntry {
  return {
    musicId,
    title: `曲${musicId}`,
    difficulty,
    playLevel: 20,
    noteCount: 500,
    baseScore: base,
    skillScoreSolo: WEIGHTS,
    baseScoreAuto: base * 0.7,
    skillScoreAuto: WEIGHTS,
    skillScoreMulti: WEIGHTS,
    feverScore: 0.1,
    musicTime,
    eventRate: 100,
  };
}

const PARAMS = { ...DEFAULT_PARAMS, overheadSec: 33 };

describe("bestRowPerSong — 1曲1行に間引く", () => {
  it("曲ごとに最初の行だけ残し、並びは変えない", () => {
    const rows = [
      { musicId: "a", difficulty: "expert" },
      { musicId: "a", difficulty: "master" },
      { musicId: "b", difficulty: "master" },
      { musicId: "a", difficulty: "hard" },
      { musicId: "c", difficulty: "append" },
      { musicId: "b", difficulty: "expert" },
    ];
    expect(bestRowPerSong(rows)).toEqual([
      { musicId: "a", difficulty: "expert" },
      { musicId: "b", difficulty: "master" },
      { musicId: "c", difficulty: "append" },
    ]);
  });

  it("入力の配列を書き換えない（新しい配列を返す）", () => {
    const rows = [
      { musicId: "a", difficulty: "expert" },
      { musicId: "a", difficulty: "master" },
    ];
    const copy = rows.map((r) => ({ ...r }));
    const out = bestRowPerSong(rows);
    expect(rows).toEqual(copy);
    expect(out).not.toBe(rows);
  });

  it("空の入力は空", () => {
    expect(bestRowPerSong([])).toEqual([]);
  });

  it("rankSongs の出力に掛けると、各曲の一番上の難易度だけが残り、曲どうしの順位はそのまま", () => {
    const entries = [
      entry("a", "hard", 1.0),
      entry("a", "expert", 1.2),
      entry("a", "master", 1.1),
      entry("b", "master", 1.15),
      entry("b", "expert", 1.05),
    ];
    const ranked = rankSongs(entries, PARAMS, "solo");
    // 間引く前の並び（rankSongs のまま）: a-expert, b-master, a-master, b-expert, a-hard
    expect(ranked.map((r) => `${r.musicId}-${r.difficulty}`)).toEqual([
      "a-expert",
      "b-master",
      "a-master",
      "b-expert",
      "a-hard",
    ]);
    const out = bestRowPerSong(ranked);
    expect(out.map((r) => `${r.musicId}-${r.difficulty}`)).toEqual(["a-expert", "b-master"]);
    // 行の中身（Pt/時 など）は rankSongs が出したものをそのまま持っている
    expect(out[0]).toBe(ranked[0]);
    expect(out[1]).toBe(ranked[1]);
  });

  it("難易度の絞り込みと組み合わせると、選んだ難易度の中での一番上が残る", () => {
    const entries = [
      entry("a", "hard", 1.0),
      entry("a", "expert", 1.2),
      entry("a", "master", 1.1),
    ];
    // EXPERT を外して HARD と MASTER だけ選んだとき
    const picked = entries.filter((e) => e.difficulty === "hard" || e.difficulty === "master");
    const out = bestRowPerSong(rankSongs(picked, PARAMS, "solo"));
    expect(out.map((r) => r.difficulty)).toEqual(["master"]);
  });

  it("同じ曲の難易度どうしが同点なら、rankSongs が先に置いた方（同点なら入力の順）を残す", () => {
    const hard = entry("a", "hard", 1.1);
    const expert = entry("a", "expert", 1.1);
    const first = rankSongs([hard, expert], PARAMS, "solo");
    expect(first[0].metric).toBe(first[1].metric);
    expect(bestRowPerSong(first).map((r) => r.difficulty)).toEqual(["hard"]);

    const swapped = rankSongs([expert, hard], PARAMS, "solo");
    expect(bestRowPerSong(swapped).map((r) => r.difficulty)).toEqual(["expert"]);
  });

  it("別の曲どうしが同点でも、どちらも残す（間引くのは同じ曲だけ）", () => {
    const out = bestRowPerSong(rankSongs([entry("a", "master", 1.1), entry("b", "master", 1.1)], PARAMS, "solo"));
    expect(out).toHaveLength(2);
  });

  it("rankSongsInWindow（オートの区間モード）の出力にも掛けられる", () => {
    const entries = [entry("a", "expert", 1.2), entry("a", "master", 1.3), entry("b", "master", 1.25, 120)];
    const ranked = rankSongsInWindow(entries, PARAMS, {
      windowSec: 3600,
      startLB: 100,
      lbCap: 100,
      maxPlays: 99,
      regen: false,
      refill: true,
    });
    const out = bestRowPerSong(ranked);
    expect(new Set(out.map((r) => r.musicId)).size).toBe(out.length);
    expect(out.map((r) => r.musicId).sort()).toEqual(["a", "b"]);
    // 各曲に残ったのは、その曲で一番上（totalPt が最大）の行
    for (const r of out) {
      const best = Math.max(...ranked.filter((x) => x.musicId === r.musicId).map((x) => x.totalPt));
      expect(r.totalPt).toBe(best);
    }
  });
});
