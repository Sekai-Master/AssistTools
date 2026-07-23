import { DEFAULT_BASE_POINT, DEFAULT_MAX_SCORE_N } from "./constants";
import { planMultiLiveAdjustment, type MultiLivePlan } from "./multiLiveAdjust";

/**
 * 同一基礎点（＝実質同一曲）縛りの厳密着地探索（ブリーフ P1-6・致命傷Aの根治）。
 *
 * ## 何を直すか
 *
 * 旧実装（LiveAdjustStep.tsx の findSingleSongPlan）は、主役 → sameCountVariants
 * （lbCost昇順トップ4） → plans（前線）という**既存の表示用リストを後から
 * フィルタする**だけだった。sameCountVariants は「見せる代表4件」に絞る提示
 * ポリシーであって「存在する全内訳」ではないため、単一基礎点で厳密着地できる
 * 組合せがトップ4の外に落ちると、実在するのに「見つかりませんでした」という
 * 虚偽の NG を表示していた（DP全数照合で実測: 残額2,000〜60,000のうちエビ
 * 単独着地可能な54件中15件が表示フィルタで欠落）。
 *
 * ## 直し方
 *
 * 「表示リストをフィルタする」のをやめ、基礎点ごとに
 * planMultiLiveAdjustment(liveRequired, bonus, [base]) を**独立に**呼んで
 * 直接探索する。これは探索本体（frontier構築・best選択）を一切変更せず、
 * 呼び出し回数を増やすだけなので禁じ手（探索本体の書き換え不可）に触れない。
 *
 * ## 探索クラスの限界（正確な記述）
 *
 * n=1・n=2 は前線側が全数照合（v の全掃引）なので、単一基礎点の1〜2値解は
 * 常に正しく見つかる。3値の解は EXHAUSTIVE_MAX_LIVES 本以内の帯
 * （liveRequired < (EXHAUSTIVE_MAX_LIVES+1) × minPtPerLive）でのみ
 * findExhaustiveExact が拾う。**この帯の外の3値解、および4本以上を要する解
 * （3値以上の組合せ）は、単一基礎点・複数基礎点を問わずこの探索クラスの
 * 構造的な死角で、原理的に存在しても見つからない**（破壊者レポートの実測:
 * 52,817件中167件・0.32%が該当。取りこぼしはすべて「4本以上×3値以上」、
 * 例 9,465 = 1100+1100+1220+6045）。旧コメントは「3値解は帯内でのみ」と
 * 書いていたが、帯外で全滅するのは3値解に限らず4値以上の解も同様なので
 * 過小申告だった。この限界自体は本ラウンドの対応範囲外（frontier/exhaustive
 * の探索クラス拡張は禁じ手）なので、下記の landability 伝播で「無い」と
 * 「この探索範囲では見つからない」を区別できるようにするだけに留める。
 *
 * ## 「解なし」と「探索していない」の区別
 *
 * 戻り値の entries は入力 basePoints と同じ順・同じ件数で必ず1件ずつ対応する。
 * 呼び出し側は「entries に無い基礎点＝探索していない（そもそも渡さなかった）」
 * 「entries があって status==='NG'＝探索した上で解なし」を戻り値の形だけで
 * 区別できる。旧実装の「リストに無かった」が上記どちらなのか分からない状態を
 * 解消するのがこの型設計の目的。
 *
 * ## 「無い」と「見つからない」の区別（弱点2対応）
 *
 * status==='NG' の entry には必ず landability（'UNREACHABLE' | 'UNPROVEN'）を
 * 添える。planMultiLiveAdjustment 自身がこの確定度を返しているのに、旧実装は
 * それを握り潰して一律 "NG" にしていた（致命傷Aの縮小再生産）。UNPROVEN の
 * ときは「見つからなかった」であって「存在しない」の証明ではないので、
 * UI 側は断定表現（「見つかりませんでした」）を避け、探索範囲に言及した
 * 弱い表現にすること。
 */

export interface SameBaseEntry {
  basePoint: number;
  status: "OK" | "NG";
  /** status === "OK" のときの最良プラン（回数最小・同数ならLB最小。ceilが証明する下界に一致）。 */
  plan?: MultiLivePlan;
  /**
   * status === "NG" のときの着地可能性の確定度（弱点2対応）。
   *   "UNREACHABLE": 原理的に着地不能（liveRequired < この基礎点の最小獲得Pt、
   *                  もしくは全数照合できる帯で解なしを確認済み）。断定してよい。
   *   "UNPROVEN":    この探索クラスの範囲（回数上限・1案のPt値2種まで・3値は
   *                  帯内のみ）で見つからなかっただけ。実際には4本以上×3値以上
   *                  の解が存在する可能性がある。断定を避けること。
   * planMultiLiveAdjustment の landability をそのまま伝播する（潰さない）。
   * status === "OK" のときは undefined。
   */
  landability?: "UNREACHABLE" | "UNPROVEN";
}

export interface SameBaseSearchResult {
  /** 試した全基礎点の結果。入力 basePoints と同順・同件数（探索有無の区別に使う）。 */
  entries: SameBaseEntry[];
  /** entries のうち status === 'OK' だけを回数昇順→LB昇順で並べたもの（一覧表示用）。 */
  solved: Array<SameBaseEntry & { plan: MultiLivePlan }>;
}

/** 空プラン（liveRequired===0 のときの「0本で調整完了」を表す）。 */
const EMPTY_PLAN: MultiLivePlan = { units: [], liveCount: 0, lbCost: 0, totalPt: 0 };

/**
 * basePoints の各基礎点について、その基礎点だけで liveRequired を厳密着地
 * できるかを独立に探索する。
 *
 * 基礎点ごとに探索を完全に分離しているため、ある基礎点の解の有無・内容は
 * 他の基礎点が何であっても変わらない（既存の変種収集のような「4件キャップ」
 * によって押し出される事故が構造的に起きない）。
 */
export function findSameBasePlans(
  liveRequired: number,
  bonus: number,
  basePoints: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): SameBaseSearchResult {
  const bases = basePoints.length > 0 ? basePoints : [DEFAULT_BASE_POINT];

  const entries: SameBaseEntry[] = bases.map((basePoint) => {
    const r = planMultiLiveAdjustment(liveRequired, bonus, [basePoint], maxScoreN);
    if (r.status !== "OK") {
      // 弱点2: r.landability を握り潰さずそのまま伝える。OVER_CAP など
      // landability が未計算の経路では undefined のまま（=断定材料が無い）。
      return { basePoint, status: "NG", landability: r.landability };
    }
    // liveRequired===0 は「調整不要」で status OK・plans 空になる仕様
    // （planMultiLiveAdjustment 側の既存挙動）。これも「解けた」に含めるため
    // 0本の空プランを明示的に補う。
    const plan = r.plans[0] ?? EMPTY_PLAN;
    return { basePoint, status: "OK", plan };
  });

  const solved = entries
    .filter((e): e is SameBaseEntry & { plan: MultiLivePlan } => e.status === "OK")
    .slice()
    .sort((a, b) => a.plan.liveCount - b.plan.liveCount || a.plan.lbCost - b.plan.lbCost);

  return { entries, solved };
}
