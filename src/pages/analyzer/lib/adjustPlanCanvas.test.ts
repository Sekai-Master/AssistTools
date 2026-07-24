import { describe, expect, it } from "vitest";
import {
  type AdjustCanvasFinalRun,
  type AdjustCanvasMySekai,
  type AdjustCanvasSong,
  type AdjustCanvasStep2,
  buildAdjustPlanCanvasData,
  deriveCurrentLb,
} from "./adjustPlanCanvas";
import type { MultiLivePlan } from "./multiLiveAdjust";
import type { AdjustmentPlan } from "./liveAdjust";
import type { FinalRunPlan } from "./finalRun";
import { calcLivePt } from "./calcLivePt";

/**
 * adjustPlanCanvas（R5 で全ステップ対応）の安全網。
 *
 * (マイセカイ有無)×(Step2 A/B/なし)×(Step3 none/earn/scoreZero) の
 * 行数・行順・スキップ（詰め）と、scoreZero の「叩かない」文言を固定する。
 */

const SONG: AdjustCanvasSong = { title: "独りんぼエンヴィー", jacketUrl: "https://x/e.png" };
const MELT: AdjustCanvasSong = { title: "メルト", jacketUrl: "https://x/m.png" };

const MYSEKAI: AdjustCanvasMySekai = { countA: 2, countB: 1, countC: 3, totalPt: 5_000 };
const MYSEKAI_ZERO: AdjustCanvasMySekai = { countA: 0, countB: 0, countC: 0, totalPt: 0 };

const MULTI_PLAN: MultiLivePlan = {
  units: [
    { basePoint: 130, liveBonus: 7, minScore: 1_040_000, maxScore: 1_059_999, pt: 62_437, count: 1 },
    { basePoint: 100, liveBonus: 2, minScore: 700_000, maxScore: 719_999, pt: 18_090, count: 2 },
  ],
  liveCount: 3,
  lbCost: 11,
  totalPt: 62_437 + 18_090 * 2,
};

const SWEEP_PLAN: AdjustmentPlan = { liveBonus: 1, bonus: 500, minScore: 0, maxScore: 19_999 };
const FINAL_PLAN: FinalRunPlan = { liveBonus: 3, bonus: 435, minScore: 0, maxScore: 19_999 };

const STEP2_MULTI: AdjustCanvasStep2 = {
  kind: "multi",
  plan: MULTI_PLAN,
  songForBase: (bp) => (bp === 130 ? MELT : SONG),
};
const STEP2_SWEEP: AdjustCanvasStep2 = {
  kind: "sweep",
  plan: SWEEP_PLAN,
  requiredPt: 3_000,
  song: SONG,
};
const FINAL_EARN: AdjustCanvasFinalRun = {
  kind: "earn",
  pt: 1_005,
  basePoint: 100,
  song: SONG,
  plan: FINAL_PLAN,
  planCount: 2,
};
const FINAL_ZERO: AdjustCanvasFinalRun = {
  kind: "scoreZero",
  pt: 1_090,
  finishLb: 0,
  basePoint: 100,
  song: SONG,
};

const COMMON = { requiredPt: 98_617, targetPt: 1_100_000, currentPt: 1_000_000, maxScore: 1_100_000, accent: "#f0f" };

describe("buildAdjustPlanCanvasData — 行数・行順・スキップ", () => {
  it("全ステップ: マイセカイ + multi(2ユニット) + earn = 4行、先頭マイセカイ・末尾ラストプレイ", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, mySekai: MYSEKAI, step2: STEP2_MULTI, finalRun: FINAL_EARN });
    expect(d.rows).toHaveLength(4);
    expect(d.rows[0].label).toBe("マイセカイ採取");
    expect(d.rows[3].time).toContain("ラストプレイ");
  });

  it("マイセカイ totalPt=0 はスキップして詰める（先頭が Step2 になる）", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, mySekai: MYSEKAI_ZERO, step2: STEP2_MULTI, finalRun: FINAL_EARN });
    expect(d.rows).toHaveLength(3);
    expect(d.rows.some((r) => r.label === "マイセカイ採取")).toBe(false);
  });

  it("マイセカイ undefined もスキップ", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, step2: STEP2_MULTI, finalRun: FINAL_EARN });
    expect(d.rows).toHaveLength(3);
  });

  it("Step2 sweep は1行、Step3 なしなら Step3 行も無い", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, mySekai: MYSEKAI, step2: STEP2_SWEEP });
    expect(d.rows).toHaveLength(2); // マイセカイ + sweep1行
    expect(d.rows[1].time).toContain("調整ライブ");
    expect(d.rows[1].sub).toContain("目標ボーナス");
  });

  it("Step2 なし・Step3 earn のみ（マイセカイもなし）は1行", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, finalRun: FINAL_EARN });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].time).toContain("ラストプレイ");
  });

  it("全ステップ省略なら0行（詰めの極限）", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON });
    expect(d.rows).toHaveLength(0);
  });
});

