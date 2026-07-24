import { DEFAULT_BASE_POINT, MAX_LIVE_BONUS } from "./constants";
import { calcLivePt } from "./calcLivePt";
import { parseAmount } from "./inputParsing";
import {
  type CalculationOptionsV6,
  type CalculationResultV6,
  type MusicData,
  calculatePlanV6,
} from "./calculator";

/**
 * Step3（ラストプレイ）の3択と、その finalRunPt 導出（R5 / docs §1・§2）。
 *
 * ## 逆算構造での位置づけ
 *
 * Step3 は「最後に何をするか」の宣言。ここで finalRunPt が決まると
 * calculator が `adjustableDiff = totalDiff - finalRunPt` として Step1/2 を逆算する。
 * 計算順序（calculator）は変えず、**finalRunPt の「決め方」だけ**をここに集約する。
 *
 * ## 隠れた入力を計算に残り込ませない仕組み
 *
 * finalText（希望Pt入力）は **"earn" モードでしか読まれない**。planWithLastPlay が
 * calculatePlanV6 を呼ぶ唯一の funnel であり、finalText に触れるのは earn 分岐の中だけ
 * （型で読む経路を塞ぐ方式。state の値を消す運用に頼らない）。
 *
 * ## scoreZero の「移設」の実体
 *
 * 旧 planScoreZeroFinish の「通常探索N本＋締め1本」という複合プランは不要
 * （残りN本は Step1/2 の本流が担う）。Step3 のスコア0クリアは
 * 「ラストプレイ1本をスコア0で叩かずに終える」だけなので、
 * 締め値 finishPt = calcLivePt(基礎点, bonus, 0, LB) を LB昇順に試し、
 * **本物のパイプライン（calculatePlanV6）そのもの**で isVerified を検証する。
 * これにより「選択時の判定」と「表示される結果」の乖離が構造的にゼロになる。
 */

export type LastPlayMode = "none" | "earn" | "scoreZero";

/** ラストプレイの確定結果。finalRunPt がどう決まったかを型で表す。 */
export type LastPlayOutcome =
  | { mode: "none" }
  | { mode: "earn"; pt: number }
  | { mode: "scoreZero"; status: "OK"; pt: number; finishLb: number; finishBase: number }
  | { mode: "scoreZero"; status: "NG"; reason: "NO_FINISH"; finishBase: number };

export interface LastPlayFieldVisibility {
  /** 曲選択UIを出すか。 */
  showSong: boolean;
  /** 希望Pt入力欄を出すか。 */
  showPtInput: boolean;
}

/**
 * モードごとの入力欄の出し分け（docs §1 の表）。純関数なのでUIから独立にテストできる。
 *   none      … 曲✕ / 希望Pt✕
 *   earn      … 曲◯ / 希望Pt◯（必須）
 *   scoreZero … 曲◯ / 希望Pt✕（自動算出・表示のみ）
 */
export function lastPlayFieldVisibility(mode: LastPlayMode): LastPlayFieldVisibility {
  switch (mode) {
    case "none":
      return { showSong: false, showPtInput: false };
    case "earn":
      return { showSong: true, showPtInput: true };
    case "scoreZero":
      return { showSong: true, showPtInput: false };
  }
}

export interface PlanWithLastPlayInput {
  currentPt: number;
  targetPt: number;
  talent: number;
  bonus: number;
  hasWorldPass: boolean;
  /** ラストプレイの曲ID。未選択でも呼び出し側が既定（エビ ENVY_ID）を渡す。 */
  lastPlaySongId: string;
  musicsList: MusicData[];
  options?: CalculationOptionsV6;
}

export interface PlanWithLastPlayResult {
  result: CalculationResultV6;
  lastPlay: LastPlayOutcome;
}

/**
 * 曲IDから基礎点を引く。calculator の finalBase 解決と同じ規約
 * （musicsList にあればその basePoint、無ければ DEFAULT_BASE_POINT）。
 */
function resolveFinishBase(songId: string, musicsList: readonly MusicData[]): number {
  const found = musicsList.find((m) => m.id === songId);
  if (found && Number.isFinite(found.basePoint)) return found.basePoint;
  return DEFAULT_BASE_POINT;
}

/** 共通入力から calculatePlanV6 を呼ぶ（finalRunPt だけ差し替える）。 */
function runPipeline(
  input: PlanWithLastPlayInput,
  finalRunPt: number
): CalculationResultV6 {
  return calculatePlanV6(
    input.currentPt,
    input.targetPt,
    finalRunPt,
    input.talent,
    input.bonus,
    input.hasWorldPass,
    input.lastPlaySongId,
    input.musicsList,
    input.options
  );
}

/**
 * scoreZero の締めLBを「手前（Step1/2）が最も簡略になる」基準で選ぶ簡略度（R6 §3-1）。
 *
 * スコア0クリアの本質は「叩かない＝ミスが起きない」ことなので、締めのLBを増やして
 * 締めで吸収するPtを増やせば、手前のプレイ数を減らせる／不要にできる。値が小さいほど簡略:
 *   - requiredPt===0 → 0（Step2 丸ごと不要。ブリーフの例そのもの）
 *   - それ以外 → Step2 の最小プレイ本数（modeA複数回 / 単発A=1本 / modeB複数回 の最小）
 *   - どれも取れなければ +Infinity（isVerified 候補では起こらない型ガード）
 */
