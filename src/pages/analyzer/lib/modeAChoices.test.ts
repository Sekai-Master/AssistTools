import { describe, expect, it } from "vitest";
import { buildModeAChoices, canvasStep2FromChoice, type ModeAChoice } from "./modeAChoices";
import { planLiveAdjustment } from "./liveAdjust";
import { planModeAKeepMulti, planModeAMulti } from "./modeAMulti";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE_N, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import type { CalculationResultV6 } from "./calculator";

/**
 * モードA選択肢提示型（R6 §1・§7）の並び順・回帰固定。
 *
 * モック不使用。実パイプライン（planLiveAdjustment / planModeAMulti /
 * planModeAKeepMulti）を実呼び出しして liveAdjustment 相当を合成し、
 * buildModeAChoices の詰め替え・並べ替えだけを検証する。
 * 本丸は「397% 級の大下げ案が先頭に来ない・現ボーナス維持が最上位」の固定。
 */

const LB_ALL = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i); // OFF: 0..10
const MAX_SCORE_N = DEFAULT_MAX_SCORE_N; // 既定スコア上限（1,100,000）相当。定数から導出
const BONUS = 990;
const BASE = 100;

/** 実パイプラインを実呼び出しして liveAdjustment 相当を合成する。 */
function composeLive(liveRequired: number): CalculationResultV6["liveAdjustment"] {
  const la = planLiveAdjustment(liveRequired, BONUS, LB_ALL, MAX_SCORE_N, BASE);
  const multiA = planModeAMulti(liveRequired, BASE, BONUS, LB_ALL, MAX_SCORE_N);
  const multiAKeep = planModeAKeepMulti(liveRequired, BASE, BONUS, LB_ALL, MAX_SCORE_N);
  return {
    requiredPt: liveRequired,
    status: "OK",
    multiA,
    multiAKeep,
    targetScoreRange: la.targetScoreRange,
    adjustmentPlans: la.plans,
    maxLiveBonus: MAX_LIVE_BONUS,
    logMessage: "",
  };
}

function build(liveRequired: number): { live: CalculationResultV6["liveAdjustment"]; choices: ModeAChoice[] } {
  const live = composeLive(liveRequired);
  const choices = buildModeAChoices({ live, bonus: BONUS, base: BASE, useMySekai: false });
  return { live, choices };
}

const rebuildsOf = (choices: ModeAChoice[]) => choices.filter((c) => c.kind === "rebuild");
const keepsOf = (choices: ModeAChoice[]) => choices.filter((c) => c.kind === "keep");

describe("buildModeAChoices — 397% 回帰（受け入れ条件の本丸）", () => {
  const { live, choices } = build(7_809);

  it("先頭は keep（編成そのまま）。targetScoreRange が無いので複数回・現ボーナス990", () => {
    expect(choices.length).toBeGreaterThan(0);
    expect(choices[0].kind).toBe("keep");
    if (!live.targetScoreRange) {
      expect(choices[0].form.type).toBe("multi");
    }
    expect(choices[0].minTargetBonus).toBe(BONUS);
  });

  it("すべての keep 候補の index < すべての rebuild 候補の index", () => {
    const lastKeep = choices.reduce((acc, c, i) => (c.kind === "keep" ? i : acc), -1);
    const firstRebuild = choices.findIndex((c) => c.kind === "rebuild");
    if (firstRebuild !== -1) expect(lastKeep).toBeLessThan(firstRebuild);
  });

  it("rebuild 区間で minTargetBonus が単調非増加（397%級は必ず後方）", () => {
    const rebuilds = rebuildsOf(choices);
    expect(rebuilds.length).toBeGreaterThan(0);
    for (let i = 1; i < rebuilds.length; i++) {
      expect(rebuilds[i].minTargetBonus).toBeLessThanOrEqual(rebuilds[i - 1].minTargetBonus);
    }
    // 現ボーナスより低い（＝編成を弱める）案が存在するが、いずれも先頭ではない
    expect(rebuilds.some((c) => c.minTargetBonus < BONUS)).toBe(true);
  });
});

