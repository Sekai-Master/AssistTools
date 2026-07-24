import { useMemo } from "react";
import { StepSection } from "./StepSection";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byDistanceTo, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";
import type { LastPlayOutcome } from "../lib/lastPlay";
import type { AnalyzerMusic } from "../useAnalyzerMusics";
import { onJacketError } from "../../../lib/img";

interface Props {
  result: CalculationResultV6;
  /** Step3の確定結果（none/earn/scoreZero）。曲・Ptの表示出し分けに使う。 */
  lastPlay: LastPlayOutcome;
  bonus: number;
  jacketBase: string;
  selectedSong?: AnalyzerMusic;
  /** 採択中のラストプレイプラン（earn モードのみ使う）。 */
  selectedPlan: UniversalPlan | null;
  onSelectPlan: (plan: UniversalPlan | null) => void;
}

/**
 * Step3: ラストプレイ。R5でモードにより表示を出し分ける
 *   earn      … 従来のラストラン（希望Ptのプラン一覧から選ぶ）
 *   scoreZero … 締め値・LBを自動算出して1枚のカードで見せる（叩かない）
 * mode "none" は PointAnalyzer 側でそもそもこのコンポーネントを描画しない。
 */
export function FinalRunStep({
  result,
  lastPlay,
  bonus,
  jacketBase,
  selectedSong,
  selectedPlan,
  onSelectPlan,
}: Props) {
  const recommended = useMemo(
    () => recommendPlans(result.finalRunPlans, byDistanceTo(bonus)),
    [result.finalRunPlans, bonus]
  );

  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (result.liveAdjustment.status === "OK" ? result.liveAdjustment.requiredPt : 0) +
    result.finalRunPt;

  const jacketSrc = selectedSong ? `${jacketBase}${selectedSong.jacketLink}` : undefined;

  if (lastPlay.mode === "scoreZero") {
    return (
      <StepSection
        unit="n25"
        title="③ ラストプレイ（スコア0でクリア）"
        footerLabel="このステップ完了時"
        footerValue={reached}
      >
        {lastPlay.status === "OK" ? (
          <div className="flex items-center gap-4 rounded-xl bg-neu p-4 shadow-neu-inset">
            {jacketSrc ? (
              <img
                src={jacketSrc}
                alt=""
                className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
                onError={onJacketError}
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-slate-700">
                {selectedSong ? selectedSong.title : "楽曲"}
              </p>
              <p className="text-xs text-slate-500">
                叩かずにクリア（スコア0固定）・LB {lastPlay.finishLb}炊き
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold tabular-nums" style={{ color: "var(--unit-color)" }}>
                +{lastPlay.pt.toLocaleString()} Pt
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
            この楽曲・目標ではスコア0クリアで締められませんでした。別の楽曲を試すか、
            「希望Ptを稼ぐ」モードに切り替えてください。
          </div>
        )}
      </StepSection>
    );
  }

  return (
    <StepSection
      unit="n25"
      title={`③ ラストプレイ（${result.finalRunPt.toLocaleString()} Pt）`}
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <div className="mb-4 flex items-center gap-3">
        {jacketSrc ? (
          <img
            src={jacketSrc}
            alt=""
            className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
            onError={onJacketError}
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-700">
            {selectedSong ? selectedSong.title : "楽曲"}
          </p>
          <p className="text-xs text-slate-500">基礎点 {result.finalBase}</p>
        </div>
      </div>

      {result.finalRunPlans.length > 0 ? (
        <PlanSelectionUI
          plans={result.finalRunPlans}
          recommendedPlans={recommended}
          selectedPlan={selectedPlan}
          onSelectPlan={onSelectPlan}
          modalTitle="ラストプレイ 調整プラン一覧"
          jacketSrc={jacketSrc}
          songTitle={selectedSong?.title}
        />
      ) : (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          この楽曲で {result.finalRunPt.toLocaleString()} Pt を獲得するプランは見つかりませんでした
          （ボーナス 0〜{bonus}% で探索）。入力フォームで別の楽曲を試してください。
        </div>
      )}
    </StepSection>
  );
}
