import { DEFAULT_BASE_POINT, DEFAULT_MAX_SCORE_N, LIVE_ADJUST_RESERVE } from "./constants";
import { allocateMySekai, type MySekaiAllocation } from "./mySekai";
import { ADJUST_LIVE_BONUSES, planLiveAdjustment } from "./liveAdjust";
import {
  EXHAUSTIVE_MAX_LIVES,
  buildReachablePtTable,
  planFromReachablePtTable,
  type ReachablePtTable,
} from "./multiLiveAdjust";
import { planModeAMulti } from "./modeAMulti";

/**
 * Step1（マイセカイ）の確保額を動的に導出する（R5 / docs §2 の実バグ修正）。
 *
 * ## なぜ固定 LIVE_ADJUST_RESERVE=100 ではだめか
 *
 * 100 は「エビの基礎点＝Step2 モードA（曲固定・ボーナス掃引）で確保すべき額」
 * としては正しい。だが Step1 が差分を取りすぎると Step2 の残額が
 * 「1本の最小獲得Pt未満」や「3本以内に作れない穴（990%時 1,090〜6,807 に200個超）」
 * に落ち、Step2 が原理的に着地不能になる。必要な確保額は Step2 のモードと
 * ボーナスで2桁変わる（docs/point-adjust-step3-and-envy-brief.md §2）。
 *
 * ## 方式: 理論下界を初期値に、本物の探索で検証し、NGなら退避する
 *
 * 実測の安全域（6,808 等）をハードコードするのは禁じ手なので、閾値は
 *   R0 = (EXHAUSTIVE_MAX_LIVES + 1) × minPtPerLive
 * という既存 export と calcLivePt 導出値だけで組んだ理論下界から始める
 * （この帯未満は解が疎。全定数が calcLivePt 由来の minPtPerLive と
 * EXHAUSTIVE_MAX_LIVES のみ）。その上で「表示に使う探索そのもの」で着地可否を
 * 検証し、駄目なら minPtPerLive 刻みで確保額を積み増す。検証に使うのが
 * 表示側と同じ探索なので、「確保したのに着地できない」は構造的に起こり得ない。
 *
 * ## 探索本体には触れない
 *
 * allocateMySekai / planLiveAdjustment / planFromReachablePtTable は
 * 既存関数をそのまま呼ぶだけ。frontier構築・best選択・掃引ループは一切変えていない。
 * この関数は「確保額を選ぶ前後に検証を挟む」だけの薄いラッパ。
 */

/**
 * 確保額の積み増し試行の上限。
 *
 * 各試行は minPtPerLive（1本の最小獲得Pt）ずつ確保額を増やす。8回で
 * R0 + 8×minPtPerLive まで押し上げられ、990%・エビなら約 4,360 + 8×1,090 ≈ 13,080
 * まで届く。これは「3本以内に必ず作れる安全域（6,808）」を十分に覆う幅であり、
 * かつ無制限に増やして採取をゼロに潰さないための頭でもある。定数化の根拠は
 * MAX_PLANS 等と同種の提示ポリシー（ゲーム仕様値ではない）。
 */
export const RESERVE_BACKOFF_MAX_TRIES = 8;

export interface DynamicReserveParams {
  /** 差分（totalDiff - finalRunPt）。calculator の adjustableDiff。 */
  adjustableDiff: number;
  /** マイセカイ単価。allocateMySekai に渡す。 */
  unitBasePt: number;
  /** 現在のイベントボーナス（%）。 */
  bonus: number;
  /** 調整ライブに使いうる異なり基礎点（distinctBasePoints の結果）。 */
  basePoints: readonly number[];
  /** スコア係数の探索上限。 */
  maxScoreN?: number;
  /** Step2 モードAで選択中の曲の基礎点（既定 DEFAULT_BASE_POINT）。 */
  step2ABase?: number;
  /** モードAで許すライブボーナス（ON経路は ADJUST_LIVE_BONUSES=[0,1]）。 */
  liveBonusesA?: readonly number[];
  /** 事前構築済みの到達可能Pt表があれば渡す（無ければ内部で1回構築）。 */
  table?: ReachablePtTable;
}

