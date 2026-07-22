import { describe, expect, it } from "vitest";
import {
  OVERHEAD_PRESETS,
  overheadFromRate,
  planSession,
  playsPerHour,
  restMinutesPerPlay,
  runwayToFull,
  sustainableRate,
} from "./sessionPlanner";

/** エビ(定数84・74.8s)基準。時間モデルは @Nori 実測(理論32/h・実測28/h)で較正。 */
const ENVY = 84;
const ENVY_LEN = 74.8;

describe("時間モデル（実測較正）", () => {
  it("プリセットのオーバーヘッドがエビの実測レートを再現する", () => {
    expect(playsPerHour(ENVY_LEN, OVERHEAD_PRESETS.theoretical)).toBeCloseTo(31.9, 1); // ≈32回/h
    expect(playsPerHour(ENVY_LEN, OVERHEAD_PRESETS.realistic)).toBeCloseTo(28.0, 1); // ≈28回/h
  });

  it("実測レートからオーバーヘッドを逆算できる（較正）", () => {
    expect(overheadFromRate(28, ENVY_LEN)).toBeCloseTo(53.8, 1);
    expect(overheadFromRate(32, ENVY_LEN)).toBeCloseTo(37.7, 1);
  });

  it("非現実的な高レートでもオーバーヘッドは0でクランプ（負にならない）", () => {
    // エビを100回/時は曲長的に不可能 → 0でクランプ
    expect(overheadFromRate(100, ENVY_LEN)).toBe(0);
  });
});

describe("runwayToFull", () => {
  it("0%から100%まではエビ501回", () => {
    const r = runwayToFull(ENVY, ENVY_LEN, 0);
    expect(r.plays).toBe(501);
    // 501回 × (74.8+54)s / 60 分
    expect(r.minutes).toBeCloseTo((501 * (74.8 + 54)) / 60, 3);
  });

  it("現在ゲージが高いほど走行可能周回は減る", () => {
    const full = runwayToFull(ENVY, ENVY_LEN, 0).plays;
    const half = runwayToFull(ENVY, ENVY_LEN, 6_600_000 / 2).plays;
    expect(half).toBeLessThan(full);
    expect(half).toBe(Math.ceil(6_600_000 / 2 / (ENVY * 157)));
  });
});

describe("restMinutesPerPlay", () => {
  it("エビ1回は約0.72分の休憩で相殺", () => {
    expect(restMinutesPerPlay(ENVY)).toBeCloseTo(0.7193, 3);
  });
});

describe("sustainableRate", () => {
  it("ゲージ制約で持続ペースは実測ペースより落ちる", () => {
    const r = sustainableRate(ENVY, ENVY_LEN);
    expect(r.playsPerHour).toBeLessThan(r.theoreticalPerHour);
    // 実測28/h → ゲージ制約で持続約21/h、休憩シェア約25%
    expect(r.theoreticalPerHour).toBeCloseTo(28.0, 0);
    expect(r.playsPerHour).toBeCloseTo(20.9, 1);
    expect(r.restSharePercent).toBeCloseTo(25.1, 1);
  });

  it("短い曲ほど持続ペースでのゲージ効率が良い（休憩シェアが小さい）", () => {
    const envy = sustainableRate(84, 74.8);
    const long = sustainableRate(191, 182.4);
    expect(envy.restSharePercent).toBeLessThan(long.restSharePercent);
  });
});

describe("planSession", () => {
  it("現在%を内部値に変換して走行量を出す", () => {
    const p = planSession(ENVY, ENVY_LEN, 50);
    expect(p.runwayPlays).toBe(runwayToFull(ENVY, ENVY_LEN, 6_600_000 * 0.5).plays);
    expect(p.fullRecoveryMinutes).toBe(360);
    expect(p.sustainablePerHour).toBeGreaterThan(0);
  });

  it("100%なら走行可能周回は0", () => {
    expect(planSession(ENVY, ENVY_LEN, 100).runwayPlays).toBe(0);
  });
});
