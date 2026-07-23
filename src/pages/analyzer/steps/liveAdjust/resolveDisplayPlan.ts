import type { MultiLiveAdjustResult, MultiLivePlan } from "../../lib/multiLiveAdjust";
import type { SameBaseSearchResult } from "../../lib/sameBaseAdjust";
import type { ScoreZeroFinishResult } from "../../lib/scoreZeroFinish";
import { getAdoptedPlan, isSingleSong } from "./planSelection";
import type { Adopted } from "./types";

/**
 * 主役カードにどのプランを・どんな見出しで出すかの決定（致命傷A・B・C・スコア0イベ乙の統合）。
 *
 * 優先順位:
 *   1. 明示的な採択（他案を選んでいる） … その案をそのまま出す。トグル類は無視する
 *      （致命傷B: 採択中にトグルが無言で無効になるのをやめ、呼び出し側でトグルを
 *      disabled にして理由を明示する前提。ここでは「無視した」ことを notice では出さない
 *      ＝ UI 側の disabled 表示と役割分担する）。
 *   2. スコア0イベ乙トグルON かつ 探索成功 … 締め1本を含む完全プランを出す。
 *      ドキュメント（最後の1本の価値が最大）に従い、同一曲縛りより優先する。
 *   3. 同一曲縛りトグルON かつ（2で採用しなかった場合に）探索成功 … その基礎点だけの
 *      プランを出す。
 *   4. 上記トグルが有効なのに失敗・不適用に終わった場合 … 理由付きで notice を積む。
 *      「ONなのに無言で捨てられる」を許さない（致命傷C）。ONのトグルが複数あって
 *      両方とも不適用なら notice も複数出す。
 *   5. どのトグルもOFF、または全滅 … 主役をそのまま出す。
 *
 * ## 致命傷C（2つのトグル併用時の無言不適用）の直し方
 *
 * 「同じ曲だけで組む」＋「スコア0イベ乙」を両ONにすると、呼び出し側
 * （LiveAdjustStep.tsx）がまず「ロックした基礎点1つだけ」でスコア0探索を試し、
 * それがNGなら「全基礎点」で再試行してから scoreZeroResult として渡してくる。
 * そのため、ここで受け取る scoreZeroResult が OK なら「探索は成功している」
 * ことは保証されるが、その解が同一曲に収まっているとは限らない（全基礎点
 * フォールバックで解けた場合、曲は混ざる）。isSingleSong で実際に確認し、
 * 混ざっていれば「同一曲縛りは事実上外れている」ことを notice で必ず伝える
 * （旧実装は scoreZeroOn && OK なら無条件に「同一曲縛りに優先する」だけで、
 * 同一曲が崩れたことも・崩れていないことも UI が言わなかった）。
 */
export interface DisplayPlanResolution {
  plan: MultiLivePlan;
  cardLabel: string;
  /**
   * トグルが有効なのに解が見つからなかった・不適用に終わった場合の案内文。
   * 該当なしなら空配列。複数のトグルが同時に不適用になった場合は複数件入る。
   */
  notices: string[];
  /** 表示中プランの末尾ユニットがスコア0イベ乙の締めかどうか（UI側のバッジ出し分け用）。 */
  isScoreZeroFinish: boolean;
}

const SCORE_ZERO_NG_NOTICE =
  "この残額はスコア0イベ乙では締められません（探索済み）。通常のプランを表示しています。";

const SAME_SONG_NG_NOTICE_DEFINITIVE =
  "この残額では同一曲だけで組める案が見つかりませんでした（探索済み・曲を混ぜた主役を表示中）。";

// 弱点2対応: sameBaseAdjust が landability=UNPROVEN を返す場合（=探索クラスの
// 死角に該当する可能性がある場合）は、「無い」と断定せず探索範囲に言及した
// 弱い表現にする（致命傷Aの縮小再生産を防ぐ）。
const SAME_SONG_NG_NOTICE_UNPROVEN =
  "この探索範囲では同一曲だけで組める案が見つかりませんでした（曲を混ぜた主役を表示中）。";

const SAME_SONG_BROKEN_BY_SCORE_ZERO_NOTICE =
  "スコア0イベ乙を優先したため、同一曲だけでは組めていません（曲を混ぜた案を表示中）。";

/** songLockResult の NG entries に一件でも UNPROVEN があれば断定を避ける。 */
function hasUnprovenEntry(songLockResult: SameBaseSearchResult | undefined): boolean {
  if (!songLockResult) return false;
  return songLockResult.entries.some((e) => e.status === "NG" && e.landability === "UNPROVEN");
}

export function resolveDisplayPlan(args: {
  multi: MultiLiveAdjustResult;
  primaryPlan: MultiLivePlan;
  adopted: Adopted;
  sameSongOnly: boolean;
  songLockResult: SameBaseSearchResult | undefined;
  scoreZeroOn: boolean;
  scoreZeroResult: ScoreZeroFinishResult | undefined;
}): DisplayPlanResolution {
  const { multi, primaryPlan, adopted, sameSongOnly, songLockResult, scoreZeroOn, scoreZeroResult } = args;

  if (adopted.kind !== "primary") {
    const plan = getAdoptedPlan(multi, adopted) ?? primaryPlan;
    return { plan, cardLabel: "▸ 採択中", notices: [], isScoreZeroFinish: false };
  }

  const notices: string[] = [];
  let plan = primaryPlan;
  let cardLabel = "▸ 主役";
  let isScoreZeroFinish = false;

  if (scoreZeroOn) {
    if (scoreZeroResult?.status === "OK" && scoreZeroResult.plan) {
      plan = scoreZeroResult.plan.full;
      cardLabel = "▸ スコア0イベ乙";
      isScoreZeroFinish = true;
    } else {
      notices.push(SCORE_ZERO_NG_NOTICE);
    }
  }

  if (sameSongOnly) {
    if (isScoreZeroFinish) {
      // スコア0イベ乙が優先採用された。その解が同一曲に収まっているかを確認する
      // （収まっていれば同一曲縛りも実質満たされているので notice は不要）。
      if (!isSingleSong(plan)) {
        notices.push(SAME_SONG_BROKEN_BY_SCORE_ZERO_NOTICE);
      }
    } else {
      const pick = songLockResult?.solved[0];
      if (pick) {
        plan = pick.plan;
        cardLabel = "▸ 同一曲固定案";
      } else if (songLockResult) {
        notices.push(
          hasUnprovenEntry(songLockResult) ? SAME_SONG_NG_NOTICE_UNPROVEN : SAME_SONG_NG_NOTICE_DEFINITIVE
        );
      }
    }
  }

  return { plan, cardLabel, notices, isScoreZeroFinish };
}
