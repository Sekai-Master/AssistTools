import { describe, it, expect } from "vitest";
import { calcLivePt, calcMultiLivePt, multiScoreCoefficient } from "../../analyzer/lib/calcLivePt";
import {
  calcScore,
  eventPtFor,
  baseRate,
  skillWeights,
  rankSongs,
  FEVER_RATE,
  MULTI_SUB_RATE,
  type EfficiencyEntry,
  type EfficiencyParams,
} from "./efficiency";

/**
 * フィクスチャは public/MusicDatas/musicScoreData.json からそのまま写した実データ。
 * 丸めたり手で書き換えたりすると「実データで検証している」が嘘になるので触らないこと。
 */

/** 独りんぼエンヴィー EXPERT。短くて基礎点が低い＝手動周回の王。 */
const ENVY: EfficiencyEntry = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "expert",
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.109881,
  skillScoreSolo: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.104178],
  baseScoreAuto: 0.7595,
  skillScoreAuto: [0.048394, 0.049786, 0.05292, 0.053616, 0.043171, 0.070153],
  skillScoreMulti: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.148379],
  feverScore: 0.119139,
  musicTime: 74.8,
  eventRate: 100,
};

/** 初音天地開闢神話 MASTER。長尺で基礎点が高い＝オート周回の王。 */
const TENCHI: EfficiencyEntry = {
  musicId: "186",
  title: "初音天地開闢神話",
  difficulty: "master",
  playLevel: 33,
  noteCount: 2021,
  baseScore: 1.226808,
  skillScoreSolo: [0.018903, 0.030565, 0.045559, 0.023581, 0.047022, 0.049961],
  baseScoreAuto: 0.798,
  skillScoreAuto: [0.013047, 0.020572, 0.029834, 0.015006, 0.029923, 0.031794],
  skillScoreMulti: [0.018903, 0.030565, 0.045559, 0.023581, 0.070534, 0.049961],
  feverScore: 0.156391,
  musicTime: 182.4,
  eventRate: 130,
};

const PARAMS: EfficiencyParams = {
  power: 300_000,
  bonus: 700,
  taki: 5,
  skillLeader: 130,
  skillSub: 110,
  overheadSec: 20,
};

describe("baseRate — ライブ種別で base が変わる", () => {
  it("ソロは baseScore そのまま", () => {
    expect(baseRate(ENVY, "solo")).toBe(ENVY.baseScore);
  });

  it("協力はフィーバーぶんが 0.5 倍で乗る", () => {
    expect(baseRate(ENVY, "multi")).toBeCloseTo(ENVY.baseScore! + ENVY.feverScore! * FEVER_RATE, 10);
  });

  it("オートは baseScoreAuto", () => {
    expect(baseRate(ENVY, "auto")).toBe(ENVY.baseScoreAuto);
  });

  it("feverScore が無い曲は協力で計算しない（条件が揃わない曲を混ぜない）", () => {
    expect(baseRate({ ...ENVY, feverScore: null }, "multi")).toBeNull();
  });
});

describe("skillWeights — 長さ6でなければ使わない", () => {
  it("種別ごとに別の配列を返す", () => {
    expect(skillWeights(ENVY, "solo")).toBe(ENVY.skillScoreSolo);
    expect(skillWeights(ENVY, "multi")).toBe(ENVY.skillScoreMulti);
    expect(skillWeights(ENVY, "auto")).toBe(ENVY.skillScoreAuto);
  });

  it("長さが6でなければ null（黙って偽スコアを出さない）", () => {
    expect(skillWeights({ ...ENVY, skillScoreSolo: [0.1, 0.2, 0.3] }, "solo")).toBeNull();
    expect(skillWeights({ ...ENVY, skillScoreMulti: null }, "multi")).toBeNull();
  });
});

