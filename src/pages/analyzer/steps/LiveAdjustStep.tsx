import { useState } from "react";
import { StepSection } from "./StepSection";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byBonusDesc, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";

const ENVY_JACKET = `${import.meta.env.BASE_URL}MusicDatas/jacket/jacket_s_074.webp`;

/** Step2: 独りんぼエンヴィーでの端数調整。 */
export function LiveAdjustStep({ result }: { result: CalculationResultV6 }) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  const live = result.liveAdjustment;
  const plans = live.adjustmentPlans ?? [];
  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (live.status === "OK" ? live.requiredPt : 0);

  return (
    <StepSection
      unit="ln"
      title="② ライブ調整（独りんぼエンヴィー）"
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-bold" style={{ color: "var(--unit-color)" }}>
          {live.requiredPt.toLocaleString()}
        </span>{" "}
        Pt を獲得します。
      </p>

      {live.status === "NG" && !selectedPlan ? (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          このポイント（<span className="font-bold">{live.requiredPt.toLocaleString()} Pt</span>
          ）は0〜1炊きでは調整できません。
          <span className="mt-1 block">
            目標ポイントを数ポイントずらすか、下の一覧から編成を組み替えるプランを選んでください。
          </span>
        </div>
      ) : null}

      {live.targetScoreRange && (
        <div className="mb-6 rounded-xl bg-neu p-5 text-center shadow-neu-inset">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            目標スコア範囲
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-800 sm:text-3xl">
            {live.targetScoreRange.min.toLocaleString()}
            <span className="mx-2" style={{ color: "var(--unit-color)" }}>
              〜
            </span>
            {live.targetScoreRange.max.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">現在のボーナス・0〜1炊きで達成可能です</div>
        </div>
      )}

      {plans.length > 0 && (
        <PlanSelectionUI
          plans={plans}
          recommendedPlans={recommendPlans(plans, byBonusDesc)}
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          modalTitle="ライブ調整プラン一覧"
          jacketSrc={ENVY_JACKET}
          songTitle="独りんぼエンヴィー"
        />
      )}
    </StepSection>
  );
}
