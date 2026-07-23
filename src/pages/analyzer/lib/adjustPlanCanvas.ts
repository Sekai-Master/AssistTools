/**
 * 採択したライブ調整プラン（複数回・R3-2のパレート前線から選んだ1件）を
 * 共有用PNGに落とすためのデータ整形（R3-5.1）。
 *
 * 描画本体は refresh の drawPlanCanvas を再利用する。あちらは「行の文字列は
 * UI側で整形して渡す」契約なので、ここでは調整プランの各ユニットを
 * PlanCanvasRow に写像するだけに徹する。画像単体で実行に必要な情報
 * （曲・LB・スコア帯・回数・合計Pt・総回数・LB合計）が全部読めることが要件。
 */
import type { PlanCanvasData } from "../../refresh/lib/planCanvas";
import type { MultiLivePlan } from "./multiLiveAdjust";

/** 行に描く「実際に叩く曲」。未選択（該当曲なし）のユニットは undefined を渡す。 */
export interface AdjustCanvasSong {
  title: string;
  /** ジャケット画像のフルURL。読み込み失敗は drawPlanCanvas 側が無視する。 */
  jacketUrl: string;
}

export function buildAdjustPlanCanvasData(args: {
  plan: MultiLivePlan;
  /** ライブ調整で獲得する必要ポイント（liveAdjustment.requiredPt）。 */
  requiredPt: number;
  /** 正規化済みのスコア上限（result.maxScore）。R3-0の前提を画像にも残す。 */
  maxScore: number;
  /** 基礎点 → 選択中の曲。LiveAdjustStep の songByBase 解決結果をそのまま渡す。 */
  songForBase: (basePoint: number) => AdjustCanvasSong | undefined;
  accent: string;
}): PlanCanvasData {
  const { plan, requiredPt, maxScore, songForBase, accent } = args;
  return {
    heading: "ポイント調整 ライブ調整プラン",
    songTitle: `調整ライブ 全${plan.liveCount}回 ・ LB合計${plan.lbCost}`,
    meta: [
      `必要ポイント ${requiredPt.toLocaleString()} Pt`,
      `スコア上限 ${maxScore.toLocaleString()}`,
    ],
    rows: plan.units.map((u) => {
      const song = songForBase(u.basePoint);
      return {
        time: `${u.count}回`,
        // 曲が未選択でも基礎点は必ず出す（画像だけ見ても何を叩くか分かるように）。
        label: song
          ? `${song.title}（基礎点${u.basePoint}）`
          : `基礎点${u.basePoint}の曲（候補なし）`,
        sub: `${u.liveBonus}炊き ・ スコア ${u.minScore.toLocaleString()}〜${u.maxScore.toLocaleString()}（1回 ${u.pt.toLocaleString()} Pt）`,
        percent: `+${(u.pt * u.count).toLocaleString()} Pt`,
        warn: false,
        jacket: song?.jacketUrl,
      };
    }),
    summary: [
      { label: "合計獲得", value: `${plan.totalPt.toLocaleString()} Pt` },
      { label: "総ライブ回数", value: `${plan.liveCount}回` },
      // LB換算はR3-1の定数（自然回復30分/個）。重さが画像単体でも伝わるようにする。
      { label: "LB合計", value: `${plan.lbCost}（約${plan.lbCost * 0.5}h）` },
    ],
    accent,
    // 透かしは既定だと「リフレッシュゲージ計算機」になってしまうので差し替える。
    footer: "Sekai-Master / ポイント調整アナライザー",
    // 「+470,000 Pt」級の累積Ptを右カラムに出すため既定72pxでは足りない。
    rightColW: 110,
  };
}
