import { MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import { ADJUST_LIVE_BONUSES, type AdjustmentPlan } from "./liveAdjust";
import {
  MAX_ADJUST_LIVE_COUNT,
  type MultiLivePlan,
  type MultiLiveUnit,
  type ReachablePtTable,
  type Rep,
} from "./multiLiveAdjust";
import { getBonusSweepTableMemo, getKeepBonusTableMemo } from "./modeAMulti";
import { deriveCurrentLb } from "./adjustPlanCanvas";
import type { ModeAChoice } from "./modeAChoices";

/**
 * モードA「現編成でN回（バルク・自動）＋端数1回（ユーザーが編成を選ぶ）」の候補構築
 * （R6 モードA バルク＋端数 §1-2）。
 *
 * ## 設計の核（禁じ手回避）
 *
 * 探索本体（planFromReachablePtTable の frontier/best、liveAdjust 5.1/5.2、
 * buildBonusSweepTable/buildKeepBonusTable）は1行も呼び変えない。ここは既存の
 * メモ化済み到達可能Pt表（getBonusSweepTableMemo / getKeepBonusTableMemo）と
 * 単発列挙（adjustmentPlans / targetScoreRange）を **詰め替えて並べ替える純関数**。
 *
 * ## バルクと端数の役割分担
 *
 * - バルク: 現ボーナス固定（keep 表 = bonus キー無し）を **単一条件 × N回**。組み替えない。
 * - 端数: 残りを1回で埋める。ボーナス可変（sweep 表 = bonus キー有り）。組み替えるのはここだけ。
 * - 恒等式: `bulk.pt × N + fraction.pt === requiredPt`（厳密着地）。
 *
 * ## バルク選定ポリシー（決定的）
 *
 * 端数値 r ごとにバルクは「回数最小 N → その v の最安LB代表（keep.reps[0]）」の1本に固定する。
 * 回数とLBのトレードオフを端数候補ごとに展開しない（そこは畳んだ従来プランが担う）。
 */

/** バルク＋端数プランを組み立てる（liveCount / lbCost / totalPt を算術で確定）。 */
function makePlan(units: MultiLiveUnit[]): MultiLivePlan {
  let liveCount = 0;
  let lbCost = 0;
  let totalPt = 0;
  for (const u of units) {
    liveCount += u.count;
    lbCost += u.liveBonus * u.count;
    totalPt += u.pt * u.count;
  }
  return { units, liveCount, lbCost, totalPt };
}

/**
 * バルク unit（現編成＝keep 表様式）。**bonus キーは絶対に付けない**。
 * これで画像・UI が「目標ボーナス」表記なし＝「現在の編成でN回」に構造的に決まる。
 */
function bulkUnit(rep: Rep, pt: number, count: number, base: number): MultiLiveUnit {
  return {
    basePoint: base,
    liveBonus: rep.liveBonus,
    minScore: rep.scoreN * SCORE_STEP,
    maxScore: (rep.scoreN + 1) * SCORE_STEP - 1,
    pt,
    count,
  };
}

/**
 * 端数 unit（sweep 表の rep から）。fractionBonus === 現ボーナスのときだけ bonus キーを省く
 * （生値の厳密比較でよい。bonusColumn が生 bonus を dedupe 済みのため）。
 */
function fractionUnitFromRep(rep: Rep, pt: number, base: number, bonus: number): MultiLiveUnit {
  const unit: MultiLiveUnit = {
    basePoint: base,
    liveBonus: rep.liveBonus,
    minScore: rep.scoreN * SCORE_STEP,
    maxScore: (rep.scoreN + 1) * SCORE_STEP - 1,
    pt,
    count: 1,
  };
  return rep.bonus !== undefined && rep.bonus !== bonus ? { ...unit, bonus: rep.bonus } : unit;
}

/**
 * 合成プラン → ModeAChoice（本書 §1-1 のフィールド対応）。
 * id は端数の (bonus, lb, minScore) と bulkCount で一意（1-2 の r→候補対応が単射）。
 */
function toChoice(
  bulk: MultiLiveUnit | undefined,
  fraction: MultiLiveUnit,
  bulkCount: number,
  fractionBonus: number,
  bonus: number,
  requiredPt: number
): ModeAChoice {
  const units = bulk ? [bulk, fraction] : [fraction];
  const plan = makePlan(units);
  return {
    id: `bf/${fractionBonus}/${fraction.liveBonus}/${fraction.minScore}/${bulkCount}`,
    kind: fractionBonus === bonus ? "keep" : "rebuild",
    form: { type: "bulkFraction", plan, bulkCount, fractionBonus },
    minTargetBonus: fractionBonus,
    liveCount: bulkCount + 1,
    lbCost: plan.lbCost,
    totalPt: requiredPt,
  };
}

/**
 * 端数のみで着地（N=0）の候補列。
 *   1. targetScoreRange があれば「生ボーナス・bonus キーなし」を1件（LB は deriveCurrentLb で逆引き）。
 *   2. adjustmentPlans の各プランを候補化（plan.bonus === 現ボーナスなら bonus キー省略）。
 * 重複（targetScoreRange と同一 (lb, minScore)）は呼び出し側の id 集合で自然に排除される。
 */
function zeroBulkCandidates(input: {
  requiredPt: number;
  base: number;
  bonus: number;
  useMySekai: boolean;
  adjustmentPlans: readonly AdjustmentPlan[];
  targetScoreRange?: { min: number; max: number };
}): ModeAChoice[] {
  const { requiredPt, base, bonus, useMySekai, adjustmentPlans, targetScoreRange } = input;
  const out: ModeAChoice[] = [];

  if (targetScoreRange) {
    const lb = deriveCurrentLb(base, bonus, requiredPt, targetScoreRange.min, useMySekai) ?? 0;
    const fraction: MultiLiveUnit = {
      basePoint: base,
      liveBonus: lb,
      minScore: targetScoreRange.min,
      maxScore: targetScoreRange.max,
      pt: requiredPt,
      count: 1,
    };
    // 現ボーナスなので bonus キーは付けない（編成そのまま）。
    out.push(toChoice(undefined, fraction, 0, bonus, bonus, requiredPt));
  }

  for (const plan of adjustmentPlans) {
    if (!plan) continue;
    const base0: MultiLiveUnit = {
      basePoint: base,
      liveBonus: plan.liveBonus,
      minScore: plan.minScore,
      maxScore: plan.maxScore,
      pt: requiredPt,
      count: 1,
    };
    const fraction = plan.bonus !== bonus ? { ...base0, bonus: plan.bonus } : base0;
    out.push(toChoice(undefined, fraction, 0, plan.bonus, bonus, requiredPt));
  }
  return out;
}

/**
 * 残額 remaining を現編成（keep 表）で埋める最小回数 N とその1回値 v・最安LB代表を返す。
 * frontier の minCount と同じ ceil 下界（remaining / maxPtPerLive）から昇順に走査し、
 * remaining を割り切り、かつ keep 表に載る最初の (N, v) で確定する（回数最小 → 最安LB）。
 */
function minimalBulkFor(
  remaining: number,
  keep: ReachablePtTable
): { n: number; v: number; rep: Rep } | undefined {
  if (keep.maxPtPerLive <= 0) return undefined;
  const nMin = Math.max(1, Math.ceil(remaining / keep.maxPtPerLive));
  const nMax = Math.min(MAX_ADJUST_LIVE_COUNT - 1, Math.floor(remaining / keep.minPtPerLive));
  for (let n = nMin; n <= nMax; n++) {
    if (remaining % n !== 0) continue;
    const v = remaining / n;
    const rep = keep.reps.get(v)?.[0];
    if (rep) return { n, v, rep };
  }
  return undefined;
}

/**
 * N≥1 候補（現編成 N回 ＋ 端数1回）の走査。
 * sweep 表の各到達値 r（＝端数の1回値）について残額 remaining = requiredPt - r を
 * 現編成で埋める最小 N を求め、r の各実現手段（最大 MAX_REPS_PER_PT 件）を端数候補にする。
 */
function scanFractionCandidates(input: {
  requiredPt: number;
  base: number;
  bonus: number;
  maxScoreN: number;
  liveBonuses: readonly number[];
}): ModeAChoice[] {
  const { requiredPt, base, bonus, maxScoreN, liveBonuses } = input;
  const sweep = getBonusSweepTableMemo(base, bonus, liveBonuses, maxScoreN);
  const keep = getKeepBonusTableMemo(base, bonus, liveBonuses, maxScoreN);
  const out: ModeAChoice[] = [];
  for (const r of sweep.sortedPts) {
    // 降順。r >= requiredPt は N=0（zeroBulkCandidates）が担当するので飛ばす。
    if (r >= requiredPt) continue;
    const bulk = minimalBulkFor(requiredPt - r, keep);
    if (!bulk) continue;
    const bUnit = bulkUnit(bulk.rep, bulk.v, bulk.n, base);
    for (const rep of sweep.reps.get(r) ?? []) {
      const fraction = fractionUnitFromRep(rep, r, base, bonus);
      out.push(toChoice(bUnit, fraction, bulk.n, rep.bonus ?? bonus, bonus, requiredPt));
    }
  }
  return out;
}

/**
 * useMySekai から調整ライブに許すLB列を導く。
 * calculator.ts の liveBonusesA・adjustPlanCanvas.ts の NO_MYSEKAI_LIVE_BONUSES と同じ鏡:
 *   ON  = ADJUST_LIVE_BONUSES（[0,1]・吸収役はマイセカイ側）
 *   OFF = 0..MAX_LIVE_BONUS（調整ライブが唯一の吸収役）
 * 同一列を渡すので getBonusSweepTableMemo / getKeepBonusTableMemo のキャッシュに必ずヒットする。
 */
function liveBonusesFor(useMySekai: boolean): readonly number[] {
  return useMySekai
    ? ADJUST_LIVE_BONUSES
    : Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i);
}