describe("calcScore", () => {
  it("ソロは5枚の平均を1〜5枠に、リーダーを6枠目に掛ける", () => {
    const w = ENVY.skillScoreSolo!;
    const avgFive = (PARAMS.skillLeader + 4 * PARAMS.skillSub) / 5;
    const head = w.slice(0, 5).reduce((s, x) => s + x, 0);
    const rate = ENVY.baseScore! + (avgFive * head + PARAMS.skillLeader * w[5]) / 100;
    expect(calcScore(ENVY, PARAMS, "solo")).toBe(Math.floor(rate * 300_000 * 4));
  });

  it("協力はリーダー100%＋サブ各20%の実効値が6枠すべてに同じだけ掛かる", () => {
    const w = ENVY.skillScoreMulti!;
    const effective = PARAMS.skillLeader + 4 * PARAMS.skillSub * MULTI_SUB_RATE;
    const base = ENVY.baseScore! + ENVY.feverScore! * FEVER_RATE;
    const rate = base + (effective * w.reduce((s, x) => s + x, 0)) / 100;
    expect(calcScore(ENVY, PARAMS, "multi")).toBe(Math.floor(rate * 300_000 * 4));
  });

  it("協力ではサブを上げてもリーダーを上げたときの1/5しか効かない", () => {
    const byLeader =
      calcScore(ENVY, { ...PARAMS, skillLeader: PARAMS.skillLeader + 50 }, "multi")! -
      calcScore(ENVY, PARAMS, "multi")!;
    const bySub =
      calcScore(ENVY, { ...PARAMS, skillSub: PARAMS.skillSub + 50 }, "multi")! -
      calcScore(ENVY, PARAMS, "multi")!;
    // サブ4枚 × 20% = 80% ぶんなので、リーダー1枚ぶんの 0.8 倍
    expect(bySub / byLeader).toBeCloseTo(4 * MULTI_SUB_RATE, 3);
  });

  it("ソロではサブを上げるほうがリーダーより効く（サブ4枚ぶんあるので）", () => {
    const byLeader =
      calcScore(ENVY, { ...PARAMS, skillLeader: PARAMS.skillLeader + 50 }, "solo")! -
      calcScore(ENVY, PARAMS, "solo")!;
    const bySub =
      calcScore(ENVY, { ...PARAMS, skillSub: PARAMS.skillSub + 50 }, "solo")! -
      calcScore(ENVY, PARAMS, "solo")!;
    expect(bySub).toBeGreaterThan(byLeader);
  });

  it("オートは判定係数のぶん必ずソロより低い", () => {
    expect(calcScore(ENVY, PARAMS, "auto")!).toBeLessThan(calcScore(ENVY, PARAMS, "solo")!);
  });

  it("データが欠けていれば null", () => {
    expect(calcScore({ ...ENVY, baseScore: null }, PARAMS, "solo")).toBeNull();
    expect(calcScore({ ...ENVY, skillScoreSolo: null }, PARAMS, "solo")).toBeNull();
  });
});

describe("eventPtFor — 実測で確定した calcLivePt 系に委ねる", () => {
  it("ソロ／オートは calcLivePt と完全一致する（式を二重実装しない）", () => {
    const score = 1_500_000;
    expect(eventPtFor("solo", score, 130, PARAMS)).toBe(
      calcLivePt(130, PARAMS.bonus, score, PARAMS.taki),
    );
    expect(eventPtFor("auto", score, 100, PARAMS)).toBe(
      calcLivePt(100, PARAMS.bonus, score, PARAMS.taki),
    );
  });

  it("協力は calcMultiLivePt と一致し、ソロ式とは違う値になる", () => {
    const score = 1_500_000;
    expect(eventPtFor("multi", score, 100, PARAMS)).toBe(
      calcMultiLivePt(100, PARAMS.bonus, score, PARAMS.taki),
    );
    expect(eventPtFor("multi", score, 100, PARAMS)).not.toBe(
      eventPtFor("solo", score, 100, PARAMS),
    );
  });

  it("協力の係数は 110 + floor(自/17000) + min(13, floor(他4人/340000))", () => {
    // 他人のスコアを省くと自分×4で置くので、他項は floor(score/85000) 相当
    expect(multiScoreCoefficient(1_700_000)).toBe(110 + 100 + 13);
    // 他4人が弱いと上限13に届かない
    expect(multiScoreCoefficient(1_700_000, 680_000)).toBe(110 + 100 + 2);
    // 上限で頭打ちになる
    expect(multiScoreCoefficient(100_000, 99_000_000)).toBe(110 + 5 + 13);
  });

  it("小数のボーナス（0.5%刻み）を落とさない", () => {
    expect(eventPtFor("solo", 1_500_000, 100, { ...PARAMS, bonus: 415.5 })).not.toBe(
      eventPtFor("solo", 1_500_000, 100, { ...PARAMS, bonus: 415 }),
    );
  });
});

