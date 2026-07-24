import { DEFAULT_BASE_POINT, MAX_LIVE_BONUS, maxScoreNOf, normalizeMaxScore } from "./constants";
import { calcLivePt } from "./calcLivePt";
import {
  EMPTY_ALLOCATION,
  type MySekaiAllocation,
  allocateMySekai,
  calculateUnitBasePt,
  isAllocationAttempted,
} from "./mySekai";
import { chooseDynamicReserve } from "./dynamicReserve";
import { ADJUST_LIVE_BONUSES, type AdjustmentPlan, planLiveAdjustment } from "./liveAdjust";
import {
  type MultiLiveAdjustResult,
  distinctBasePoints,
  planMultiLiveAdjustment,
} from "./multiLiveAdjust";
import { planModeAMulti } from "./modeAMulti";
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

/** calculatePlanV6 の追加オプション。省略時は既定値での計算になる。 */
export interface CalculationOptionsV6 {
  /** false でマイセカイ採取を使わずに計画を組む。既定 true。 */
  useMySekai?: boolean;
  /**
   * 狙えるスコアの上限（ユーザー設定）。既定 1,100,000・内部で 3,000,000 にクリップ。
   * すべてのスコア帯探索（調整ライブ・編成組み替え・ラストラン）がこの上限に従う。
   * ON/OFF どちらのモードにも適用する（400万点が人間に不可能なのはモードと無関係）。
   */
  maxScore?: number;
  /**
   * 統合モード（R5・Step1〜3 再編）。**省略時はレガシー経路で bit 単位に従来と同一**
   * （凍結テスト calculator.test.ts はこのフィールドを渡さないので無変更で通る）。
   *
   * 指定時の変更点（docs/point-adjust-step3-and-envy-brief.md）:
   *   - Step1 の確保額を dynamicReserve で動的化（ON経路の配分結果は変わるが、
   *     これは §2 が明示的に要求する実バグ修正。凍結＝レガシー既定経路は不変）。
   *   - Step2 の A（曲固定・ボーナス掃引 = adjustmentPlans）と B（曲可変・複数回 = multi）を
   *     ON/OFF に関わらず両方計算し、合成 status を A∨B にする（Aの「第2候補」降格を是正）。
   *   - mySekaiAllocation.appliedReserve に採用した確保額を載せる。
   */
  integrated?: {
    /** Step2 モードAで選択中の曲の基礎点。既定 DEFAULT_BASE_POINT（エビ100）。 */
    step2ABase: number;
  };
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
  /** この計算に使ったスコア上限（正規化後）。UIの表示・再現用。 */
  maxScore: number;
  mySekaiAllocation: {
    countA: number;
    countB: number;
    countC: number;
    totalPt: number;
    /**
     * integrated 経路で採用した確保額（dynamicReserve が動的に決めた reserve）。
     * レガシー経路では undefined（optional なので従来の結果形は不変）。UI・テスト用。
     */
    appliedReserve?: number;
  };
  liveAdjustment: {
    requiredPt: number;
    status: "OK" | "NG";
    /**
     * 曲側・複数回の探索結果（Step2 モードB = 曲可変・現ボーナス固定）。
     * レガシー OFF 経路では第1候補として設定、レガシー ON 経路では undefined。
     * integrated 経路では ON/OFF に関わらず必ず設定する（A/Bを対等に扱うため）。
     */
    multi?: MultiLiveAdjustResult;
    /**
     * ボーナス側・複数回の探索結果（Step2 モードA = 曲固定・ボーナス可変・複数回）。
     * integrated 経路でのみ設定する（R6 §1-3）。レガシー経路では
     * **キー自体を出さない**（条件付きスプレッド）ので凍結ゴールデンの形状は不変。
     * 単発の adjustmentPlans（1プレイ掃引）と対で、Aの着地手段を複数回に広げる。
     */
    multiA?: MultiLiveAdjustResult;
    targetScoreRange?: { min: number; max: number };
    adjustmentPlans?: AdjustmentPlan[];
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
  // スコア上限（既定1,100,000・3,000,000クリップ）。全スコア帯探索の共通ガード。
  const maxScore = normalizeMaxScore(options.maxScore);
  const maxScoreN = maxScoreNOf(maxScore);
  const musics = musicsList;
  const logs: string[] = [];
  const log = (title: string, msg: string) => logs.push(`[${title}] ${msg}`);

  log("Initial Settings", `Current: ${currentPt}, Target: ${targetPt}, Final: ${finalRunPt}`);
  log(
    "Environment",
    `Talent: ${talent}, Bonus: ${bonus}%, World Pass: ${hasWorldPass ? "Active" : "Inactive"}, Max Score: ${maxScore}`
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

  // 統合モードの共通ローカル。integrated が無いレガシー経路では step2ABase は使わない。
  const integrated = options.integrated;
  const distinctBases = distinctBasePoints(musics);
  // Step2 モードA（曲固定・ボーナス掃引）に許すLB。現行ポリシー維持（ON:0〜1 / OFF:0〜10）。
  const liveBonusesA = useMySekai ? ADJUST_LIVE_BONUSES : NO_MYSEKAI_LIVE_BONUSES;
  // モードAで叩く曲の基礎点。integrated は選択曲、レガシーは従来どおりエビ(100)固定。
  const liveBase = integrated ? integrated.step2ABase : DEFAULT_BASE_POINT;

  // 3. マイセカイ配分
  // OFF時は採取を計画に入れず、差分の吸収はすべて調整ライブに委ねる。
  // 「diff <= reserve でスキップ」のログと紛らわしくならないよう、
  // isAllocationAttempted の分岐は通さず専用の文言を出す。
  let allocation: MySekaiAllocation;
  let appliedReserve: number | undefined;
  if (useMySekai && integrated) {
    // integrated ON: 確保額を動的化する。Step2 が着地不能にならない最小の確保額を
    // 実探索（dynamicReserve）で選ぶ。レガシー既定経路（下の else）は bit 単位で不変。
    const dyn = chooseDynamicReserve({
      adjustableDiff,
      unitBasePt,
      bonus,
      basePoints: distinctBases,
      maxScoreN,
      step2ABase: integrated.step2ABase,
      liveBonusesA,
    });
    allocation = dyn.allocation;
    appliedReserve = dyn.reserve;
    logs.push(...dyn.logs);
    log(
      "MySekai Allocation",
      isAllocationAttempted(adjustableDiff, unitBasePt, dyn.reserve)
        ? `Wood/Rock(1.0):${allocation.countA}, Glitter(0.5):${allocation.countB}, Flower(0.2):${allocation.countC} -> Total ${allocation.totalPt} Pt (reserve ${dyn.reserve})`
        : `Adjustable diff <= reserve ${dyn.reserve} Pt, skipped MySekai calc.`
    );
  } else {
    // レガシー経路（従来と完全同一）。凍結テストはここを通る。
    allocation = useMySekai ? allocateMySekai(adjustableDiff, unitBasePt) : { ...EMPTY_ALLOCATION };
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
  }

  // 4-5. ライブ端数調整
  // A（モードA = 曲固定・ボーナス掃引 = planLiveAdjustment）と
  // B（モードB = 曲可変・複数回 = multi）は対等な2モード。
  //   - レガシー OFF: B を第1候補、A（編成組み替え）を第2候補として残す（従来挙動）。
  //   - レガシー ON : A のみ（multi は undefined）。従来挙動。
  //   - integrated  : ON/OFF に関わらず A/B を両方計算し、合成 status を A∨B にする
  //                   （Aの「第2候補」降格を是正。docs §3）。探索本体は不変で呼び出しを足すだけ。
  const liveRequired = adjustableDiff - allocation.totalPt;
  const multi =
    integrated || !useMySekai
      ? planMultiLiveAdjustment(liveRequired, bonus, distinctBases, maxScoreN)
      : undefined;
  if (multi) {
    logs.push(...multi.logs);
  }
  const live = planLiveAdjustment(liveRequired, bonus, liveBonusesA, maxScoreN, liveBase);
  logs.push(...live.logs);
  // モードA複数回化（R6 §1-3）。integrated 経路のみ、単発 live を複数回に広げた探索を足す。
  // ON時の liveBonusesA=[0,1] 縛りはそのまま渡す（ONの吸収役ポリシーと矛盾させない）。
  const multiA =
    integrated
      ? planModeAMulti(liveRequired, liveBase, bonus, liveBonusesA, maxScoreN)
      : undefined;
  if (multiA) {
    logs.push(...multiA.logs);
  }
  // 合成ステータス。A（単発 live ∨ 複数回 multiA）と B（multi）はいずれも
  // plans 合計が liveRequired に厳密一致するので、恒等式
  // currentPt + allocation + liveRequired + finalRunPt === targetPt は保たれる。
  const liveStatus: "OK" | "NG" = integrated
    ? live.status === "OK" || multiA?.status === "OK" || multi?.status === "OK"
      ? "OK"
      : "NG"
    : (!useMySekai && multi?.status === "OK")
      ? "OK"
      : live.status;

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

  const finalRunPlans = planFinalRun(finalRunPt, finalBase, bonus, maxScoreN);
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
    maxScore,
    // appliedReserve はレガシー経路では undefined。optional キーを混ぜないことで
    // 凍結テストの mySekaiAllocation === {countA,countB,countC,totalPt} 比較を保つ。
    mySekaiAllocation:
      appliedReserve === undefined ? allocation : { ...allocation, appliedReserve },
    liveAdjustment: {
      requiredPt: liveRequired,
      status: liveStatus,
      multi,
      // multiA はレガシー経路では undefined。条件付きスプレッドでキー自体を出さず、
      // 凍結ゴールデンの liveAdjustment 形状を維持する（appliedReserve と同じ様式）。
      ...(multiA !== undefined ? { multiA } : {}),
      targetScoreRange: live.targetScoreRange,
      adjustmentPlans: live.plans,
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
