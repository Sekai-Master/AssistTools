import { describe, expect, it } from "vitest";
import { buildBulkFractionChoices, compareBulkFraction } from "./modeABulkFraction";
import { planLiveAdjustment } from "./liveAdjust";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE_N, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import type { ModeAChoice, ModeAChoiceForm } from "./modeAChoices";

/**
 * モードA「現編成N回（バルク）＋端数1回（選択）」候補構築の回帰固定（R6 §7）。
 *
 * モック不使用。実パイプライン（planLiveAdjustment）で targetScoreRange / adjustmentPlans を
 * 実算出し、buildBulkFractionChoices は探索本体の詰め替え・並べ替えだけを検証する。
 * 本丸: 組み替えは端数の1回だけ（バルクは現編成固定・bonus キー無し）・下げ幅小順・N=0/カバレッジ。
 */

const LB_ALL = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i); // OFF: 0..10
const MAX_SCORE_N = DEFAULT_MAX_SCORE_N;
const BONUS = 990;
const BASE = 100;

/** 実パイプラインで N=0 の全列挙源（targetScoreRange / adjustmentPlans）を作る。 */
function build(requiredPt: number): ModeAChoice[] {
  const la = planLiveAdjustment(requiredPt, BONUS, LB_ALL, MAX_SCORE_N, BASE);
  return buildBulkFractionChoices({
    requiredPt,
    base: BASE,
    bonus: BONUS,
    useMySekai: false,
    maxScoreN: MAX_SCORE_N,
    adjustmentPlans: la.plans,
    targetScoreRange: la.targetScoreRange,
  });
}

type BulkFractionForm = Extract<ModeAChoiceForm, { type: "bulkFraction" }>;
const formOf = (c: ModeAChoice): BulkFractionForm => {
  if (c.form.type !== "bulkFraction") throw new Error("expected bulkFraction form");
  return c.form;
};

/** 単発着地する残額（現ボーナス990・LB1・スコア帯3）。N=0 検証に使う。 */
const SINGLE_LANDING = calcLivePt(BASE, BONUS, 3 * SCORE_STEP, 1);

describe("buildBulkFractionChoices — 構造不変条件（本丸・帯で検証）", () => {
  it("末尾=端数1回・bonus キーは高々1つで必ず末尾・非末尾は現編成（bonus無し・単一条件）", () => {
    // 複数の残額（単発着地/複数回着地/カバレッジ帯）でプロパティ検証する。
    const samples = [7_809, SINGLE_LANDING, 10_000, 10_023, 12_345, 34_567];
    for (const req of samples) {
      const choices = build(req);
      expect(choices.length).toBeGreaterThan(0);
      for (const c of choices) {
        const f = formOf(c);
        const units = f.plan.units;
        // 端数 unit は常に末尾・count===1
        expect(units[units.length - 1].count).toBe(1);
        // bonus キーを持つ unit は高々1つで必ず末尾（組み替えは端数だけ）
        const withBonus = units.filter((u) => u.bonus !== undefined);
        expect(withBonus.length).toBeLessThanOrEqual(1);
        if (withBonus.length === 1) expect(units[units.length - 1].bonus).not.toBeUndefined();
        // 末尾以外（バルク）は bonus===undefined（現編成N回が主）
        for (let i = 0; i < units.length - 1; i++) expect(units[i].bonus).toBeUndefined();
        // 恒等式: bulk.pt×N + fraction.pt === requiredPt / liveCount === bulkCount+1
        expect(f.plan.totalPt).toBe(req);
        expect(c.liveCount).toBe(f.bulkCount + 1);
        expect(f.plan.liveCount).toBe(f.bulkCount + 1);
        // N=0 は端数のみ（単一 unit）
        if (f.bulkCount === 0) expect(units.length).toBe(1);
        // N>=1 はバルク（先頭・count=N・単一条件）＋端数（末尾）の2 unit
        if (f.bulkCount >= 1) {
          expect(units.length).toBe(2);
          expect(units[0].count).toBe(f.bulkCount);
        }
      }
    }
  });
});

describe("buildBulkFractionChoices — 397回帰（下げ幅小順・現編成が主）", () => {
  const choices = build(7_809);

  it("fractionBonus は単調非増加（397%級は末尾へ沈む）", () => {
    for (let i = 1; i < choices.length; i++) {
      expect(formOf(choices[i]).fractionBonus).toBeLessThanOrEqual(formOf(choices[i - 1]).fractionBonus);
    }
  });

  it("下げ幅0（現ボーナス）候補が先頭・下げた候補も存在するが先頭ではない", () => {
    expect(choices[0].minTargetBonus).toBe(BONUS);
    expect(formOf(choices[0]).fractionBonus).toBe(BONUS);
    expect(choices.some((c) => formOf(c).fractionBonus < BONUS)).toBe(true);
  });
});

describe("buildBulkFractionChoices — N=0（端数のみで着地）", () => {
  const choices = build(SINGLE_LANDING);

  it("単発着地額では先頭が bulkCount===0・現ボーナス・端数のみ", () => {
    const head = formOf(choices[0]);
    expect(head.bulkCount).toBe(0);
    expect(head.fractionBonus).toBe(BONUS);
    expect(choices[0].kind).toBe("keep");
    // 現ボーナス端数なので bonus キー無し（＝画像は「編成そのまま」）
    expect(head.plan.units[0].bonus).toBeUndefined();
  });
});

describe("buildBulkFractionChoices — カバレッジ / NG（勝利条件4）", () => {
  it("残額 50（<100）は候補ゼロ（端数最小値未満で原理的に不可）", () => {
    expect(build(50)).toEqual([]);
    expect(build(99)).toEqual([]);
  });

  it("残額 100 は着地できる（端数のみ候補が出る）", () => {
    const choices = build(100);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => formOf(c).bulkCount === 0)).toBe(true);
  });

  it("代表残額の帯 10,000〜10,050 は全件候補≥1件", () => {
    for (let req = 10_000; req <= 10_050; req++) {
      expect(build(req).length).toBeGreaterThan(0);
    }
  });

  it("requiredPt <= 0 は空配列", () => {
    expect(
      buildBulkFractionChoices({
        requiredPt: 0,
        base: BASE,
        bonus: BONUS,
        useMySekai: false,
        maxScoreN: MAX_SCORE_N,
        adjustmentPlans: [],
        targetScoreRange: undefined,
      })
    ).toEqual([]);
  });
});

describe("compareBulkFraction — 並べ替えキー", () => {
  it("fractionBonus 降順 → liveCount 昇順のタイブレーク", () => {
    const choices = build(10_000);
    const sorted = [...choices].sort(compareBulkFraction);
    // buildBulkFractionChoices は既に compareBulkFraction 済みなので順序が保たれる
    expect(sorted.map((c) => c.id)).toEqual(choices.map((c) => c.id));
    // 同一 fractionBonus 内では liveCount 昇順
    for (let i = 1; i < choices.length; i++) {
      const a = formOf(choices[i - 1]);
      const b = formOf(choices[i]);
      if (a.fractionBonus === b.fractionBonus) {
        expect(choices[i - 1].liveCount).toBeLessThanOrEqual(choices[i].liveCount);
      }
    }
  });
});