describe("buildModeAChoices — 現ボーナス維持1回が最上位", () => {
  it("単発着地する残額では先頭が current（編成そのまま・1回）", () => {
    // 現ボーナス990・LB1・スコア帯3で単発着地する額を逆算
    const req = calcLivePt(BASE, BONUS, 3 * SCORE_STEP, 1);
    const { live, choices } = build(req);
    expect(live.targetScoreRange).toBeDefined();
    expect(choices[0].kind).toBe("keep");
    expect(choices[0].form.type).toBe("current");
    expect(choices[0].minTargetBonus).toBe(BONUS);
  });
});

describe("buildModeAChoices — 重複排除", () => {
  it("(a) targetScoreRange がある入力で liveCount===1 の keep-multi は現れない", () => {
    const req = calcLivePt(BASE, BONUS, 3 * SCORE_STEP, 1);
    const { choices } = build(req);
    const keepMulti = keepsOf(choices).filter((c) => c.form.type === "multi");
    expect(keepMulti.every((c) => c.form.type === "multi" && c.form.plan.liveCount >= 2)).toBe(true);
  });

  it("(b) multiA の全 unit 現ボーナスプランは rebuild に混入しない", () => {
    const { choices } = build(7_809);
    const rebuildMulti = rebuildsOf(choices).filter((c) => c.form.type === "multi");
    for (const c of rebuildMulti) {
      if (c.form.type !== "multi") continue;
      expect(c.form.plan.units.some((u) => (u.bonus ?? BONUS) !== BONUS)).toBe(true);
    }
  });
});

describe("canvasStep2FromChoice — 選択が画像に反映", () => {
  it("current → sweep.current / single → sweep.plan / multi → kind:multi", () => {
    // 単発着地する入力: current（先頭）と rebuild 単発（bonus!==990）が両方出る
    const single = calcLivePt(BASE, BONUS, 3 * SCORE_STEP, 1);
    const { choices: cur } = build(single);
    const currentStep = canvasStep2FromChoice(cur[0], single);
    expect(currentStep.kind).toBe("sweep");
    if (currentStep.kind === "sweep") expect(currentStep.current).toBeDefined();

    const singleForm = cur.find((c) => c.form.type === "single");
    expect(singleForm).toBeDefined();
    const singleStep = canvasStep2FromChoice(singleForm!, single);
    expect(singleStep.kind).toBe("sweep");
    if (singleStep.kind === "sweep") expect(singleStep.plan).toBeDefined();

    // 複数回着地入力（7809）: keep-multi が出る
    const { choices } = build(7_809);
    const multiChoice = choices.find((c) => c.form.type === "multi");
    expect(multiChoice).toBeDefined();
    expect(canvasStep2FromChoice(multiChoice!, 7_809).kind).toBe("multi");
  });

  it("keep-multi の units には bonus キーが無い（画像に目標ボーナスが付かない）", () => {
    const { choices } = build(7_809);
    const keepMulti = keepsOf(choices).find((c) => c.form.type === "multi");
    expect(keepMulti).toBeDefined();
    if (keepMulti && keepMulti.form.type === "multi") {
      expect(keepMulti.form.plan.units.every((u) => u.bonus === undefined)).toBe(true);
    }
  });

  it("選択候補が変われば画像出力も変わる（旧 multiA.plans[0] 固定と違い任意候補を選べる）", () => {
    const { choices } = build(7_809);
    const multis = choices.filter((c) => c.form.type === "multi");
    expect(multis.length).toBeGreaterThanOrEqual(2);
    const a = canvasStep2FromChoice(multis[0], 7_809);
    const b = canvasStep2FromChoice(multis[1], 7_809);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe("buildModeAChoices — 空ケース", () => {
  it("requiredPt <= 0 は空配列（既存 NgPanels に委ねる。新状態表示を作らない）", () => {
    const live = composeLive(0);
    expect(buildModeAChoices({ live: { ...live, requiredPt: 0 }, bonus: BONUS, base: BASE, useMySekai: false })).toEqual([]);
  });
});