describe("buildAdjustPlanCanvasData — scoreZero の「叩かない」表示", () => {
  it("label に「叩かずにクリア（スコア0）」を出し、sub にスコア帯を出さない", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, mySekai: MYSEKAI, step2: STEP2_MULTI, finalRun: FINAL_ZERO });
    const last = d.rows[d.rows.length - 1];
    expect(last.label).toBe("叩かずにクリア（スコア0）");
    expect(last.sub).not.toContain("スコア"); // スコア帯を出さない
    expect(last.jacket).toBe(SONG.jacketUrl); // ジャケットは載る
    expect(last.warn).toBe(false);
  });
});

describe("buildAdjustPlanCanvasData — R6 Step2消失バグ修正（sweep plan=undefined でも行を出す）", () => {
  it("plan なし・current ありなら「編成そのまま」の行を出す（従来は行ごと消えていた）", () => {
    const step2: AdjustCanvasStep2 = {
      kind: "sweep",
      requiredPt: 1_234,
      song: SONG,
      current: { scoreRange: { min: 800_000, max: 819_999 }, lb: 1 },
    };
    const d = buildAdjustPlanCanvasData({ ...COMMON, step2 });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].label).toContain("編成そのまま");
    expect(d.rows[0].scoreBand).toEqual({ min: 800_000, max: 819_999 });
    expect(d.rows[0].lb).toBe(1);
    expect(d.rows[0].percent).toBe("+1,234 Pt");
  });

  it("plan も current.lb も無くても scoreRange だけで行は消えない（bonus未配線のフォールバック）", () => {
    const step2: AdjustCanvasStep2 = {
      kind: "sweep",
      requiredPt: 500,
      current: { scoreRange: { min: 0, max: 19_999 } },
    };
    const d = buildAdjustPlanCanvasData({ ...COMMON, step2 });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].lb).toBeUndefined();
    expect(d.rows[0].scoreBand).toEqual({ min: 0, max: 19_999 });
  });

  it("モードA複数回化（multiA）の採択プランを multi 形式で描き、各行に目標ボーナスが付く", () => {
    const plan: MultiLivePlan = {
      units: [
        { basePoint: 100, liveBonus: 10, minScore: 1_040_000, maxScore: 1_059_999, pt: 59_115, bonus: 990, count: 1 },
        { basePoint: 100, liveBonus: 10, minScore: 20_000, maxScore: 39_999, pt: 20_246, bonus: 340, count: 1 },
      ],
      liveCount: 2,
      lbCost: 20,
      totalPt: 79_361,
    };
    const step2: AdjustCanvasStep2 = { kind: "multi", plan, songForBase: () => SONG };
    const d = buildAdjustPlanCanvasData({ ...COMMON, step2 });
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0].bonusLabel).toBe("目標ボーナス 990%");
    expect(d.rows[1].bonusLabel).toBe("目標ボーナス 340%");
    const lives = d.summary.find((s) => s.label === "総ライブ回数")!.value;
    expect(lives).toBe("2回");
  });
});

describe("deriveCurrentLb — 5.1（現在ボーナスのまま着地）の締めLB逆引き", () => {
  it("calcLivePt が requiredPt と一致するLBを、liveBonuses の並び順で最初に見つかったものとして返す", () => {
    const base = 100;
    const bonus = 500;
    const scoreMin = 500_000;
    // ON既定 [0,1] のうち、実際に一致するLBを total から求めて往復確認する。
    const ptAtLb1 = calcLivePt(base, bonus, scoreMin, 1);
    const lb = deriveCurrentLb(base, bonus, ptAtLb1, scoreMin, true);
    expect(lb).toBeDefined();
    expect(calcLivePt(base, bonus, scoreMin, lb!)).toBe(ptAtLb1);
  });

  it("どのLBでも一致しない requiredPt は undefined を返す", () => {
    const lb = deriveCurrentLb(100, 500, -999, 500_000, true);
    expect(lb).toBeUndefined();
  });
});

describe("buildAdjustPlanCanvasData — 合計（マイセカイはライブ回数に数えない）", () => {
  it("総ライブ回数は Step2 + Step3 のみ（採取は除外）、合計獲得は全ステップの和", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, mySekai: MYSEKAI, step2: STEP2_MULTI, finalRun: FINAL_EARN });
    const lives = d.summary.find((s) => s.label === "総ライブ回数")!.value;
    expect(lives).toBe(`${MULTI_PLAN.liveCount + 1}回`); // マイセカイの採取は加えない
    const total = d.summary.find((s) => s.label === "合計獲得")!.value;
    const expected = MYSEKAI.totalPt + MULTI_PLAN.totalPt + FINAL_EARN.pt;
    expect(total).toBe(`${expected.toLocaleString()} Pt`);
  });

  it("LB合計はクリスタル換算つき・回復時間（約Nh）は出さない", () => {
    const d = buildAdjustPlanCanvasData({ ...COMMON, step2: STEP2_MULTI, finalRun: FINAL_EARN });
    const lb = d.summary.find((s) => s.label === "LB合計")!.value;
    expect(lb).toContain("クリスタル");
    expect(lb).not.toContain("h）"); // 時間換算は削除
  });
});