function scoreZeroSimplicity(result: CalculationResultV6): number {
  const la = result.liveAdjustment;
  if (la.requiredPt === 0) return 0;
  const counts: number[] = [];
  if (la.multiA?.status === "OK" && la.multiA.plans.length > 0) {
    counts.push(la.multiA.plans[0].liveCount);
  }
  // 単発A（現ボーナスのまま1本 or 編成組み替え1本）が成立していれば 1本。
  if ((la.adjustmentPlans && la.adjustmentPlans.length > 0) || la.targetScoreRange) {
    counts.push(1);
  }
  if (la.multi?.status === "OK" && la.multi.plans.length > 0) {
    counts.push(la.multi.plans[0].liveCount);
  }
  return counts.length > 0 ? Math.min(...counts) : Number.POSITIVE_INFINITY;
}

/** 手前簡略優先（simplicity 昇順）→ 同点は締めで余計に焚かない（lb 昇順）で1件選ぶ。 */
function pickSimplestScoreZero(
  candidates: readonly { lb: number; finishPt: number; result: CalculationResultV6 }[]
): { lb: number; finishPt: number; result: CalculationResultV6 } {
  return candidates.reduce((best, cur) => {
    const bs = scoreZeroSimplicity(best.result);
    const cs = scoreZeroSimplicity(cur.result);
    // candidates は lb 昇順なので、同点では先の（＝小さいlbの）best が残る。
    return cs < bs ? cur : best;
  });
}

/**
 * scoreZero: 締め値を全 LB でフル評価し、手前が最も簡略になる締めを採る（R6 §3-1）。
 *
 * - 締めのLBは叩かない（スコアに寄与しない）純コストだが、締めを大きくすると手前の
 *   プレイ数を減らせるので「最小LB」ではなく「手前が最も簡略」を選ぶ。
 * - 「昇順で最後の成功を採る」近似は不可: allocateMySekai の adjustableDiff<=reserve
 *   スキップ閾値により finishPt 増加に対し requiredPt が非単調。**全候補をフル評価して
 *   から比較**する（呼び出し回数は現状どおり ≤ MAX_LIVE_BONUS+1。§1-2 のメモ化で追加コスト小）。
 * - 同一 finishPt は初回（=最小LB）だけ試す（重複排除）。
 * - finishPt > totalDiff は adjustableDiff が負になり必ず未検証なので事前に除外。
 * - 全滅時は最初に試した結果を返し status NG（UIが「スコア0クリアでは着地できない」案内）。
 */
function planScoreZero(input: PlanWithLastPlayInput): PlanWithLastPlayResult {
  const finishBase = resolveFinishBase(input.lastPlaySongId, input.musicsList);
  const totalDiff = input.targetPt - input.currentPt;
  const seen = new Set<number>();
  let fallback: CalculationResultV6 | undefined; // 全滅時に返す最初の試行結果
  const candidates: { lb: number; finishPt: number; result: CalculationResultV6 }[] = [];

  for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
    const finishPt = calcLivePt(finishBase, input.bonus, 0, lb);
    if (finishPt <= 0 || finishPt > totalDiff) continue; // 超過は着地不能
    if (seen.has(finishPt)) continue; // 同値は最小LBだけ
    seen.add(finishPt);

    const result = runPipeline(input, finishPt);
    if (fallback === undefined) fallback = result;
    if (result.isVerified) candidates.push({ lb, finishPt, result });
  }

  if (candidates.length > 0) {
    const { lb, finishPt, result } = pickSimplestScoreZero(candidates);
    return { result, lastPlay: { mode: "scoreZero", status: "OK", pt: finishPt, finishLb: lb, finishBase } };
  }

  // 全滅。何か1つは試していれば fallback がある。1つも試せない（finishBase の
  // 最小締め値すら totalDiff 超）ときは finishPt=0 で結果だけ作る（表示用）。
  const result = fallback ?? runPipeline(input, 0);
  return { result, lastPlay: { mode: "scoreZero", status: "NG", reason: "NO_FINISH", finishBase } };
}

/**
 * earn モードの希望Pt入力バリデーション（弱点5）。null なら妥当、文字列ならエラー文言。
 *
 * 判定順:
 *   ① 空欄 or 明示0以下 → 未入力エラー。parseAmount("")===0 が上限チェックを素通りして
 *      「0 Pt を獲得するプラン」になる穴（inputParsing.ts）をここで塞ぐ。空欄と明示0は同罪。
 *   ② parseAmount(finalText) > totalDiff → 既存の超過文言。
 * scoreZero/none は自動算出・不使用なので対象外（earn 専用）。
 */
export function earnFinalPtError(finalText: string, totalDiff: number): string | null {
  const pt = parseAmount(finalText);
  if (finalText.trim() === "" || pt <= 0) {
    return "ラストプレイの希望ポイントを入力してください。";
  }
  if (pt > totalDiff) {
    return "最終獲得希望ポイントが差分を超えています。";
  }
  return null;
}

/**
 * Step3 モードに応じて finalRunPt を導出し、calculatePlanV6 を1回（scoreZero は
 * 最大 MAX_LIVE_BONUS+1 回）呼んで結果とラストプレイ確定情報を返す。
 *
 * @param finalText 希望Pt入力の生文字列。**"earn" 分岐でしか読まない**。
 */
export function planWithLastPlay(
  input: PlanWithLastPlayInput,
  mode: LastPlayMode,
  finalText: string
): PlanWithLastPlayResult {
  if (mode === "earn") {
    const pt = parseAmount(finalText);
    return { result: runPipeline(input, pt), lastPlay: { mode: "earn", pt } };
  }
  if (mode === "scoreZero") {
    return planScoreZero(input);
  }
  // none: finalRunPt = 0 固定。finalText は読まない。
  return { result: runPipeline(input, 0), lastPlay: { mode: "none" } };
}
