import { describe, expect, it } from "vitest";
import {
  buildModeAChoices,
  canvasStep2FromChoice,
  splitModeAChoices,
  fractionUnitOf,
  bulkUnitOf,
  type ModeAChoice,
  type ModeAChoiceForm,
} from "./modeAChoices";
import { planLiveAdjustment } from "./liveAdjust";
import { planModeAKeepMulti, planModeAMulti } from "./modeAMulti";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE_N, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import type { CalculationResultV6 } from "./calculator";

/**
 * モードA「現編成N回＋端数1回」再構成のオーケストレータ回帰固定（R6 §7）。
 *
 * モック不使用。実パイプライン（planLiveAdjustment / planModeAMulti / planModeAKeepMulti）を
 * 実呼び出しして liveAdjustment 相当を合成し、buildModeAChoices の
 * 「bulkFraction 主役 ＋ 従来 multi 畳み ＋ 重複排除」を検証する。
 */

const LB_ALL = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i); // OFF: 0..10
const MAX_SCORE_N = DEFAULT_MAX_SCORE_N;
const BONUS = 990;
const BASE = 100;

function composeLive(liveRequired: number): CalculationResultV6["liveAdjustment"] {
  const la = planLiveAdjustment(liveRequired, BONUS, LB_ALL, MAX_SCORE_N, BASE);
  return {
    requiredPt: liveRequired,
    status: "OK",
    multiA: planModeAMulti(liveRequired, BASE, BONUS, LB_ALL, MAX_SCORE_N),
    multiAKeep: planModeAKeepMulti(liveRequired, BASE, BONUS, LB_ALL, MAX_SCORE_N),
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

type BulkFractionForm = Extract<ModeAChoiceForm, { type: "bulkFraction" }>;
const formOf = (c: ModeAChoice): BulkFractionForm => {
  if (c.form.type !== "bulkFraction") throw new Error("expected bulkFraction");
  return c.form;
};

const SINGLE_LANDING = calcLivePt(BASE, BONUS, 3 * SCORE_STEP, 1);

describe("buildModeAChoices — 主役は bulkFraction・下げ幅小順", () => {
  it("先頭は bulkFraction・現ボーナス（下げ幅0）が既定選択", () => {
    const { choices } = build(7_809);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices[0].form.type).toBe("bulkFraction");
    expect(choices[0].minTargetBonus).toBe(BONUS);
    expect(choices[0].kind).toBe("keep");
  });

  it("bulkFraction 区間で fractionBonus が単調非増加（397%級は後方）", () => {
    const { choices } = build(7_809);
    const bf = choices.filter((c) => c.form.type === "bulkFraction");
    for (let i = 1; i < bf.length; i++) {
      expect(formOf(bf[i]).fractionBonus).toBeLessThanOrEqual(formOf(bf[i - 1]).fractionBonus);
    }
    expect(bf.some((c) => formOf(c).fractionBonus < BONUS)).toBe(true);
  });

  it("単発着地額では先頭が bulkCount===0（端数のみ・現編成1回）", () => {
    const { live, choices } = build(SINGLE_LANDING);
    expect(live.targetScoreRange).toBeDefined();
    expect(choices[0].form.type).toBe("bulkFraction");
    expect(formOf(choices[0]).bulkCount).toBe(0);
    expect(choices[0].minTargetBonus).toBe(BONUS);
  });
});

describe("splitModeAChoices — bulkFraction 前・legacy 後", () => {
  it("bulkFraction が全て legacy より前・legacy は multi のみ", () => {
    const { choices } = build(7_809);
    const { bulkFraction, legacy } = splitModeAChoices(choices);
    expect(bulkFraction.length).toBeGreaterThan(0);
    // 連結すると元の順序（前半 bulkFraction・後半 legacy）に戻る
    expect([...bulkFraction, ...legacy].map((c) => c.id)).toEqual(choices.map((c) => c.id));
    expect(bulkFraction.every((c) => c.form.type === "bulkFraction")).toBe(true);
    expect(legacy.every((c) => c.form.type === "multi")).toBe(true);
  });

  it("legacy（従来 multi）に bulkFraction と物理同一のプランは混入しない", () => {
    const { choices } = build(7_809);
    const { bulkFraction, legacy } = splitModeAChoices(choices);
    // 物理署名: 現ボーナス(990)と undefined を同一視し、units 順序にも依らない（破壊者 HIGH-1）。
    // bonus キーの表記差で自明成立していた旧テストを、物理同一性で照合する形に修正。
    const sig = (units: { basePoint: number; liveBonus: number; minScore: number; pt: number; count: number; bonus?: number }[]) =>
      units
        .map((u) => `${u.basePoint}/${u.liveBonus}/${u.minScore}/${u.pt}x${u.count}/${u.bonus === undefined || u.bonus === BONUS ? "" : u.bonus}`)
        .sort()
        .join("|");
    const bfSigs = new Set(bulkFraction.map((c) => sig(formOf(c).plan.units)));
    for (const c of legacy) {
      if (c.form.type !== "multi") continue;
      expect(bfSigs.has(sig(c.form.plan.units))).toBe(false);
    }
  });
});

describe("canvasStep2FromChoice — 選択が画像に反映", () => {
  it("N=0 現ボーナス → sweep.current（バルク行なし）", () => {
    const { choices } = build(SINGLE_LANDING);
    const step = canvasStep2FromChoice(choices[0], SINGLE_LANDING);
    expect(step.kind).toBe("sweep");
    if (step.kind === "sweep") {
      expect(step.current).toBeDefined();
      expect(step.plan).toBeUndefined();
    }
  });

  it("N=0 組み替え → sweep.plan（目標ボーナス付き）", () => {
    const { choices } = build(100); // 残額100は N=0 の組み替え候補のみ
    const rebuild = choices.find((c) => c.form.type === "bulkFraction" && formOf(c).bulkCount === 0 && c.kind === "rebuild");
    expect(rebuild).toBeDefined();
    const step = canvasStep2FromChoice(rebuild!, 100);
    expect(step.kind).toBe("sweep");
    if (step.kind === "sweep") expect(step.plan).toBeDefined();
  });

  it("N≥1 → kind:multi、units[0]（バルク）に bonus 無し・末尾は fractionBonus!==BONUS のときのみ bonus 有り", () => {
    const { choices } = build(7_809);
    const withBulk = choices.find((c) => c.form.type === "bulkFraction" && formOf(c).bulkCount >= 1);
    expect(withBulk).toBeDefined();
    const f = formOf(withBulk!);
    const step = canvasStep2FromChoice(withBulk!, 7_809);
    expect(step.kind).toBe("multi");
    expect(f.plan.units[0].bonus).toBeUndefined(); // バルク行=目標ボーナス表記なし
    const tail = f.plan.units[f.plan.units.length - 1];
    expect(tail.bonus === undefined).toBe(f.fractionBonus === BONUS);
  });

  it("異なる bulkFraction 候補で canvas 出力が異なる（選択反映）", () => {
    const { choices } = build(7_809);
    const bf = choices.filter((c) => c.form.type === "bulkFraction");
    expect(bf.length).toBeGreaterThanOrEqual(2);
    const a = canvasStep2FromChoice(bf[0], 7_809);
    const b = canvasStep2FromChoice(bf[1], 7_809);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe("fractionUnitOf / bulkUnitOf — index 直書き回避ヘルパー", () => {
  it("N=0 は bulk 無し・fraction は唯一の unit", () => {
    const { choices } = build(SINGLE_LANDING);
    const f = formOf(choices[0]); // bulkCount===0
    expect(bulkUnitOf(f)).toBeUndefined();
    expect(fractionUnitOf(f)).toBe(f.plan.units[0]);
  });

  it("N≥1 は bulk=先頭・fraction=末尾", () => {
    const { choices } = build(7_809);
    const withBulk = choices.find((c) => c.form.type === "bulkFraction" && formOf(c).bulkCount >= 1)!;
    const f = formOf(withBulk);
    expect(bulkUnitOf(f)).toBe(f.plan.units[0]);
    expect(fractionUnitOf(f)).toBe(f.plan.units[f.plan.units.length - 1]);
  });
});

describe("buildModeAChoices — 空ケース", () => {
  it("requiredPt <= 0 は空配列（既存 NgPanels に委ねる）", () => {
    const live = composeLive(0);
    expect(buildModeAChoices({ live: { ...live, requiredPt: 0 }, bonus: BONUS, base: BASE, useMySekai: false })).toEqual([]);
  });

  it("残額 50（<100）は候補ゼロ", () => {
    const { choices } = build(50);
    expect(choices).toEqual([]);
  });
});
