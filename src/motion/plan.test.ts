import { describe, expect, it } from "vitest";
import {
  MOTION_BUDGET_MS,
  MOTION_LABEL,
  MOTION_NOTE,
  MOTION_SETTINGS,
  resolvePlan,
  totalMs,
} from "./plan";

const DESKTOP = { osReduce: false, touchOnly: false };
const PHONE = { osReduce: false, touchOnly: true };
const REDUCED = { osReduce: true, touchOnly: false };
const REDUCED_PHONE = { osReduce: true, touchOnly: true };
const ALL_ENVS = [DESKTOP, PHONE, REDUCED, REDUCED_PHONE];

describe("resolvePlan の auto（端末に合わせる）", () => {
  it("パソコンはリッチ", () => {
    expect(resolvePlan("auto", DESKTOP).level).toBe("rich");
  });

  // box-shadow は GPU 合成できず、影の補間はルート配下の全ノードで再計算を起こす。
  // モバイル GPU には重いので、既定で一段落とす。
  it("スマホ/タブレットは控えめ", () => {
    expect(resolvePlan("auto", PHONE).level).toBe("subtle");
  });

  it("OS の視差軽減はオフ（端末クラスより強い）", () => {
    expect(resolvePlan("auto", REDUCED).level).toBe("off");
    expect(resolvePlan("auto", REDUCED_PHONE).level).toBe("off");
  });
});

describe("resolvePlan の明示選択", () => {
  // 「明示選択は環境より優先」という方針そのものをテストで文書化しておく。
  // 方針を変えるならここが落ちる。
  it("環境が何であれ選んだ段階になる", () => {
    for (const env of ALL_ENVS) {
      expect(resolvePlan("rich", env).level).toBe("rich");
      expect(resolvePlan("subtle", env).level).toBe("subtle");
      expect(resolvePlan("off", env).level).toBe("off");
    }
  });

  it("4設定 × 環境4通りの全16ケースでプランが決まる", () => {
    for (const setting of MOTION_SETTINGS) {
      for (const env of ALL_ENVS) {
        expect(resolvePlan(setting, env).level).toBeTruthy();
      }
    }
  });
});

describe("体感速度の予算", () => {
  it.each(MOTION_SETTINGS)("%s は上限以内", (setting) => {
    expect(totalMs(resolvePlan(setting, DESKTOP))).toBeLessThanOrEqual(MOTION_BUDGET_MS);
  });

  it("off は全フェーズが 0ms（＝即時）", () => {
    const p = resolvePlan("off", DESKTOP);
    expect(p.sinkMs).toBe(0);
    expect(p.minBlankMs).toBe(0);
    expect(p.riseMs).toBe(0);
    expect(totalMs(p)).toBe(0);
  });

  it("subtle は無地の間を挟まない（秒数短縮ではなく構造の省略）", () => {
    const p = resolvePlan("subtle", DESKTOP);
    expect(p.sinkMs).toBe(0);
    expect(p.minBlankMs).toBe(0);
    expect(p.riseMs).toBeGreaterThan(0);
  });

  it("subtle の合計は rich より短い", () => {
    expect(totalMs(resolvePlan("subtle", DESKTOP))).toBeLessThan(
      totalMs(resolvePlan("rich", DESKTOP))
    );
  });

  it("totalMs は sink + minBlank + rise と一致する（patience は待ちなので含めない）", () => {
    const p = resolvePlan("rich", DESKTOP);
    expect(totalMs(p)).toBe(p.sinkMs + p.minBlankMs + p.riseMs);
  });

  it("待ちインジケータは遷移の合計時間より後に出る", () => {
    // 通常速度で毎回インジケータが出ると「常に待たされている」ように見える。
    for (const setting of MOTION_SETTINGS) {
      const p = resolvePlan(setting, DESKTOP);
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
