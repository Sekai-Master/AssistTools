import { DEFAULT_BASE_POINT, DEFAULT_MAX_SCORE_N, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import { calcLivePt } from "./calcLivePt";
import {
  buildReachablePtTable,
  planFromReachablePtTable,
  type MultiLivePlan,
  type MultiLiveUnit,
} from "./multiLiveAdjust";

/**
 * 「スコア0イベ乙」— 最後の1本をスコア0（放置）で締める探索API。
 *
 * 仕様: docs/point-adjust-score-zero-finish.md
 *
 * ## なぜ締めの値を先に固定して探索するか
 *
 * 締めの1本は「叩かない」ことで実行時の分散をゼロにする安全策。したがって
 * 締めの獲得Ptはミスの入り込む余地なく calcLivePt(基礎点, bonus, スコア0, LB)
 * から一意に決まる（ハードコード禁止＝この式から導出する）。締めの値を先に
 * 引いてしまえば、残りは既存の通常探索 planMultiLiveAdjustment にそのまま
 * 渡せる。探索本体（frontier構築・best選択）には一切触れない。
 *
 * ## 締めの手段（基礎点×LB）をどう選ぶか
 *
 * 締めの値は基礎点とLBの両方に依存する（calcLivePt(base, bonus, 0, lb)）ため、
 * 候補は basePoints.length × (MAX_LIVE_BONUS+1) 通りある。それぞれについて
 * 「残り = liveRequired − 締め値」を通常探索し、解けたものの中から
 *   1. 総ライブ数（通常探索分 + 締め1本）が最小
 *   2. 同数なら総LB消費（通常探索分 + 締めのLB）が最小
 * を採る。締めに実際どの曲を使うか（同一基礎点内の選曲＝演奏時間の短さ）は
 * lib が知らない情報なので、選ぶのは基礎点とLBまでに留める（UIの契約）。
 *
 * ## 締めユニットを MultiLiveUnit として返す理由
 *
 * 締めは「スコア0固定」なので帯は常に [0, SCORE_STEP-1]（= scoreBandBadge が
 * 判定する「放置」帯そのもの）。通常のユニットと同じ形にしておけば、UI 側は
 * 既存のユニット表示コンポーネントにそのまま乗せられ、区別表示（視覚強調）
 * だけを追加すればよい。
 *
 * ## パフォーマンス: 到達可能Pt表は締め候補間で使い回す（弱点3対応）
 *
 * 締め候補は basePoints.length × (MAX_LIVE_BONUS+1) 通りあり、それぞれについて
 * 「残り」を通常探索する。bonus・basePoints・maxScoreN はどの候補でも同じなので、
 * 到達可能Pt表（buildReachablePtTable の戻り値）は liveRequired に依存しない
 * ＝1回構築すれば全候補で使い回せる。以前は候補ごとに
 * planMultiLiveAdjustment（内部で毎回この表を再構築）を呼んでいたため、
 * 実測 619〜935ms（28基礎点）かかっていた。表の共有は探索本体
 * （frontier構築・best選択）を一切変更しない純粋な計算結果キャッシュなので、
 * 返す解は最適化前後で同一になる（scoreZeroFinish.test.ts で固定）。
 */

export interface ScoreZeroFinishPlan {
  /** 締めの1本を除いた通常探索プラン。liveRequired が締め値ちょうどなら0本の空プラン。 */
  regular: MultiLivePlan;
  /** 締めの1本（スコア0固定・count=1・minScore=0）。 */
  finish: MultiLiveUnit;
  /** regular.units に finish を加えた完全なプラン（画像化・合計表示用）。 */
  full: MultiLivePlan;
}

export interface ScoreZeroFinishResult {
  status: "OK" | "NG";
  plan?: ScoreZeroFinishPlan;
  /** NG のとき: 試したどの締め値候補でも残りが厳密着地しなかった（liveRequired<=0 も含む）。 */
  reason?: "NO_EXACT";
}

const NO_SOLUTION: ScoreZeroFinishResult = { status: "NG", reason: "NO_EXACT" };

/** 空プラン（残り0＝締め1本だけで完了する場合に使う）。 */
const EMPTY_PLAN: MultiLivePlan = { units: [], liveCount: 0, lbCost: 0, totalPt: 0 };

/**
 * liveRequired を「通常探索N本 + スコア0の締め1本」で厳密着地させるプランを探す。
 *
 * 締めは正のPtを必ず生む（スコア0でも基礎点・LBがあれば1以上のPtになる）ため、
 * liveRequired が0以下では締めた瞬間に超過するか調整不要のどちらかで、
 * このオプションとして成立しない。その場合は NG（NO_EXACT）を返す。
 */
export function planScoreZeroFinish(
  liveRequired: number,
  bonus: number,
  basePoints: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): ScoreZeroFinishResult {
  if (!Number.isFinite(liveRequired) || liveRequired <= 0) return NO_SOLUTION;

  const bases = basePoints.length > 0 ? basePoints : [DEFAULT_BASE_POINT];

  // 同じ締め値を複数の (基礎点, LB) が生みうる（例: 異なる基礎点でも計算式の
  // 端数処理で同じPtに丸まる）。値ごとに「最小LB、同LBなら最小基礎点」の
  // 代表だけを残し、通常探索（重い）の重複呼び出しを避ける。
  const finishByPt = new Map<number, MultiLiveUnit>();
  for (const basePoint of bases) {
    for (let liveBonus = 0; liveBonus <= MAX_LIVE_BONUS; liveBonus += 1) {
      const pt = calcLivePt(basePoint, bonus, 0, liveBonus);
      if (pt <= 0 || pt > liveRequired) continue;
      const existing = finishByPt.get(pt);
      const better =
        !existing ||
        liveBonus < existing.liveBonus ||
        (liveBonus === existing.liveBonus && basePoint < existing.basePoint);
      if (better) {
        finishByPt.set(pt, { basePoint, liveBonus, minScore: 0, maxScore: SCORE_STEP - 1, pt, count: 1 });
      }
    }
  }

  // 締め候補全体で1回だけ構築し、候補ごとの通常探索に使い回す（弱点3対応）。
  const table = buildReachablePtTable(bonus, bases, maxScoreN);

  let best: ScoreZeroFinishPlan | null = null;
  for (const finish of finishByPt.values()) {
    const remaining = liveRequired - finish.pt;
    const r = planFromReachablePtTable(remaining, table);
    if (r.status !== "OK") continue;
    const regular = r.plans[0] ?? EMPTY_PLAN;
    const liveCount = regular.liveCount + 1;
    const lbCost = regular.lbCost + finish.liveBonus;

    if (best && (liveCount > best.full.liveCount || (liveCount === best.full.liveCount && lbCost >= best.full.lbCost))) {
      continue; // 総本数→総LBの優先順位で改善しない候補は捨てる
    }

    best = {
      regular,
      finish,
      full: {
        units: [...regular.units, finish],
        liveCount,
        lbCost,
        totalPt: regular.totalPt + finish.pt,
      },
    };
  }

  if (!best) return NO_SOLUTION;
  return { status: "OK", plan: best };
}