export interface DynamicReserveResult {
  /** 採用した確保額（allocateMySekai に渡した reserve）。 */
  reserve: number;
  /** 採用時の配分結果（呼び出し側が再計算せず使える）。 */
  allocation: MySekaiAllocation;
  /** 配分後の Step2 残額（adjustableDiff - allocation.totalPt）。 */
  liveRequired: number;
  /**
   * 採用した確保額が候補列（下方向＋上方向を昇順マージした列）の何番目か（0始まり）。
   * R6 で候補が step2ABase 起点の下方向にも伸びたため、旧来の
   * 「reserve = R0 + tries × minPtPerLive」の再構成式は成り立たない（表示・ログ用）。
   */
  tries: number;
  /** 1本の最小獲得Pt（backoff の刻み幅・R0 の導出係数。テスト・表示用）。 */
  minPtPerLive: number;
  /** 採用時点のモードA/Bの着地可否。 */
  okA: boolean;
  okB: boolean;
  logs: string[];
}

/** 1回分の試行結果（内部用）。 */
interface Attempt {
  reserve: number;
  allocation: MySekaiAllocation;
  liveRequired: number;
  okA: boolean;
  okB: boolean;
  tries: number;
}

/** ある確保額で配分し、モードA/Bの両方で着地可否を検証する。 */
function evaluate(
  reserve: number,
  tries: number,
  params: Required<Pick<DynamicReserveParams, "adjustableDiff" | "unitBasePt" | "bonus" | "maxScoreN" | "step2ABase" | "liveBonusesA">>,
  table: ReachablePtTable
): Attempt {
  const allocation = allocateMySekai(params.adjustableDiff, params.unitBasePt, reserve);
  const liveRequired = params.adjustableDiff - allocation.totalPt;
  // B（ボーナス固定・曲可変）は複数回の厳密着地。表を使い回すので安い。
  const okB = planFromReachablePtTable(liveRequired, table).status === "OK";
  // A（曲固定・ボーナス可変）。単発掃引を先に見て、NG のときだけ複数回化（modeAMulti）を
  // 呼ぶ短絡（R6 §2-1）。単発は base 起点で隙間ゼロ連続なので大半はここで OK になり、
  // 重い表構築（メモ化済み）まで行かない＝性能対策。判定は表示側と同じ関数を通す。
  const okA =
    planLiveAdjustment(liveRequired, params.bonus, params.liveBonusesA, params.maxScoreN, params.step2ABase)
      .status === "OK" ||
    planModeAMulti(liveRequired, params.step2ABase, params.bonus, params.liveBonusesA, params.maxScoreN)
      .status === "OK";
  return { reserve, allocation, liveRequired, okA, okB, tries };
}

/**
 * 確保額の候補列（昇順・重複除去）。R6 §2-1。
 *   - 下方向: step2ABase から minPtPerLive 刻みで R0 未満まで
 *     （「モードAは曲の基礎点だけ残せば足りる」＝小さい確保額で採取を最大化する）。
 *   - 上方向: R0 から minPtPerLive 刻み（穴帯を確実に越える安全域。R5 の趣旨）。
 * すべて step2ABase / minPtPerLive / r0 からの導出でリテラル無し。
 */
