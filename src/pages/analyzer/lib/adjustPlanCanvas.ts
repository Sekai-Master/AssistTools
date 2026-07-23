/**
 * 採択したライブ調整プラン（複数回・R3-2のパレート前線から選んだ1件）を
 * 共有用PNGに落とすためのデータ整形（R3-5.1）。
 *
 * 描画本体は refresh の drawPlanCanvas を再利用する。あちらは「行の文字列は
 * UI側で整形して渡す」契約なので、ここでは調整プランの各ユニットを
 * PlanCanvasRow に写像するだけに徹する。画像単体で実行に必要な情報
 * （曲・LB・スコア帯・回数・合計Pt・総回数・LB合計）が全部読めることが要件。
 */
import type { PlanCanvasData, PlanCanvasRow } from "../../refresh/lib/planCanvas";
import type { MultiLivePlan } from "./multiLiveAdjust";
import type { FinalRunPlan } from "./finalRun";

/** 行に描く「実際に叩く曲」。未選択（該当曲なし）のユニットは undefined を渡す。 */
export interface AdjustCanvasSong {
  title: string;
  /** ジャケット画像のフルURL。読み込み失敗は drawPlanCanvas 側が無視する。 */
  jacketUrl: string;
}

/** 画像に載せるラストラン（Step③）。finalRunPt が0のときは渡さない。 */
export interface AdjustCanvasFinalRun {
  /** ラストランで獲得するポイント（result.finalRunPt）。 */
  pt: number;
  /** 最終楽曲の基礎点（result.finalBase）。 */
  basePoint: number;
  /** ユーザーが選んだ最終楽曲。 */
  song?: AdjustCanvasSong;
  /** 提示中の代表プラン（先頭）。無ければ帯を出さない。 */
  plan?: FinalRunPlan;
  /** 候補プランの総数。代表1件しか描けないので「他N件」を添えるために使う。 */
  planCount: number;
}

export function buildAdjustPlanCanvasData(args: {
  plan: MultiLivePlan;
  /** ライブ調整で獲得する必要ポイント（liveAdjustment.requiredPt）。 */
  requiredPt: number;
  /** 着地させる目標ポイント（result.targetPt）。画像の主役。 */
  targetPt: number;
  /** 起点の現在ポイント（result.currentPt）。 */
  currentPt: number;
  /** 正規化済みのスコア上限（result.maxScore）。R3-0の前提を画像にも残す。 */
  maxScore: number;
  /** 基礎点 → 選択中の曲。LiveAdjustStep の songByBase 解決結果をそのまま渡す。 */
  songForBase: (basePoint: number) => AdjustCanvasSong | undefined;
  /** ラストラン。省略時は調整ライブだけの画像になる。 */
  finalRun?: AdjustCanvasFinalRun;
  accent: string;
}): PlanCanvasData {
  const { plan, requiredPt, targetPt, currentPt, maxScore, songForBase, finalRun, accent } = args;

  // 左カラムは「何回 × 何炊き」に統一する。焚き数は実行時に一番間違えやすく、
  // 間違えるとライボが無駄に飛ぶ数字なので、専用の位置に固定して読み落とさせない。
  const rows: PlanCanvasRow[] = plan.units.map((u) => {
    const song = songForBase(u.basePoint);
    return {
      time: `${u.count}回 × ${u.liveBonus}炊き`,
      // 曲が未選択でも基礎点は必ず出す（画像だけ見ても何を叩くか分かるように）。
      label: song
        ? `${song.title}（基礎点${u.basePoint}）`
        : `基礎点${u.basePoint}の曲（候補なし）`,
      sub: `スコア ${u.minScore.toLocaleString()}〜${u.maxScore.toLocaleString()}（1回 ${u.pt.toLocaleString()} Pt）`,
      percent: `+${(u.pt * u.count).toLocaleString()} Pt`,
      warn: false,
      jacket: song?.jacketUrl,
    };
  });

  // ラストランは調整ライブとは別ステップなので、行の見た目でも区別が付くようにする。
  if (finalRun) {
    const p = finalRun.plan;
    const rest = finalRun.planCount - 1;
    rows.push({
      time: p ? `ラストラン × ${p.liveBonus}炊き` : "ラストラン",
      label: finalRun.song
        ? `${finalRun.song.title}（基礎点${finalRun.basePoint}）`
        : `基礎点${finalRun.basePoint}の曲`,
      sub: p
        ? `ボーナス${p.bonus}% ・ スコア ${p.minScore.toLocaleString()}〜${p.maxScore.toLocaleString()}` +
          (rest > 0 ? `（他${rest}案）` : "")
        : "条件を満たすプランが見つかりませんでした",
      percent: `+${finalRun.pt.toLocaleString()} Pt`,
      warn: !p,
      jacket: finalRun.song?.jacketUrl,
    });
  }

  // ラストランを含む総量。画像だけ見て「結局いくら・何回・LBいくつ」が分かること。
  const totalPt = plan.totalPt + (finalRun?.pt ?? 0);
  const totalLives = plan.liveCount + (finalRun ? 1 : 0);
  const finalLb = finalRun?.plan?.liveBonus ?? 0;
  const totalLb = plan.lbCost + finalLb;

  return {
    heading: "ポイント調整プラン",
    // 主役は「どこに着地するか」。全ツール共通で songTitle が最大文字なのでここに置く。
    songTitle: `目標 ${targetPt.toLocaleString()} Pt`,
    // meta は2行までしか入らない（HEADER_H の都合）。詰め込みすぎない。
    meta: [
      `現在 ${currentPt.toLocaleString()} → 差分 ${(targetPt - currentPt).toLocaleString()} Pt`,
      finalRun
        ? `調整 ${requiredPt.toLocaleString()} ＋ ラストラン ${finalRun.pt.toLocaleString()} ・ スコア上限 ${maxScore.toLocaleString()}`
        : `調整 ${requiredPt.toLocaleString()} Pt ・ スコア上限 ${maxScore.toLocaleString()}`,
    ],
    rows,
    summary: [
      { label: "合計獲得", value: `${totalPt.toLocaleString()} Pt` },
      { label: "総ライブ回数", value: `${totalLives}回` },
      // LB換算はR3-1の定数（自然回復30分/個）。重さが画像単体でも伝わるようにする。
      { label: "LB合計", value: `${totalLb}（約${totalLb * 0.5}h）` },
    ],
    accent,
    // 透かしは既定だと「リフレッシュゲージ計算機」になってしまうので差し替える。
    footer: "Sekai-Master / ポイント調整アナライザー",
    // 「+470,000 Pt」級の累積Ptを右カラムに出すため既定72pxでは足りない。
    rightColW: 110,
  };
}
