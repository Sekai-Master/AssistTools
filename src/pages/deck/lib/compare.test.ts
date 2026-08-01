/**
 * 編成比較のテスト。
 *
 * ★ ここで確かめたいのは式そのものではない（それは efficiency.ts 側のテストの仕事）。
 *   **「総合力とボーナスを差し替えたときに、逆転がちゃんと出るか」**を固定する。
 *   逆転が出せることがこのツールの存在意義なので、ここが壊れたら価値ごと壊れる。
 */
import { describe, expect, it } from "vitest";
import { bestIndex, compareDecks, findUpset, type CompareCondition } from "./compare";
import { calcScore, eventPtFor, type EfficiencyEntry } from "../../ranking/lib/efficiency";

/** 効率曲ランキングのテストと同じ形の、素性のはっきりした1曲。 */
const song: EfficiencyEntry = {
  musicId: "test",
  title: "テスト曲",
  difficulty: "master",
  playLevel: 32,
  noteCount: 1000,
  baseScore: 4,
  skillScoreSolo: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  baseScoreAuto: 3,
  skillScoreAuto: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  skillScoreMulti: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  feverScore: 1,
  musicTime: 100,
  eventRate: 100,
};

const cond: CompareCondition = {
  live: "multi",
  taki: 5,
  skillLeader: 150,
  skillTotal: 710,
  overheadSec: 20,
};

describe("compareDecks", () => {
  it("既存の calcScore / eventPtFor と同じ値を返す（式を作り直していない）", () => {
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400 }], song, cond);
    const params = { power: 300_000, bonus: 400, taki: 5, skillLeader: 150, skillTotal: 710, overheadSec: 20 };
    const score = calcScore(song, params, "multi");
    expect(row.score).toBe(score);
    expect(row.eventPt).toBe(eventPtFor("multi", score!, 100, params));
  });

  it("並び順を入れ替えない", () => {
    const rows = compareDecks(
      [
        { name: "A", power: 100_000, bonus: 100 },
        { name: "B", power: 300_000, bonus: 400 },
      ],
      song,
      cond
    );
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
    expect(bestIndex(rows)).toBe(1);
  });

  it("時速は曲長＋オーバーヘッドで割る", () => {
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400 }], song, cond);
    expect(row.cycleSec).toBe(120);
    expect(row.ptPerHour).toBeCloseTo((row.eventPt! / 120) * 3600, 6);
  });

  it("データが欠けている曲は null で返す（0にしない）", () => {
    const broken: EfficiencyEntry = { ...song, skillScoreMulti: null };
    const [row] = compareDecks([{ name: "A", power: 300_000, bonus: 400 }], broken, cond);
    expect(row.score).toBeNull();
    expect(row.eventPt).toBeNull();
    expect(row.ptPerHour).toBeNull();
    expect(bestIndex([row])).toBe(-1);
  });
});

describe("逆転の検出（このツールの存在意義）", () => {
  it("ボーナスが低くても総合力で勝てば逆転として拾う", () => {
    const rows = compareDecks(
      [
        { name: "ボーナス盛り", power: 200_000, bonus: 400 },
        { name: "総合力盛り", power: 320_000, bonus: 395 },
      ],
      song,
      cond
    );
    const upset = findUpset(rows);
    expect(upset?.winner.name).toBe("総合力盛り");
    expect(upset?.loser.name).toBe("ボーナス盛り");
    // 逆転が起きている＝ボーナスが低い側の最終Ptが高い、が実際に成立していること。
    expect(upset!.winner.eventPt!).toBeGreaterThan(upset!.loser.eventPt!);
  });

  it("ボーナス最大の編成がそのまま最終Ptでも勝つなら逆転ではない", () => {
    const rows = compareDecks(
      [
        { name: "ボーナス盛り", power: 300_000, bonus: 400 },
        { name: "総合力盛り", power: 305_000, bonus: 300 },
      ],
      song,
      cond
    );
    expect(findUpset(rows)).toBeNull();
  });

  it("編成が1つだけなら逆転は無い", () => {
    expect(findUpset(compareDecks([{ name: "A", power: 300_000, bonus: 400 }], song, cond))).toBeNull();
  });
});
