import { describe, expect, it } from "vitest";
import {
  GAUGE_SPEC,
  decayInternal,
  fullRecoveryMinutes,
  gaugeAfterPlays,
  liveGaugeInternal,
  liveGaugePercent,
  mySekaiGaugeInternal,
  playsToFull,
  toDisplayPercent,
} from "./gaugeModel";

/**
 * 実測（docs/refresh-gauge/measurements.md）で確定した値を固定する安全網。
 * 2026-03-10 仕様（係数157・MAX6,600,000）。挙動を意図的に変えるとき以外は書き換えない。
 */

const ENVY = 84; // 独りんぼエンヴィーのリフレッシュ定数（確定）

describe("gaugeModel — ライブ増加", () => {
  it("エビ1回の内部増加 = 定数×157", () => {
    expect(liveGaugeInternal(ENVY)).toBe(13_188);
  });

  it("エビ1回の実数% ≈ 0.19982", () => {
    expect(liveGaugePercent(ENVY)).toBeCloseTo(0.19982, 5);
  });

  it("実測の累積表示%と一致する（切り捨て）", () => {
    // 実測: エビ52回=10.3%, 53回=10.5%, 57回=11.3%
    expect(toDisplayPercent(52 * 13_188)).toBe(10.3);
    expect(toDisplayPercent(53 * 13_188)).toBe(10.5);
    expect(toDisplayPercent(57 * 13_188)).toBe(11.3);
  });

  it("100%到達に必要なエビ回数", () => {
    // 6,600,000 / 13,188 = 500.4 → 501回で100%
    expect(playsToFull(ENVY)).toBe(501);
  });

  it("現在ゲージからの残り回数", () => {
    const at57 = 57 * 13_188;
    expect(playsToFull(ENVY, at57)).toBe(playsToFull(ENVY) - 57);
  });

  it("gaugeAfterPlays はMAXでクランプ", () => {
    expect(gaugeAfterPlays(ENVY, 10)).toBe(131_880);
    expect(gaugeAfterPlays(ENVY, 100_000)).toBe(GAUGE_SPEC.max);
  });
});

describe("gaugeModel — マイセカイ", () => {
  it("素材700/スタミナ・双葉250/本", () => {
    expect(mySekaiGaugeInternal(1, 0)).toBe(700);
    expect(mySekaiGaugeInternal(0, 1)).toBe(250);
    expect(mySekaiGaugeInternal(10, 2)).toBe(7_500);
  });

  it("素材1スタミナは表示%換算でライブより十分軽い", () => {
    expect(toDisplayPercent(mySekaiGaugeInternal(1, 0))).toBeLessThan(toDisplayPercent(13_188));
  });
});

describe("gaugeModel — 減少・回復", () => {
  it("30分ごとに550,000減少、端数は減らない", () => {
    expect(decayInternal(0)).toBe(0);
    expect(decayInternal(29)).toBe(0);
    expect(decayInternal(30)).toBe(550_000);
    expect(decayInternal(59)).toBe(550_000);
    expect(decayInternal(60)).toBe(1_100_000);
  });

  it("100%からの全回復は6時間", () => {
    expect(fullRecoveryMinutes()).toBe(360);
    expect(decayInternal(360)).toBe(GAUGE_SPEC.max);
  });
});

describe("toDisplayPercent — 範囲", () => {
  it("MAXで100%、超過はクランプ", () => {
    expect(toDisplayPercent(GAUGE_SPEC.max)).toBe(100);
    expect(toDisplayPercent(GAUGE_SPEC.max * 2)).toBe(100);
    expect(toDisplayPercent(-100)).toBe(0);
  });
});