describe("rankSongs — モードで最適解が入れ替わる", () => {
  const entries = [ENVY, TENCHI];

  it("手動周回は短い曲が勝つ（時間が律速）", () => {
    const r = rankSongs(entries, PARAMS, "manual");
    expect(r[0].title).toBe("独りんぼエンヴィー");
  });

  it("オート周回は長尺・高基礎点が勝つ（ライボが律速で時間はコストにならない）", () => {
    const r = rankSongs(entries, PARAMS, "auto");
    expect(r[0].title).toBe("初音天地開闢神話");
  });

  it("手動とオートで順位が逆転する", () => {
    const manual = rankSongs(entries, PARAMS, "manual").map((r) => r.title);
    const auto = rankSongs(entries, PARAMS, "auto").map((r) => r.title);
    expect(manual[0]).not.toBe(auto[0]);
  });

  it("手動は協力ライブの式で計算する（スコアもPtもソロ式と違う）", () => {
    const r = rankSongs([ENVY], PARAMS, "manual");
    expect(r[0].score).toBe(calcScore(ENVY, PARAMS, "multi"));
    expect(r[0].score).not.toBe(calcScore(ENVY, PARAMS, "solo"));
    expect(r[0].eventPt).toBe(calcMultiLivePt(100, PARAMS.bonus, r[0].score, PARAMS.taki));
  });

  it("チャレライはソロ式・スコアで並ぶ（イベント基礎点を見ない）", () => {
    const r = rankSongs(entries, PARAMS, "challenge");
    expect(r[0].metric).toBe(r[0].score);
    expect(r[0].score).toBe(calcScore(r[0], PARAMS, "solo"));
    const shifted = rankSongs([{ ...ENVY, eventRate: 999 }, TENCHI], PARAMS, "challenge");
    expect(shifted.find((x) => x.musicId === "074")!.metric).toBe(
      r.find((x) => x.musicId === "074")!.metric,
    );
  });

  it("チャレライは曲長・基礎点が無い曲も残す（metric に無関係なため）", () => {
    const bare = { ...ENVY, musicTime: null, eventRate: null };
    expect(rankSongs([bare], PARAMS, "challenge")).toHaveLength(1);
    expect(rankSongs([bare], PARAMS, "manual")).toHaveLength(0);
    expect(rankSongs([bare], PARAMS, "auto")).toHaveLength(0);
  });

  it("指数は1位が100・2位以降はその比", () => {
    const r = rankSongs(entries, PARAMS, "manual");
    expect(r[0].index).toBe(100);
    expect(r[1].index).toBeCloseTo((r[1].metric / r[0].metric) * 100, 10);
    expect(r[1].index).toBeLessThan(100);
  });

  it("入力の配列を書き換えない", () => {
    const snapshot = JSON.stringify(entries);
    rankSongs(entries, PARAMS, "manual");
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it("データが欠けた曲は落とす", () => {
    const r = rankSongs([{ ...ENVY, baseScore: null }, TENCHI], PARAMS, "manual");
    expect(r).toHaveLength(1);
  });

  it("総合力が変わると順位が動きうる（スコア項が式に入るため）", () => {
    const low = rankSongs(entries, { ...PARAMS, power: 50_000 }, "manual");
    const high = rankSongs(entries, { ...PARAMS, power: 330_000 }, "manual");
    expect(low[1].index).not.toBeCloseTo(high[1].index, 3);
  });
});
