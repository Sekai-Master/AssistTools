import type { AdjustmentPlan } from "./liveAdjust";
import type { MultiLivePlan } from "./multiLiveAdjust";
import type { CalculationResultV6 } from "./calculator";
import {
  type AdjustCanvasSong,
  type AdjustCanvasStep2,
  deriveCurrentLb,
} from "./adjustPlanCanvas";

/**
 * モードA（曲固定・ボーナス可変）を「選択肢提示型」にするための候補リスト構築（R6 §1）。
 *
 * 探索本体（liveAdjust 5.1/5.2・planFromReachablePtTable の frontier/best 選択・
 * buildBonusSweepTable/buildKeepBonusTable）は1行も触らない。ここは既存の探索結果
 * （targetScoreRange / adjustmentPlans / multiA / multiAKeep）を **詰め替えて並べ替える
 * 純関数**に徹する。並び順の定義そのものが「編成変更が小さい順」の実装:
 *   ① 現ボーナス維持・1回（targetScoreRange）
 *   ② 現ボーナス維持・単発の別内訳（adjustmentPlans の bonus===現在値）
 *   ③ 現ボーナス維持・複数回（multiAKeep）
 *   ④ 組み替え・単発（adjustmentPlans の bonus!==現在値）
 *   ⑤ 組み替え・複数回（multiA のうち現ボーナス以外の unit を含むもの）
 * ④⑤を「目標ボーナス降順（＝下げ幅昇順）」で並べ、397% 級の大下げ案を後方へ沈める。
 */

/** 候補の実体。既存の canvas 3分岐（current / sweep.plan / multi）と1:1対応する。 */
export type ModeAChoiceForm =
  | { type: "current"; scoreRange: { min: number; max: number }; lb?: number }
  | { type: "single"; plan: AdjustmentPlan }
  | { type: "multi"; plan: MultiLivePlan };

export interface ModeAChoice {
  /** 内容署名（選択の同一性判定・React key 用）。 */
  id: string;
  /** keep=現在ボーナス維持（編成そのまま） / rebuild=組み替え。 */
  kind: "keep" | "rebuild";
  form: ModeAChoiceForm;
  /** 候補中で最も低い目標ボーナス。keep では現在ボーナス。並べ替えキー。 */
  minTargetBonus: number;
  /** current=1, single=1, multi=plan.liveCount。 */
  liveCount: number;
  /** current は lb ?? 0。並べ替え専用（表示には使わない）。 */
  lbCost: number;
  /** = liveRequired（全候補が厳密着地なので共通）。 */
  totalPt: number;
}

/** units を一意に識別する署名（multi の React key・重複判定用）。 */
function signMulti(plan: MultiLivePlan): string {
  return (
    "multi/" +
    plan.units
      .map((u) => `${u.basePoint}/${u.liveBonus}/${u.minScore}/${u.pt}x${u.count}/${u.bonus ?? ""}`)
      .join("|")
  );
}

/** 単発プランの署名。bonus・LB・スコア下限で内容が一意に決まる。 */
function signSingle(plan: AdjustmentPlan): string {
  return `single/${plan.bonus}/${plan.liveBonus}/${plan.minScore}`;
}

/** 単発プラン → 候補。totalPt は厳密着地なので requiredPt に等しい。 */
function singleChoice(
  plan: AdjustmentPlan,
  kind: "keep" | "rebuild",
  requiredPt: number
): ModeAChoice {
  return {
    id: signSingle(plan),
    kind,
    form: { type: "single", plan },
    minTargetBonus: plan.bonus,
    liveCount: 1,
    lbCost: plan.liveBonus,
    totalPt: requiredPt,
  };
}

/** 複数回プラン → 候補。minTargetBonus は unit の目標ボーナス最小（無ければ現ボーナス）。 */
function multiChoice(
  plan: MultiLivePlan,
  kind: "keep" | "rebuild",
  bonus: number
): ModeAChoice {
  return {
    id: signMulti(plan),
    kind,
    form: { type: "multi", plan },
    minTargetBonus: Math.min(...plan.units.map((u) => u.bonus ?? bonus)),
    liveCount: plan.liveCount,
    lbCost: plan.lbCost,
    totalPt: plan.totalPt,
  };
}

/** 候補のスコア下限（rebuild 並べ替えのタイブレーク用）。 */
function choiceMinScore(c: ModeAChoice): number {
  if (c.form.type === "single") return c.form.plan.minScore;
  if (c.form.type === "multi") return Math.min(...c.form.plan.units.map((u) => u.minScore));
  return c.form.scoreRange.min;
}

/**
 * 組み替え候補の並べ替え: 目標ボーナス降順（＝下げ幅昇順）が第1キー。
 * recommendPlans の 25%刻み優先グループ化は**使わない**（397%が900%より先に来る逆転を
 * 招くため）。byBonusDesc の流儀（同ボーナスならスコア低い順）だけ踏襲しつつ、
 * liveCount 昇順 → lbCost 昇順 → minScore 昇順でタイブレークする。
 */
function compareRebuild(a: ModeAChoice, b: ModeAChoice): number {
  return (
    b.minTargetBonus - a.minTargetBonus ||
    a.liveCount - b.liveCount ||
    a.lbCost - b.lbCost ||
    choiceMinScore(a) - choiceMinScore(b)
  );
}

