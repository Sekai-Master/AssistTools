import { DEFAULT_BASE_POINT, MAX_LIVE_BONUS } from "./constants";
import { calcLivePt } from "./calcLivePt";
import { EMPTY_ALLOCATION, allocateMySekai, calculateUnitBasePt, isAllocationAttempted } from "./mySekai";
import { type AdjustmentPlan, planLiveAdjustment } from "./liveAdjust";
import {
  type MultiLiveAdjustResult,
  distinctBasePoints,
  planMultiLiveAdjustment,
} from "./multiLiveAdjust";
import { type FinalRunPlan, finalRunSearchedMaxBonus, planFinalRun } from "./finalRun";

/**
 * 調整プランの組み立て。
 *
 * 実際の計算は用途ごとのモジュールに分かれている。
 *   calcLivePt.ts … ライブでの獲得ポイントの式
 *   mySekai.ts    … マイセカイの単価と採取配分
 *   liveAdjust.ts … 端数調整のスコア逆算
 *   finalRun.ts   … ラストランのプラン列挙
 * ここはそれらを順に呼び、ログと検証結果をまとめるだけ。
 */

export { ENVY_ID } from "./constants";
export { LIVE_BONUS_MULTIPLIERS, calcLivePt } from "./calcLivePt";
export type { AdjustmentPlan } from "./liveAdjust";
export type { FinalRunPlan } from "./finalRun";

/**
 * 計算に必要な楽曲情報の最小の契約。
 *
 * 基礎点の出どころの優先順位（実測値 > 取得データ > 同梱データ）は
 * lib/musicSources.ts の責務なので、ここに届く時点では1つに決まっている前提。
 */
export interface MusicData {
  id: string;
  basePoint: number;
}

/** calculatePlanV6 の追加オプション。省略時は従来どおりの計算になる。 */
export interface CalculationOptionsV6 {
  /** false でマイセカイ採取を使わずに計画を組む。既定 true。 */
  useMySekai?: boolean;
}

export interface CalculationResultV6 {
  currentPt: number;
  targetPt: number;
  finalRunPt: number;
  totalDiff: number;
  adjustableDiff: number;
  unitBasePt: number;
  /** この計算がマイセカイ採取を使う前提か（UIの表示出し分けに使う）。 */
  useMySekai: boolean;
  mySekaiAllocation: {
    countA: number;
    countB: number;
    countC: number;
    totalPt: number;
  };
  liveAdjustment: {
    requiredPt: number;
    status: "OK" | "NG";
    /**
     * OFF時の第1候補（曲側・複数回）。現在の編成を維持したまま、
     * 調整ライブの楽曲（基礎点）とLB 0〜10を動かして厳密着地を狙う。
     * ON時は undefined（従来経路のみ）。
     */
    multi?: MultiLiveAdjustResult;
    targetScoreRange?: { min: number; max: number };
    adjustmentPlans?: AdjustmentPlan[];
    /** 調整ライブ1回で吸収できる上限Pt。マイセカイ不使用時のNG案内に使う。 */
    maxAdjustablePt: number;
    /** 調整ライブに許したライブボーナス消費の上限（文言用）。 */
    maxLiveBonus: number;
    logMessage: string;
  };
  finalRunPlans: FinalRunPlan[];
  finalBase: number;
  finalEstimatedPt: number;
  isVerified: boolean;
  logs: string[];
}

/** マイセカイ単価。UIが入力中のヒント表示にも使う。 */
export const calculateUnitBasePtEstimate = calculateUnitBasePt;

/**
 * マイセカイ不使用モードで調整ライブに許すライブボーナス（0〜10）。
 * ON時は吸収役がマイセカイにあるためLB0〜1に縛るが、
 * OFF時は調整ライブが唯一の吸収役なのでLBを積む価値がある。
 */
const NO_MYSEKAI_LIVE_BONUSES: readonly number[] = Array.from(
  { length: MAX_LIVE_BONUS + 1 },
  (_, i) => i
);