function reserveCandidates(step2ABase: number, r0: number, minPtPerLive: number): number[] {
  const set = new Set<number>();
  for (let m = 0; step2ABase + m * minPtPerLive < r0; m += 1) {
    set.add(step2ABase + m * minPtPerLive);
  }
  for (let k = 0; k <= RESERVE_BACKOFF_MAX_TRIES; k += 1) {
    set.add(r0 + k * minPtPerLive);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Step2 が着地不能にならない確保額を選ぶ（R6 §2-1 で優先順位を刷新）。
 *
 * 候補列は step2ABase 起点の下方向（採取を最大化）＋ R0 起点の上方向（安全域）の
 * 昇順マージ。優先順位:
 *   1. モードA・Bが両立する最小の確保額（穴帯改善＝R5 の趣旨を維持）
 *   2. 無ければ okA ∨ okB が成立する最小の確保額（§1 でAが複数回化して強くなったので
 *      旧「B-only」を A∨B に拡張。calculator の合成条件 A∨B と同型）
 *   3. それも無ければ step2ABase の attempt を返す（全滅時はレガシー相当の配分にして
 *      UI の NG 案内と数字を揃える。旧 R0 フォールバックから変更）
 *
 * 「レガシー reserve=step2ABase で単発着地できた入力は新実装でも着地する」比較プロパティ:
 * 候補列は必ず step2ABase を含み、その okA は表示側と同じ planLiveAdjustment で判定するので、
 * レガシーOK ⇒ 新 okA true ⇒ 優先順位1か2で必ず採用される（一方向含意が構造的に成立）。
 */
export function chooseDynamicReserve(params: DynamicReserveParams): DynamicReserveResult {
  const maxScoreN = params.maxScoreN ?? DEFAULT_MAX_SCORE_N;
  const step2ABase = params.step2ABase ?? DEFAULT_BASE_POINT;
  const liveBonusesA = params.liveBonusesA ?? ADJUST_LIVE_BONUSES;
  const logs: string[] = [];

  const table = params.table ?? buildReachablePtTable(params.bonus, params.basePoints, maxScoreN);
  const minPtPerLive = table.minPtPerLive;

  // 到達Pt集合が空（単価的にライブで1Ptも取れない等）なら動的化の土台が無い。
  // 従来の固定リザーブに退避し、配分だけ行って返す（着地判定は呼び出し側に委ねる）。
  if (!(minPtPerLive > 0)) {
    const allocation = allocateMySekai(params.adjustableDiff, params.unitBasePt, LIVE_ADJUST_RESERVE);
    logs.push(
      `[Dynamic Reserve] Reachable Pt table empty (minPtPerLive=${minPtPerLive}); fell back to fixed reserve ${LIVE_ADJUST_RESERVE}.`
    );
    return {
      reserve: LIVE_ADJUST_RESERVE,
      allocation,
      liveRequired: params.adjustableDiff - allocation.totalPt,
      tries: 0,
      minPtPerLive,
      okA: false,
      okB: false,
      logs,
    };
  }

  const evalParams = {
    adjustableDiff: params.adjustableDiff,
    unitBasePt: params.unitBasePt,
    bonus: params.bonus,
    maxScoreN,
    step2ABase,
    liveBonusesA,
  };

  // 理論下界。この帯未満は解が疎（docs §2 の実測）。
  const r0 = (EXHAUSTIVE_MAX_LIVES + 1) * minPtPerLive;
  const candidates = reserveCandidates(step2ABase, r0, minPtPerLive);
  logs.push(
    `[Dynamic Reserve] R0=${r0} ((EXHAUSTIVE_MAX_LIVES+1)×minPtPerLive=${EXHAUSTIVE_MAX_LIVES + 1}×${minPtPerLive}), step=${minPtPerLive}, ${candidates.length} candidates ${candidates[0]}..${candidates[candidates.length - 1]}.`
  );

  let both: Attempt | undefined; // okA && okB の最小（優先順位1）
  let either: Attempt | undefined; // okA || okB の最小（優先順位2）
  let baseAttempt: Attempt | undefined; // step2ABase の attempt（優先順位3・最終フォールバック）

  for (let i = 0; i < candidates.length; i += 1) {
    const reserve = candidates[i];
    const attempt = evaluate(reserve, i, evalParams, table);
    if (reserve === step2ABase) baseAttempt = attempt;
    if ((attempt.okA || attempt.okB) && !either) either = attempt;
    if (attempt.okA && attempt.okB) {
      both = attempt;
      break; // 昇順なので最初の両立が最小。以降は不要。
    }
  }

  if (both) {
    logs.push(`[Dynamic Reserve] Adopted reserve ${both.reserve} (mode A & B both land).`);
    return { ...both, minPtPerLive, logs };
  }
  if (either) {
    logs.push(
      `[Dynamic Reserve] No reserve satisfied both modes; adopted A∨B reserve ${either.reserve} (okA=${either.okA}, okB=${either.okB}).`
    );
    return { ...either, minPtPerLive, logs };
  }

  // baseAttempt は必ず定義される（step2ABase は候補列の先頭で1回は評価する）。
  const fallback = baseAttempt ?? evaluate(step2ABase, 0, evalParams, table);
  logs.push(
    `[Dynamic Reserve] No landable reserve found; kept step2ABase=${fallback.reserve}. NG handling left to UI.`
  );
  return { ...fallback, minPtPerLive, logs };
}