/** ① 現ボーナス維持・1回。targetScoreRange があれば作る（LB は deriveCurrentLb で逆引き）。 */
function buildCurrentChoice(input: {
  live: CalculationResultV6["liveAdjustment"];
  bonus: number;
  base: number;
  useMySekai: boolean;
}): ModeAChoice | undefined {
  const { live, bonus, base, useMySekai } = input;
  const range = live.targetScoreRange;
  if (!range) return undefined;
  const lb = deriveCurrentLb(base, bonus, live.requiredPt, range.min, useMySekai);
  return {
    id: `current/${lb ?? ""}/${range.min}`,
    kind: "keep",
    form: { type: "current", scoreRange: range, lb },
    minTargetBonus: bonus,
    liveCount: 1,
    lbCost: lb ?? 0,
    totalPt: live.requiredPt,
  };
}

/**
 * ② 現ボーナス維持・単発の別内訳（adjustmentPlans の bonus===現在値）。
 * ① と同一（LB・スコア下限が一致）の1件だけは重複として除外する。
 * 同一ボーナスなので並びは実質スコア下限昇順（byBonusDesc 相当）。
 */
function buildKeepSingles(
  plans: readonly AdjustmentPlan[],
  bonus: number,
  requiredPt: number,
  current: ModeAChoice | undefined
): ModeAChoice[] {
  const isDupOfCurrent = (plan: AdjustmentPlan): boolean =>
    current?.form.type === "current" &&
    plan.liveBonus === current.form.lb &&
    plan.minScore === current.form.scoreRange.min;
  return plans
    .filter((plan) => plan.bonus === bonus && !isDupOfCurrent(plan))
    .slice()
    .sort((a, b) => b.bonus - a.bonus || a.minScore - b.minScore)
    .map((plan) => singleChoice(plan, "keep", requiredPt));
}

/**
 * モードA候補リストの構築（本書 §1-4）。並び順 = 編成変更が小さい順。
 * requiredPt===0 や候補ゼロ（モードA NG）のときは [] を返し、UI は既存 NgPanels に委ねる
 * （新しい状態表示を作らない）。
 */
export function buildModeAChoices(input: {
  live: CalculationResultV6["liveAdjustment"];
  bonus: number;
  base: number;
  useMySekai: boolean;
}): ModeAChoice[] {
  const { live, bonus } = input;
  if (live.requiredPt <= 0) return [];

  const plans = live.adjustmentPlans ?? [];
  const current = buildCurrentChoice(input);
  const keepSingles = buildKeepSingles(plans, bonus, live.requiredPt, current);

  // ③ 現ボーナス維持・複数回。liveCount===1 は探索空間が①（5.1）と同一なので畳む
  //    （削除ではなく重複排除）。keep 表の units は bonus キーを持たない。
  const keepMulti = (live.multiAKeep?.plans ?? [])
    .filter((plan) => plan.liveCount >= 2)
    .map((plan) => multiChoice(plan, "keep", bonus));

  // ④ 組み替え・単発（bonus!==現在値）。
  const rebuildSingles = plans
    .filter((plan) => plan.bonus !== bonus)
    .map((plan) => singleChoice(plan, "rebuild", live.requiredPt));

  // ⑤ 組み替え・複数回。全 unit が現ボーナスのプランは除外する（keep 表は multiA 表の
  //    現ボーナス部分空間そのものなので、③が同等以下の lbCost で必ずカバーする）。
  //    liveCount===1 は④の単発と物理的に同一アクションになる（1-live の組み替えは必ず
  //    グリッドボーナス≠現在値で 5.2 adjustmentPlans がカバーする）ので畳む＝重複カード防止。
  const rebuildMulti = (live.multiA?.plans ?? [])
    .filter((plan) => plan.liveCount >= 2)
    .filter((plan) => plan.units.some((u) => (u.bonus ?? bonus) !== bonus))
    .map((plan) => multiChoice(plan, "rebuild", bonus));

  const rebuild = [...rebuildSingles, ...rebuildMulti].sort(compareRebuild);

  const out: ModeAChoice[] = [];
  if (current) out.push(current);
  out.push(...keepSingles, ...keepMulti, ...rebuild);
  return out;
}

/**
 * 選択候補 → 統合画像の Step2 データ（本書 §1-4・§4）。既存の canvas 表現へ写すだけで
 * adjustPlanCanvas.ts は無改変。モードAは曲固定なので songForBase は基礎点を問わず
 * 選択曲 song を返す。keep 複数回は units に bonus キーが無いので、画像に
 * 「目標ボーナス」表記が自動的に付かない（§1-2 の設計）。
 */
export function canvasStep2FromChoice(
  choice: ModeAChoice,
  requiredPt: number,
  song?: AdjustCanvasSong
): AdjustCanvasStep2 {
  const form = choice.form;
  if (form.type === "current") {
    return {
      kind: "sweep",
      requiredPt,
      song,
      current: { scoreRange: form.scoreRange, lb: form.lb },
    };
  }
  if (form.type === "single") {
    return { kind: "sweep", plan: form.plan, requiredPt, song };
  }
  return { kind: "multi", plan: form.plan, songForBase: () => song };
}
