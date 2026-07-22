import { useMemo, useState } from "react";
import { StepSection } from "./StepSection";
import { NeuButton } from "../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../components/SongSearchModal";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byDistanceTo, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";
import type { AnalyzerMusic } from "../useAnalyzerMusics";
import type { AliasEntry } from "../../bingo/useBingoMusics";

interface Props {
  result: CalculationResultV6;
  musics: AnalyzerMusic[];
  aliases: AliasEntry[];
  jacketBase: string;
  bonus: number;
  selectedSong?: AnalyzerMusic;
  onChangeSong: (id: string) => void;
}

/** Step3: ラストラン。楽曲を変えると親で再計算し、推奨プランを出す。 */
export function FinalRunStep({
  result,
  musics,
  aliases,
  jacketBase,
  bonus,
  selectedSong,
  onChangeSong,
}: Props) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  return (
    <StepSection
      unit="n25"
      title={`③ ラストラン（${result.finalRunPt.toLocaleString()} Pt）`}
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <div className="mb-4 flex items-center gap-3">
        {jacketSrc ? (
          <img src={jacketSrc} alt="" className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-700">
            {selectedSong ? selectedSong.title : "楽曲"}
          </p>
          <p className="text-xs text-slate-400">基礎点 {result.finalBase}</p>
        </div>
        <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setModalOpen(true)}>
          曲を変更
        </NeuButton>
      </div>

      {result.finalRunPlans.length > 0 ? (
        <PlanSelectionUI
          plans={result.finalRunPlans}
          recommendedPlans={recommended}
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          modalTitle="ラストラン 調整プラン一覧"
          jacketSrc={jacketSrc}
          songTitle={selectedSong?.title}
        />
      ) : (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          この楽曲で {result.finalRunPt.toLocaleString()} Pt を獲得するプランは見つかりませんでした
          （ボーナス 0〜{bonus}% で探索）。別の楽曲を試してください。
        </div>
      )}

      {modalOpen && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          title="ラストランの楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            onChangeSong(m.id);
            setSelectedPlan(null);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </StepSection>
  );
}
