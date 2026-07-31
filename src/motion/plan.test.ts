import { describe, expect, it } from "vitest";
import {
  MOTION_BUDGET_MS,
  MOTION_LABEL,
  MOTION_NOTE,
  MOTION_SETTINGS,
  resolvePlan,
  totalMs,
} from "./plan";

describe("resolvePlan", () => {
  it("auto は OS の視差軽減に追随する", () => {
    expect(resolvePlan("auto", true).level).toBe("off");
    expect(resolvePlan("auto", false).level).toBe("rich");
  });

  // 「明示選択は OS より優先」という方針そのものをテストで文書化しておく。
  // 方針を変えるならここが落ちる。
  it("明示的に選んだ設定は OS の視差軽減より優先される", () => {
    expect(resolvePlan("rich", true).level).toBe("rich");
    expect(resolvePlan("subtle", true).level).toBe("subtle");
    expect(resolvePlan("off", false).level).toBe("off");
  });

  it("4設定 × OS 2状態の全8ケースでプランが決まる", () => {
    for (const setting of MOTION_SETTINGS) {
      for (const osReduce of [true, false]) {
        expect(resolvePlan(setting, osReduce).level).toBeTruthy();
      }
    }
  });
});

describe("体感速度の予算", () => {
  it.each(MOTION_SETTINGS)("%s は上限 %i ms 以内", (setting) => {
    expect(totalMs(resolvePlan(setting, false))).toBeLessThanOrEqual(MOTION_BUDGET_MS);
  });

  it("off は全フェーズが 0ms（＝即時）", () => {
    const p = resolvePlan("off", false);
    expect(p.sinkMs).toBe(0);
    expect(p.minBlankMs).toBe(0);
    expect(p.riseMs).toBe(0);
    expect(totalMs(p)).toBe(0);
  });

  it("subtle は無地の間を挟まない（秒数短縮ではなく構造の省略）", () => {
    const p = resolvePlan("subtle", false);
    expect(p.sinkMs).toBe(0);
    expect(p.minBlankMs).toBe(0);
    expect(p.riseMs).toBeGreaterThan(0);
  });

  it("subtle の合計は rich より短い", () => {
    expect(totalMs(resolvePlan("subtle", false))).toBeLessThan(
      totalMs(resolvePlan("rich", false))
    );
  });

  it("totalMs は sink + minBlank + rise と一致する（patience は待ちなので含めない）", () => {
    const p = resolvePlan("rich", false);
    expect(totalMs(p)).toBe(p.sinkMs + p.minBlankMs + p.riseMs);
  });

  it("待ちインジケータは遷移の合計時間より後に出る", () => {
    // 通常速度で毎回インジケータが出ると「常に待たされている」ように見える。
    for (const setting of MOTION_SETTINGS) {
      const p = resolvePlan(setting, false);
      expect(p.patienceMs).toBeGreaterThan(p.sinkMs + p.minBlankMs);
    }
  });
});

describe("設定画面に出す文言", () => {
  it("全設定にラベルと説明がある", () => {
    for (const setting of MOTION_SETTINGS) {
      expect(MOTION_LABEL[setting]).toBeTruthy();
      expect(MOTION_NOTE[setting]).toBeTruthy();
    }
  });
});
