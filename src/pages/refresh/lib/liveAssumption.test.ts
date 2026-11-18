import { describe, expect, it } from "vitest";
import { OVERHEAD_SEC } from "../../../lib/overhead";
import { MULTI_LIVE_SUSPENDED } from "../../../lib/liveSuspension";
import { overheadFromRate, planSession, playsPerHour } from "./sessionPlanner";
import {
  DEFAULT_RATE,
  ENVY_LEN,
  LIVE_ASSUMPTION_LABEL,
  SOLO_DEFAULT_RATE,
  assumptionTag,
  defaultLiveAssumption,
  defaultRateFor,
  overheadForPace,
  paceFor,
  paceMetaLine,
} from "./liveAssumption";

/**
 * リフレッシュゲージの「ひとりでライブ想定」（みんなでライブが止まったイベント向け、2026-11-18）。
 *
 * ★ ひとりでライブのロスは src/lib/overhead.ts の OVERHEAD_SEC.solo（実測前の仮の値）が唯一の正本。
 *   Nori があとでその 1 か所だけ直すので、ここでも期待値は**定数から出し**、33 を直書きしない。
 * ★ みんなでライブ側は、足す前（885580a）と 1 つも数字が変わらないこと（ゴールデン）。
 */

describe("既定の想定", () => {
  it("みんなでライブが止まっている間はひとりでライブ、再開したらみんなでライブ", () => {
    expect(defaultLiveAssumption(true)).toBe("solo");
    expect(defaultLiveAssumption(false)).toBe("multi");
  });

  it("引数なしは土台の MULTI_LIVE_SUSPENDED に従う", () => {
    expect(defaultLiveAssumption()).toBe(MULTI_LIVE_SUSPENDED ? "solo" : "multi");
  });

  it("札の文字は公式の名前＋「想定」", () => {
    expect(LIVE_ASSUMPTION_LABEL).toEqual({ solo: "ひとりでライブ", multi: "みんなでライブ" });
    expect(assumptionTag("solo")).toBe("ひとりでライブ想定");
    expect(assumptionTag("multi")).toBe("みんなでライブ想定");
  });
});

describe("ひとりでライブの周回ペース", () => {
  it("既定のペースは OVERHEAD_SEC.solo から出す（エビ基準・整数に丸める）", () => {
    expect(SOLO_DEFAULT_RATE).toBe(Math.round(playsPerHour(ENVY_LEN, OVERHEAD_SEC.solo)));
    expect(defaultRateFor("solo")).toBe(SOLO_DEFAULT_RATE);
  });

  it("既定のペースのままなら、ロスは OVERHEAD_SEC.solo そのもの（丸めたペースから逆算しない）", () => {
    expect(overheadForPace("solo", String(SOLO_DEFAULT_RATE))).toBe(OVERHEAD_SEC.solo);
  });

  it("空欄・0・不正な値も既定のロス", () => {
    for (const v of ["", "0", "-3", "abc"]) {
      expect(overheadForPace("solo", v)).toBe(OVERHEAD_SEC.solo);
      expect(paceFor("solo", v)).toBe(SOLO_DEFAULT_RATE);
    }
  });

  it("自分で入れたペースは、みんなでライブと同じ式でロスを逆算する", () => {
    const custom = SOLO_DEFAULT_RATE - 3;
    expect(overheadForPace("solo", String(custom))).toBe(overheadFromRate(custom, ENVY_LEN));
    expect(paceFor("solo", String(custom))).toBe(custom);
  });

  it("エビの結果はロス OVERHEAD_SEC.solo で計算される（100%まで・この曲のペース・持続ペース）", () => {
    const solo = planSession(84, ENVY_LEN, 0, overheadForPace("solo", String(SOLO_DEFAULT_RATE)));
    expect(solo.runwayPlays).toBe(501);
    expect(solo.runwayMinutes).toBeCloseTo((501 * (ENVY_LEN + OVERHEAD_SEC.solo)) / 60, 9);
    expect(solo.theoreticalPerHour).toBeCloseTo(3600 / (ENVY_LEN + OVERHEAD_SEC.solo), 9);
  });

  it("ロスがみんなでライブより短いので、同じ曲でも周回ペースは速い", () => {
    const solo = overheadForPace("solo", String(SOLO_DEFAULT_RATE));
    const multi = overheadForPace("multi", String(DEFAULT_RATE));
    expect(solo).toBeLessThan(multi);
  });
});

describe("みんなでライブは足す前と同じ（ゴールデン）", () => {
  it("既定のペースは 28 回/時のまま", () => {
    expect(DEFAULT_RATE).toBe(28);
    expect(defaultRateFor("multi")).toBe(28);
  });

  it("ロスは 28 回/時からの逆算（53.77…秒）のまま。OVERHEAD_SEC.multi の 54 には差し替えない", () => {
    expect(overheadForPace("multi", "28")).toBe(overheadFromRate(28, ENVY_LEN));
    expect(overheadForPace("multi", "28")).toBeCloseTo(53.771428571, 8);
  });

  it("空欄・0 は 28 回/時として扱う（足す前と同じ）", () => {
    for (const v of ["", "0", "-1", "abc"]) {
      expect(overheadForPace("multi", v)).toBe(overheadFromRate(28, ENVY_LEN));
      expect(paceFor("multi", v)).toBe(28);
    }
  });

  it("自分で入れたペースはそのまま逆算する", () => {
    expect(overheadForPace("multi", "32")).toBe(overheadFromRate(32, ENVY_LEN));
    expect(paceFor("multi", "32")).toBe(32);
  });

  // 885580a のビルドで /refresh に入れて画面から写した値（エビ・定数84）
  it.each([
    { rate: "28", gauge: 0, plays: 501, minutes: "17:54", pace: 28, sustain: 21, rest: 25 },
    { rate: "32", gauge: 50, plays: 251, minutes: "7:51", pace: 32, sustain: 23, rest: 28 },
    { rate: "", gauge: 50, plays: 251, minutes: "8:58", pace: 28, sustain: 21, rest: 25 },
    { rate: "22", gauge: 13.6, plays: 433, minutes: "19:41", pace: 22, sustain: 17, rest: 21 },
  ])("ペース「$rate」・ゲージ$gauge% → $plays回・$minutes", ({ rate, gauge, plays, minutes, pace, sustain, rest }) => {
    const oh = overheadForPace("multi", rate);
    const p = planSession(84, ENVY_LEN, gauge, oh);
    const total = Math.round(p.runwayMinutes);
    expect(p.runwayPlays).toBe(plays);
    expect(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`).toBe(minutes);
    expect(playsPerHour(ENVY_LEN, oh).toFixed(0)).toBe(String(pace));
    expect(p.sustainablePerHour.toFixed(0)).toBe(String(sustain));
    expect(p.restSharePercent.toFixed(0)).toBe(String(rest));
  });
});

describe("画像の前提の行", () => {
  it("想定を渡さないとき（周回プランの画像）は足す前と同じ文", () => {
    expect(paceMetaLine(28)).toBe("ペース: 28回/時（エビ基準）");
  });

  it("想定を渡すと、どちらの想定かを書き足す", () => {
    expect(paceMetaLine(SOLO_DEFAULT_RATE, "solo")).toBe(
      `ペース: ${SOLO_DEFAULT_RATE}回/時（エビ基準・ひとりでライブ想定）`,
    );
    expect(paceMetaLine(28, "multi")).toBe("ペース: 28回/時（エビ基準・みんなでライブ想定）");
  });
});