export function calculatePlanV6(
  currentPt: number,
  targetPt: number,
  finalRunPt: number,
  talent: number,
  bonus: number,
  hasWorldPass: boolean,
  finalSongId: string,
  musicsList: MusicData[],
  options: CalculationOptionsV6 = {}
): CalculationResultV6 {
  // 既定は従来どおりマイセカイを使う。呼び出し側の後方互換のため省略可にしている。
  const useMySekai = options.useMySekai ?? true;
  const musics = musicsList;
  const logs: string[] = [];
  const log = (title: string, msg: string) => logs.push(`[${title}] ${msg}`);

  log("Initial Settings", `Current: ${currentPt}, Target: ${targetPt}, Final: ${finalRunPt}`);
  log(
    "Environment",
    `Talent: ${talent}, Bonus: ${bonus}%, World Pass: ${hasWorldPass ? "Active" : "Inactive"}`
  );

  // 1. マイセカイ単価
  const unitBasePt = calculateUnitBasePt(talent, bonus, hasWorldPass);
  log("Unit Pt", `Value: ${unitBasePt} (Auto)`);

  // 2. 埋めるべき差分
  const totalDiff = targetPt - currentPt;
  const adjustableDiff = totalDiff - finalRunPt;
  log(
    "Diff Calc",
    `Total Diff: ${totalDiff}, Adjustable: ${adjustableDiff} (Reserved ${finalRunPt} for Final)`
  );

  if (adjustableDiff < 0) {
    log("Error", "Target is lower than Current + Final Run. Impossible to adjust.");
  }

  // 3. マイセカイ配分
  // OFF時は採取を計画に入れず、差分の吸収はすべて調整ライブに委ねる。
  // 「diff <= 100 でスキップ」のログと紛らわしくならないよう、
  // isAllocationAttempted の分岐は通さず専用の文言を出す。
  const allocation = useMySekai
    ? allocateMySekai(adjustableDiff, unitBasePt)
    : { ...EMPTY_ALLOCATION };
  if (!useMySekai) {
    log("MySekai Allocation", "Disabled by user setting.");
  } else if (isAllocationAttempted(adjustableDiff, unitBasePt)) {
    log(
      "MySekai Allocation",
      `Wood/Rock(1.0):${allocation.countA}, Glitter(0.5):${allocation.countB}, Flower(0.2):${allocation.countC} -> Total ${allocation.totalPt} Pt`
    );
  } else {
    log("MySekai Allocation", "Adjustable diff <= 100 Pt, skipped MySekai calc.");
  }

  // 4-5. ライブ端数調整
  // OFF時は調整ライブが唯一の吸収役。第1候補は「現在の編成を維持したまま
  // 曲側（基礎点28通り）× LB 0〜10 × 複数回」で解く multi 経路。
  // 従来の「編成を組み替えて別ボーナスにする」経路（planLiveAdjustment ＋
  // NO_MYSEKAI_LIVE_BONUSES）は、編成の組み替えという実作業が重いため
  // 第2候補に降格して残す（結果は従来どおり adjustmentPlans 等に入る）。
  const liveRequired = adjustableDiff - allocation.totalPt;
  const multi = useMySekai
    ? undefined
    : planMultiLiveAdjustment(liveRequired, bonus, distinctBasePoints(musics));
  if (multi) {
    logs.push(...multi.logs);
  }
  const live = useMySekai
    ? planLiveAdjustment(liveRequired, bonus)
    : planLiveAdjustment(liveRequired, bonus, NO_MYSEKAI_LIVE_BONUSES);
  logs.push(...live.logs);
  // 合成ステータス: OFF時は multi が解ければ第2候補がNGでも着地可能とみなす。
  // multi の plans は合計が liveRequired に厳密一致するので、
  // 恒等式 currentPt + allocation + liveRequired + finalRunPt === targetPt は保たれる。
  const liveStatus: "OK" | "NG" =
    (!useMySekai && multi?.status === "OK") ? "OK" : live.status;

  // 6. ラストラン
  // 基礎点はどの曲も同じ経路（musicsList → 見つからなければ既定値）で引く。
  // 以前は独りんぼエンヴィー(074)だけ musicsList を参照せず既定値100に固定していたが、
  // 074 が将来 100 以外に解決される可能性を残す特別扱いだったので撤廃した。
  const songData = musics.find((m) => m.id === finalSongId);
  let finalBase = DEFAULT_BASE_POINT;
  if (songData && Number.isFinite(songData.basePoint)) {
    finalBase = songData.basePoint;
  } else {
    log("Data Source", `No base point for ID ${finalSongId}, defaulting to ${DEFAULT_BASE_POINT}.`);
  }
  log("Final Run Plan", `Target: ${finalRunPt}, Song Base: ${finalBase} (ID: ${finalSongId})`);

  const finalRunPlans = planFinalRun(finalRunPt, finalBase, bonus);
  if (finalRunPt > 0) {
    log(
      "Final Run Plan",
      `Found ${finalRunPlans.length} plans (bonus <= ${finalRunSearchedMaxBonus(bonus)}%).`
    );
  }

  // 7. 検証
  // OFF時は multi が OK なら liveRequired を厳密に稼げる（合成 liveStatus 参照）。
  const liveAdjPt = liveStatus === "OK" ? liveRequired : 0;
  const estimatedTotal = currentPt + allocation.totalPt + liveAdjPt + finalRunPt;
  const isVerified = estimatedTotal === targetPt && liveStatus === "OK";

  return {
    currentPt,
    targetPt,
    finalRunPt,
    totalDiff,
    adjustableDiff,
    unitBasePt,
    useMySekai,
    mySekaiAllocation: allocation,
    liveAdjustment: {
      requiredPt: liveRequired,
      status: liveStatus,
      multi,
      targetScoreRange: live.targetScoreRange,
      adjustmentPlans: live.plans,
      maxAdjustablePt: live.maxAdjustablePt,
      // ON時は探索に許したLBが 0〜1 なので上限は 1（NG案内の文言用）。
      maxLiveBonus: useMySekai ? 1 : MAX_LIVE_BONUS,
      logMessage: liveStatus === "OK" ? `目標: ${liveRequired}` : `調整不可 ${liveRequired}`,
    },
    finalRunPlans,
    finalBase,
    finalEstimatedPt: estimatedTotal,
    isVerified,
    logs,
  };
}

// 端数調整の逆算に使うので再エクスポートしておく
export { calcLivePt as calcLivePtRaw };
