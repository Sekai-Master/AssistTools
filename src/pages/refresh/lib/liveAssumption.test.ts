import { describe, expect, it } from "vitest";
import { OVERHEAD_SEC, SOLO_OVERHEAD_PROVISIONAL } from "../../../lib/overhead";
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
  paceHint,
  paceMetaLine,
  soloPaceNote,
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
  it("想定を渡さないときは足す前と同じ文", () => {
    expect(paceMetaLine(28)).toBe("ペース: 28回/時（エビ基準）");
  });

  it("想定を渡すと、どちらの想定かを書き足す", () => {
    expect(paceMetaLine(SOLO_DEFAULT_RATE, "solo")).toBe(
      `ペース: ${SOLO_DEFAULT_RATE}回/時（エビ基準・ひとりでライブ想定）`,
    );
    expect(paceMetaLine(28, "multi")).toBe("ペース: 28回/時（エビ基準・みんなでライブ想定）");
  });
});

/**
 * ★ 「仮」と出すかは src/lib/overhead.ts の SOLO_OVERHEAD_PROVISIONAL だけで決める（指揮 2026-11-19）。
 *   値が 33 かどうかでは判定しない。印を false にしたら「仮」が消えること。
 */
// 検分 M-1: 数字の近くでも仮と分かるように、周回ペースの補足に「（仮）」を付ける（#263・#264 とそろえる）
describe("周回ペースの補足（入力欄の下の 1 行）", () => {
  it("ひとりでライブ: 仮の値の間は「既定N（仮）。…」、印が false なら「（仮）」が消える", () => {
    expect(paceHint("solo", SOLO_DEFAULT_RATE, true)).toBe(
      `既定${SOLO_DEFAULT_RATE}（仮）。長い曲は自動で少なくなります`,
    );
    expect(paceHint("solo", SOLO_DEFAULT_RATE, false)).toBe(
      `既定${SOLO_DEFAULT_RATE}。長い曲は自動で少なくなります`,
    );
  });

  it("みんなでライブは印に関係なく足す前と同じ文", () => {
    for (const p of [true, false]) {
      expect(paceHint("multi", 28, p)).toBe("既定28。長い曲は自動で少なくなります");
    }
  });

  it("引数なしは土台の SOLO_OVERHEAD_PROVISIONAL に従う", () => {
    expect(paceHint("solo", SOLO_DEFAULT_RATE)).toBe(
      paceHint("solo", SOLO_DEFAULT_RATE, SOLO_OVERHEAD_PROVISIONAL),
    );
  });

  it("どちらでも 30 字以内（design-system 7 節）", () => {
    for (const p of [true, false]) {
      expect(paceHint("solo", SOLO_DEFAULT_RATE, p).length).toBeLessThanOrEqual(30);
    }
  });
});

describe("ひとりでライブの周回ペースの説明（「入力について」）", () => {
  it("引数なしは土台の SOLO_OVERHEAD_PROVISIONAL に従う", () => {
    expect(soloPaceNote(SOLO_DEFAULT_RATE)).toBe(soloPaceNote(SOLO_DEFAULT_RATE, SOLO_OVERHEAD_PROVISIONAL));
  });

  it("仮の値の間は、既定のペースとロスの秒数に「まだ実測していない仮の値」を添える", () => {
    const note = soloPaceNote(SOLO_DEFAULT_RATE, true);
    expect(note).toContain(`既定${SOLO_DEFAULT_RATE}`);
    expect(note).toContain(`${OVERHEAD_SEC.solo}秒`);
    expect(note).toContain("まだ実測していない仮の値");
  });

  it("印が false（実測済み）なら「仮」の字が消える。秒数と既定のペースは残る", () => {
    const note = soloPaceNote(SOLO_DEFAULT_RATE, false);
    expect(note).not.toContain("仮");
    expect(note).not.toContain("実測していない");
    expect(note).toContain(`既定${SOLO_DEFAULT_RATE}`);
    expect(note).toContain(`${OVERHEAD_SEC.solo}秒`);
  });

  it("みんなでライブのマッチングの話も「協力」も書かない", () => {
    for (const p of [true, false]) {
      expect(soloPaceNote(SOLO_DEFAULT_RATE, p)).not.toContain("マッチング");
      expect(soloPaceNote(SOLO_DEFAULT_RATE, p)).not.toContain("協力");
    }
  });
});
