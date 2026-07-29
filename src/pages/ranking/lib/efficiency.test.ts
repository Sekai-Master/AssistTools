import { describe, it, expect } from "vitest";
import {
  calcScore,
  calcEventPt,
  rankSongs,
  totalWithLb,
  type EfficiencyEntry,
  type EfficiencyParams,
} from "./efficiency";

/** 独りんぼエンヴィー EXPERT（実データ）。短くて基礎点が低い＝手動周回の王。 */
const ENVY: EfficiencyEntry = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "expert",
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.1099,
  skillScoreSolo: [0.069, 0.071, 0.076, 0.078, 0.063, 0.104],
  baseScoreAuto: 0.7772,
  skillScoreAuto: [0.048, 0.05, 0.053, 0.055, 0.044, 0.073],
  musicTime: 74.8,
  eventRate: 100,
};

/** 初音天地開闢神話 MASTER（実データ）。長尺で基礎点が高い＝オート周回の王。 */
const TENCHI: EfficiencyEntry = {
  musicId: "186",
  title: "初音天地開闢神話",
  difficulty: "master",
  playLevel: 32,
  noteCount: 1367,
  baseScore: 1.2166,
  skillScoreSolo: [0.03, 0.031, 0.033, 0.032, 0.035, 0.03],
  baseScoreAuto: 0.8516,
  skillScoreAuto: [0.021, 0.022, 0.023, 0.022, 0.025, 0.021],
  musicTime: 182.4,
  eventRate: 130,
};

const PARAMS: EfficiencyParams = {
  power: 300_000,
  bonus: 700,
  taki: 5,
  skillUp: 120,
  overheadSec: 20,
};

describe("calcScore", () => {
  it("rate × 総合力 × 4 を切り捨てて返す", () => {
    const rate = ENVY.baseScore! + ENVY.skillScoreSolo!.reduce((s, w) => s + (120 * w) / 100, 0);
    expect(calcScore(ENVY, 300_000, 120, false)).toBe(Math.floor(rate * 300_000 * 4));
  });

  it("オートでは baseScoreAuto と skillScoreAuto を使う", () => {
    const solo = calcScore(ENVY, 300_000, 120, false)!;
    const auto = calcScore(ENVY, 300_000, 120, true)!;
    expect(auto).toBeLessThan(solo); // オートは判定係数のぶん必ず低い
  });

  it("データが欠けていれば null", () => {
    expect(calcScore({ ...ENVY, baseScore: null }, 300_000, 120, false)).toBeNull();
    expect(calcScore({ ...ENVY, skillScoreSolo: null }, 300_000, 120, false)).toBeNull();
  });
});

describe("calcEventPt", () => {
  it("焚き数の倍率が乗る（5焚き=25倍・7焚き=29倍）", () => {
    const at5 = calcEventPt(1_500_000, 700, 100, 5);
    const at7 = calcEventPt(1_500_000, 700, 100, 7);
    expect(at7 / at5).toBeCloseTo(29 / 25, 5);
  });

  it("基礎点に比例する", () => {
    const a = calcEventPt(1_500_000, 700, 100, 5);
    const b = calcEventPt(1_500_000, 700, 130, 5);
    expect(b).toBeGreaterThan(a);
  });

  it("0焚きでも倍率1で成立する", () => {
    expect(calcEventPt(1_500_000, 700, 100, 0)).toBeGreaterThan(0);
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

  it("チャレライはスコアで並ぶ（イベント基礎点を見ない）", () => {
    const r = rankSongs(entries, PARAMS, "challenge");
    expect(r[0].metric).toBe(r[0].score);
    // 基礎点が違っても metric に影響しない
    const shifted = rankSongs(
      [{ ...ENVY, eventRate: 999 }, TENCHI],
      PARAMS,
      "challenge",
    );
    expect(shifted.find((x) => x.musicId === "074")!.metric).toBe(
      r.find((x) => x.musicId === "074")!.metric,
    );
  });

  it("データが欠けた曲は落とす", () => {
    const r = rankSongs([{ ...ENVY, baseScore: null }, TENCHI], PARAMS, "manual");
    expect(r).toHaveLength(1);
  });

  it("総合力が変わると順位が動きうる（スコア項が式に入るため）", () => {
    const low = rankSongs(entries, { ...PARAMS, power: 50_000 }, "manual");
    const high = rankSongs(entries, { ...PARAMS, power: 330_000 }, "manual");
    // 少なくとも metric の比は変化する（定数項 +100 の効き方が変わる）
    const ratioLow = low[0].metric / low[1].metric;
    const ratioHigh = high[0].metric / high[1].metric;
    expect(ratioLow).not.toBeCloseTo(ratioHigh, 3);
  });
});

describe("totalWithLb", () => {
  it("回せる回数は floor(LB ÷ 焚き数)", () => {
    expect(totalWithLb(1000, 47, 5)).toEqual({ plays: 9, total: 9000 });
  });

  it("LBが足りなければ0回", () => {
    expect(totalWithLb(1000, 3, 5)).toEqual({ plays: 0, total: 0 });
  });

  it("焚き数0は割れないので0回", () => {
    expect(totalWithLb(1000, 50, 0)).toEqual({ plays: 0, total: 0 });
  });
});
