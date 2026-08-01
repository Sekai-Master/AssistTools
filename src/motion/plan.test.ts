import { describe, expect, it } from "vitest";
import {
  firstPaintMs,
  hasCascade,
  MOTION_FIRST_PAINT_BUDGET_MS,
  MOTION_LABEL,
  MOTION_NOTE,
  MOTION_SETTINGS,
  MOTION_TOTAL_BUDGET_MS,
  resolvePlan,
  stageVars,
  totalMs,
} from "./plan";

const DESKTOP = { osReduce: false, touchOnly: false };
const PHONE = { osReduce: false, touchOnly: true };
const REDUCED = { osReduce: true, touchOnly: false };
const REDUCED_PHONE = { osReduce: true, touchOnly: true };
const ALL_ENVS = [DESKTOP, PHONE, REDUCED, REDUCED_PHONE];

describe("resolvePlan の auto（端末に合わせる）", () => {
  // リッチは尺が1秒を超える見世物になったので、既定では出さない（2026-08-01 Nori 判断）。
  // 端末クラスでの分岐もやめ、PC でもスマホでも控えめが既定。
  it("端末を問わず控えめ", () => {
    expect(resolvePlan("auto", DESKTOP).level).toBe("subtle");
    expect(resolvePlan("auto", PHONE).level).toBe("subtle");
  });

  it("OS の視差軽減はオフ", () => {
    expect(resolvePlan("auto", REDUCED).level).toBe("off");
    expect(resolvePlan("auto", REDUCED_PHONE).level).toBe("off");
  });

  it("リッチは明示的に選ばないと出ない", () => {
    for (const env of ALL_ENVS) {
      expect(resolvePlan("auto", env).level).not.toBe("rich");
    }
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
  // ★ 予算は2本立て。合計の長さそのものではなく「操作してから最初の中身が
  //   出はじめるまで」で縛る。リッチのカスケードは、もう読める画面の上で
  //   完了していく時間なので、合計に含めて一律に縛ると設計が潰れる。
  it.each(MOTION_SETTINGS)("%s は最初の中身が出るまでの上限以内", (setting) => {
    expect(firstPaintMs(resolvePlan(setting, DESKTOP))).toBeLessThanOrEqual(
      MOTION_FIRST_PAINT_BUDGET_MS
    );
  });

  it.each(MOTION_SETTINGS)("%s は出そろうまでの上限以内", (setting) => {
    expect(totalMs(resolvePlan(setting, DESKTOP))).toBeLessThanOrEqual(MOTION_TOTAL_BUDGET_MS);
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

  it("subtle はブロック単位のカスケードを持たない（既定として軽いままにする）", () => {
    const p = resolvePlan("subtle", DESKTOP);
    expect(hasCascade(p)).toBe(false);
    expect(p.sinkStaggerMs).toBe(0);
    expect(p.riseStaggerMs).toBe(0);
  });

  it("rich だけがカスケードを持つ", () => {
    const p = resolvePlan("rich", DESKTOP);
    expect(hasCascade(p)).toBe(true);
    expect(p.riseStaggerMs).toBeGreaterThan(0);
  });

  // 溶けるより浮き上がる方に尺を使う（Nori の指定: ゆっくり浮き上がってほしい）。
  it("rich は沈みより浮上に時間をかける", () => {
    const p = resolvePlan("rich", DESKTOP);
    expect(p.riseMs).toBeGreaterThan(p.sinkMs);
    expect(p.riseSpanMs).toBeGreaterThan(p.sinkSpanMs);
  });

  it("総尺は 1ブロックの尺 + カスケードの幅", () => {
    for (const setting of MOTION_SETTINGS) {
      const p = resolvePlan(setting, DESKTOP);
      expect(p.sinkMs).toBe(p.sinkSpanMs + p.sinkStaggerMs);
      expect(p.riseMs).toBe(p.riseSpanMs + p.riseStaggerMs);
    }
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

  it("待ちインジケータは通常の沈み＋無地より後に出る", () => {
    // 通常速度で毎回インジケータが出ると「常に待たされている」ように見える。
    for (const setting of MOTION_SETTINGS) {
      const p = resolvePlan(setting, DESKTOP);
      expect(p.patienceMs).toBeGreaterThan(p.sinkMs + p.minBlankMs);
    }
  });
});

describe("stageVars", () => {
  it("プランの ms/px を CSS 変数の文字列にする（CSS に数字を書かないため）", () => {
    const p = resolvePlan("rich", DESKTOP);
    expect(stageVars(p)).toMatchObject({
      "--stage-sink": `${p.sinkSpanMs}ms`,
      "--stage-sink-cascade": `${p.sinkStaggerMs}ms`,
      "--stage-sink-total": `${p.sinkMs}ms`,
      "--stage-rise": `${p.riseSpanMs}ms`,
      "--stage-rise-cascade": `${p.riseStaggerMs}ms`,
      "--stage-rise-total": `${p.riseMs}ms`,
      "--stage-blur": `${p.blurPx}px`,
    });
  });

  it("全設定で単位付きの値が揃う", () => {
    for (const setting of MOTION_SETTINGS) {
      for (const [name, value] of Object.entries(stageVars(resolvePlan(setting, DESKTOP)))) {
        expect(name.startsWith("--stage-")).toBe(true);
        expect(value).toMatch(/^\d+(ms|px)$/);
      }
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
