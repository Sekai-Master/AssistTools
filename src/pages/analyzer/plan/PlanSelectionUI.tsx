import { type ReactNode, useState } from "react";
import { Search } from "lucide-react";
import { NeuButton } from "../../../components/ui/NeuButton";
import { PlanCard } from "./PlanCard";
import { PlanListModal } from "./PlanListModal";
import type { UniversalPlan } from "./types";

interface Props {
  plans: UniversalPlan[];
  recommendedPlans: UniversalPlan[];
  selectedPlan: UniversalPlan | null;
  onSelectPlan: (plan: UniversalPlan | null) => void;
  modalTitle: string;
  jacketSrc?: string;
  songTitle?: string;
  emptyMessage?: ReactNode;
}

/**
 * 推奨プランのカード表示＋全プラン一覧モーダルへの導線。
 * 選択中は詳細カード、未選択なら推奨カード一覧を出す。
 */
export function PlanSelectionUI({
  plans,
  recommendedPlans,
  selectedPlan,
  onSelectPlan,
  modalTitle,
  jacketSrc,
  songTitle,
  emptyMessage,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      {selectedPlan ? (
        <div>
          <PlanCard
            variant="detailed"
            plan={selectedPlan}
            jacketSrc={jacketSrc}
            songTitle={songTitle}
          />
          <button
            type="button"
            onClick={() => onSelectPlan(null)}
            className="mt-2 w-full text-sm text-slate-400 hover:text-slate-600"
          >
            選択を解除して一覧に戻る
          </button>
        </div>
      ) : (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            推奨プラン
          </h3>
          {recommendedPlans.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {recommendedPlans.map((plan, i) => (
                <PlanCard
                  key={i}
                  variant="compact"
                  plan={plan}
                  onClick={() => onSelectPlan(plan)}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">
              {emptyMessage ?? "推奨プランが見つかりませんでした。"}
            </p>
          )}
        </div>
      )}

      <NeuButton className="w-full !py-3" onClick={() => setModalOpen(true)}>
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4" />
          {selectedPlan ? "他の調整方法を探す" : `すべての調整方法を確認（${plans.length}）`}
        </span>
      </NeuButton>

      <PlanListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        plans={plans}
        onSelect={(plan) => {
          onSelectPlan(plan);
          setModalOpen(false);
        }}
      />
    </div>
  );
}
