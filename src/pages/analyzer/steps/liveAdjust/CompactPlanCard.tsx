import { NeuButton } from "../../../../components/ui/NeuButton";
import type { MultiLivePlan } from "../../lib/multiLiveAdjust";
import { FormationUnchangedBadge, LbCostNote, ScoreBandTag } from "./badges";
import { UnitLine } from "./UnitLine";
import { scoreBandBadge } from "../../lib/scoreBandBadge";

/**
 * 「同じN回で組み替える」「本数を増やしてLBを節約」で使うコンパクトカード。
 * 主役カードと違い曲候補までは出さず、採択して昇格するための最小限の情報だけ出す。
 */
export function CompactPlanCard({
  plan,
  timeLabel,
  adopted,
  singleSong,
  onAdopt,
}: {
  plan: MultiLivePlan;
  /** 「約N分」や「約N分（主役比 +M分）」など、呼び出し側で組み立てた時間表示。 */
  timeLabel: string;
  /** このカードが現在の採択中プランそのものか（弱点10）。 */
  adopted: boolean;
  /** 全ユニットが同一基礎点か（P1-6。同一曲縛りトグルで探す対象の目印）。 */
  singleSong: boolean;
  onAdopt: () => void;
}) {
  return (
    <div
      className={
        adopted
          ? "rounded-xl bg-neu p-3 shadow-neu-inset ring-1 [--tw-ring-color:var(--unit-color)]"
          : "rounded-xl bg-neu p-3 shadow-neu-sm"
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="tabular-nums">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
          <LbCostNote lbCost={plan.lbCost} /> ・ {timeLabel}
        </span>
        <FormationUnchangedBadge />
        {singleSong && (
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">同一曲</span>
        )}
        <NeuButton
          className="ml-auto !px-2.5 !py-1 !text-[11px]"
          active={adopted}
          disabled={adopted}
          onClick={onAdopt}
        >
          {adopted ? "採択中" : "この案にする"}
        </NeuButton>
      </div>
      <div className="space-y-0.5 text-xs text-slate-600">
        {plan.units.map((u, j) => (
          <div key={j} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <UnitLine u={u} />
            <ScoreBandTag band={scoreBandBadge(u)} />
          </div>
        ))}
      </div>
    </div>
  );
}
