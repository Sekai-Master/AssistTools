import { DEFAULT_MAX_SCORE_N, maxScoreNOf } from "./constants";
import type { AdjustmentPlan } from "./liveAdjust";
import type { MultiLivePlan, MultiLiveUnit } from "./multiLiveAdjust";
import type { CalculationResultV6 } from "./calculator";
import { buildBulkFractionChoices } from "./modeABulkFraction";
import { type AdjustCanvasSong, type AdjustCanvasStep2 } from "./adjustPlanCanvas";

/**
 * モードA（曲固定・ボーナス可変）を「現編成でN回（バルク・自動）＋端数1回（選択）」に
 * 再構成するための候補リスト構築（R6 モードA バルク＋端数）。
 *
 * 探索本体（liveAdjust 5.1/5.2・planFromReachablePtTable の frontier/best 選択・
 * buildBonusSweepTable/buildKeepBonusTable）は1行も触らない。ここは
 *   - bulkFraction 候補（modeABulkFraction.ts が構築・並べ替え済み）を主役に並べ、
 *   - 従来の複数回プラン（multiAKeep / multiA）を「畳み」用に後段へ回す（削除ではない）
 * オーケストレータに徹する。組み替えは端数の1回分だけ、という構造がここで決まる。
 */

/**
 * 候補の実体。
 *   bulkFraction … 主役。現編成N回（バルク）＋端数1回。N=0 なら端数のみ。
 *   multi        … 従来の複数回プラン（畳み表示用）。current/single は canvas 分岐互換で残す。
 * current/single/multi は削除しない（従来プランの畳み表示と canvas 分岐で引き続き使う）。
 */
export type ModeAChoiceForm =
  | { type: "current"; scoreRange: { min: number; max: number }; lb?: number }
  | { type: "single"; plan: AdjustmentPlan }
  | { type: "multi"; plan: MultiLivePlan }
  | {
      /**
       * 合成プラン。units = [バルクunit?(先頭・count=N), 端数unit(末尾・count=1)]。
       * canvas kind:"multi"・合計表示（liveCount/lbCost/totalPt）にそのまま使う。
       * バルク unit は N≥1 のときだけ存在し bonus キーを持たない（現編成様式）。
       * 端数 unit は常に末尾・count===1。bonus キーは fractionBonus !== 現ボーナスのときだけ。
       */
      type: "bulkFraction";
      plan: MultiLivePlan;
      /** バルク回数 N（0 = 端数のみ）。plan.liveCount - 1 と常に一致。 */
      bulkCount: number;
      /** 端数の目標ボーナス（現ボーナスと同値でも数値で保持。下げ幅計算・並べ替えキー）。 */
      fractionBonus: number;
    };

export interface ModeAChoice {
  /** 内容署名（選択の同一性判定・React key 用）。 */
  id: string;
  /** keep=現在ボーナス維持（編成そのまま） / rebuild=組み替え。 */
  kind: "keep" | "rebuild";
  form: ModeAChoiceForm;
  /** 候補中で最も低い目標ボーナス。bulkFraction では fractionBonus。並べ替えキー。 */
  minTargetBonus: number;
  /** bulkFraction=bulkCount+1、current/single=1、multi=plan.liveCount。 */
  liveCount: number;
  /** 並べ替え・表示補助。bulkFraction/multi は plan.lbCost。 */
  lbCost: number;
  /** = requiredPt（全候補が厳密着地なので共通）。 */
  totalPt: number;
}

/** bulkFraction form の端数 unit（末尾）。UI が index 直書きしないための公開ヘルパー。 */
export function fractionUnitOf(
  form: Extract<ModeAChoiceForm, { type: "bulkFraction" }>
): MultiLiveUnit {
  const units = form.plan.units;
  return units[units.length - 1];
}

/** bulkFraction form のバルク unit（先頭）。N=0（端数のみ）のときは undefined。 */
export function bulkUnitOf(
  form: Extract<ModeAChoiceForm, { type: "bulkFraction" }>
): MultiLiveUnit | undefined {
  return form.bulkCount >= 1 ? form.plan.units[0] : undefined;
}

/**
 * units を物理アクションで一意に識別する署名（重複判定用）。
 *
 * 現ボーナスの表記差を正規化する: bulkFraction のバルク unit は bonus キーを持たないが、
 * 同じ物理プランを multiA から拾うと生ボーナス値（例 bonus:990）がキーに付く。この差で
 * 照合が絶対に一致せず、同一プランが「主役」と「従来形式（畳み）」に二重掲載され、
 * 現編成バルク行に「目標ボーナス990%」の誤ラベルが付いていた（破壊者 HIGH-1）。
 * bonus===現ボーナス と undefined を同一視し、units 順序にも依らないよう正規化する。
 */
function signMulti(plan: MultiLivePlan, bonus: number): string {
  return (
    "multi/" +
    plan.units
      .map((u) => {
        const nb = u.bonus === undefined || u.bonus === bonus ? "" : String(u.bonus);
        return `${u.basePoint}/${u.liveBonus}/${u.minScore}/${u.pt}x${u.count}/${nb}`;
      })
      .sort()
      .join("|")
  );
}