/**
 * 端数候補の並べ替え（本書 §2）:
 *   1. fractionBonus 降順（＝現ボーナスからの下げ幅昇順）。397%級は末尾へ沈む。
 *   2. 合計回数（liveCount）昇順。
 *   3. lbCost 昇順。
 *   4. 端数のスコア下限昇順。
 * fractionBonus は minTargetBonus と常に一致（toChoice で同値を入れている）。
 */
function fractionMinScore(c: ModeAChoice): number {
  if (c.form.type !== "bulkFraction") return 0;
  const units = c.form.plan.units;
  return units[units.length - 1].minScore;
}

export function compareBulkFraction(a: ModeAChoice, b: ModeAChoice): number {
  return (
    b.minTargetBonus - a.minTargetBonus ||
    a.liveCount - b.liveCount ||
    a.lbCost - b.lbCost ||
    fractionMinScore(a) - fractionMinScore(b)
  );
}

/**
 * 「バルク（現編成N回）＋端数（選択1回）」候補列の構築＋並べ替え（本書 §1-2）。
 * requiredPt <= 0 は [] （既存 NG 案内に委ねる。新しい状態表示を作らない）。
 * 走査コストは sweep.sortedPts（≤約7,400）× 剰余照合 ≈ 数万オペで useMemo 内数ms級。
 */
export function buildBulkFractionChoices(input: {
  requiredPt: number;
  base: number;
  bonus: number;
  useMySekai: boolean;
  maxScoreN: number;
  adjustmentPlans: readonly AdjustmentPlan[];
  targetScoreRange?: { min: number; max: number };
}): ModeAChoice[] {
  const { requiredPt, base, bonus, useMySekai, maxScoreN, adjustmentPlans, targetScoreRange } = input;
  if (requiredPt <= 0) return [];

  const liveBonuses = liveBonusesFor(useMySekai);
  const seen = new Set<string>();
  const out: ModeAChoice[] = [];
  const add = (c: ModeAChoice): void => {
    if (seen.has(c.id)) return; // 端数の (bonus, lb, minScore, bulkCount) が一意なので id 単位で dedupe
    seen.add(c.id);
    out.push(c);
  };

  for (const c of zeroBulkCandidates({ requiredPt, base, bonus, useMySekai, adjustmentPlans, targetScoreRange })) {
    add(c);
  }
  for (const c of scanFractionCandidates({ requiredPt, base, bonus, maxScoreN, liveBonuses })) {
    add(c);
  }

  return out.sort(compareBulkFraction);
}