/** 複数回プラン → 候補。minTargetBonus は unit の目標ボーナス最小（無ければ現ボーナス）。 */
function multiChoice(
  plan: MultiLivePlan,
  kind: "keep" | "rebuild",
  bonus: number
): ModeAChoice {
  return {
    id: signMulti(plan, bonus),
    kind,
    form: { type: "multi", plan },
    minTargetBonus: Math.min(...plan.units.map((u) => u.bonus ?? bonus)),
    liveCount: plan.liveCount,
    lbCost: plan.lbCost,
    totalPt: plan.totalPt,
  };
}

/**
 * 従来の複数回プラン（畳み用）。bulkFraction の合成プランと signMulti が一致するものは
 * 二重カード防止のため除外する（削除ではなく畳み＝禁じ手対応。既存 ③⑤ と同じ流儀）。
 *   ③ 現ボーナス維持・複数回（multiAKeep の liveCount≥2）
 *   ⑤ 組み替え・複数回（multiA のうち非現ボーナス unit を含む liveCount≥2）
 */
function buildLegacyMulti(
  live: CalculationResultV6["liveAdjustment"],
  bonus: number,
  bulkFraction: readonly ModeAChoice[]
): ModeAChoice[] {
  const bfSigs = new Set(
    bulkFraction.map((c) => (c.form.type === "bulkFraction" ? signMulti(c.form.plan, bonus) : ""))
  );
  const keepMulti = (live.multiAKeep?.plans ?? [])
    .filter((plan) => plan.liveCount >= 2)
    .map((plan) => multiChoice(plan, "keep", bonus));
  const rebuildMulti = (live.multiA?.plans ?? [])
    .filter((plan) => plan.liveCount >= 2)
    .filter((plan) => plan.units.some((u) => (u.bonus ?? bonus) !== bonus))
    .map((plan) => multiChoice(plan, "rebuild", bonus));
  return [...keepMulti, ...rebuildMulti].filter(
    (c) => c.form.type === "multi" && !bfSigs.has(signMulti(c.form.plan, bonus))
  );
}

/**
 * モードA候補リストの構築（本書 §1）。
 * 先頭群 = bulkFraction 候補（modeABulkFraction が「下げ幅小順」に並べ替え済み・既定選択は先頭）、
 * 後段 = 従来の複数回プラン（畳み・重複排除済み）。requiredPt<=0 は [] を返し既存 NG 案内に委ねる。
 */
export function buildModeAChoices(input: {
  live: CalculationResultV6["liveAdjustment"];
  bonus: number;
  base: number;
  useMySekai: boolean;
  /** スコア上限（result.maxScore）。省略時は既定スコア上限相当（マジックナンバー回避）。 */
  maxScore?: number;
}): ModeAChoice[] {
  const { live, bonus, base, useMySekai } = input;
  if (live.requiredPt <= 0) return [];

  const maxScoreN = input.maxScore !== undefined ? maxScoreNOf(input.maxScore) : DEFAULT_MAX_SCORE_N;
  const bulkFraction = buildBulkFractionChoices({
    requiredPt: live.requiredPt,
    base,
    bonus,
    useMySekai,
    maxScoreN,
    adjustmentPlans: live.adjustmentPlans ?? [],
    targetScoreRange: live.targetScoreRange,
  });

  const legacy = buildLegacyMulti(live, bonus, bulkFraction);
  return [...bulkFraction, ...legacy];
}

/**
 * UI 用の分割ヘルパー（本書 §4）。bulkFraction 候補（主役・選択軸）と従来プラン（畳み）を分ける。
 * 純関数なのでテストで分割結果を固定できる。
 */
export function splitModeAChoices(choices: readonly ModeAChoice[]): {
  bulkFraction: ModeAChoice[];
  legacy: ModeAChoice[];
} {
  return {
    bulkFraction: choices.filter((c) => c.form.type === "bulkFraction"),
    legacy: choices.filter((c) => c.form.type !== "bulkFraction"),
  };
}

/**
 * 選択候補 → 統合画像の Step2 データ（本書 §5）。既存の canvas 表現へ写すだけで
 * adjustPlanCanvas.ts は無改変。モードAは曲固定なので songForBase は基礎点を問わず song を返す。
 *   bulkFraction N=0 … sweep（端数のみ）。bonus キー有無で「編成そのまま」/「組み替え」を描き分け。
 *   bulkFraction N≥1 … multi（バルク行＝目標ボーナス表記なし＋端数行）。
 *   multi/current/single … 従来どおり（畳みプラン採択・互換）。
 */
export function canvasStep2FromChoice(
  choice: ModeAChoice,
  requiredPt: number,
  song?: AdjustCanvasSong
): AdjustCanvasStep2 {
  const form = choice.form;
  if (form.type === "bulkFraction") {
    if (form.bulkCount === 0) {
      const f = fractionUnitOf(form);
      return f.bonus === undefined
        ? { kind: "sweep", requiredPt, song, current: { scoreRange: { min: f.minScore, max: f.maxScore }, lb: f.liveBonus } }
        : {
            kind: "sweep",
            plan: { liveBonus: f.liveBonus, bonus: f.bonus, minScore: f.minScore, maxScore: f.maxScore },
            requiredPt,
            song,
          };
    }
    return { kind: "multi", plan: form.plan, songForBase: () => song };
  }
  if (form.type === "current") {
    return { kind: "sweep", requiredPt, song, current: { scoreRange: form.scoreRange, lb: form.lb } };
  }
  if (form.type === "single") {
    return { kind: "sweep", plan: form.plan, requiredPt, song };
  }
  return { kind: "multi", plan: form.plan, songForBase: () => song };
}
