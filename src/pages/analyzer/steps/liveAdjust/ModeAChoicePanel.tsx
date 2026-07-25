import { useState } from "react";
import { Search } from "lucide-react";
import { clickableProps } from "../../../../lib/a11y";
import { NeuButton } from "../../../../components/ui/NeuButton";
import { PlanCard } from "../../plan/PlanCard";
import { PlanListModal } from "../../plan/PlanListModal";
import type { UniversalPlan } from "../../plan/types";
import { RECOMMEND_LIMIT } from "../../lib/recommendPlans";
import { scoreBandBadge } from "../../lib/scoreBandBadge";
import type { MultiLivePlan } from "../../lib/multiLiveAdjust";
import type { AdjustmentPlan } from "../../lib/liveAdjust";
import type { ModeAChoice, ModeAChoiceForm } from "../../lib/modeAChoices";
import { FormationUnchangedBadge, LbCostNote, ScoreBandTag } from "./badges";

/**
 * モードA選択肢提示型の選択UI（R6 モードA選択肢提示型 §3）。
 *
 * earn の PlanSelectionUI（未選択→グリッド）ではなく、PrimaryPlanPanel 流
 * （採択中カード常時表示＋残りを畳む）を採る。既定選択が常に存在する
 * （＝「未選択状態」が無い）ため2相UIが合わない。
 *
 * 候補は削除しない: 旧UIの全表示物（5.1カード / 5.2全件 / multiA先頭）は
 * buildModeAChoices の①〜⑤に全て包含され、multiA は先頭固定から全 plans 提示に増える。
 */

type CurrentForm = Extract<ModeAChoiceForm, { type: "current" }>;

/** 現ボーナス維持・1回（current）の中身。旧「編成そのままでOK」カードの見た目を流用。 */
function CurrentChoiceBody({ form }: { form: CurrentForm }) {
  return (
    <div className="rounded-xl bg-neu p-5 text-center shadow-neu-inset">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        編成そのままでOK・目標スコア範囲
      </div>
      <div className="font-mono text-2xl font-bold tabular-nums text-slate-800 sm:text-3xl">
        {form.scoreRange.min.toLocaleString()}
        <span className="mx-2" style={{ color: "var(--unit-color)" }}>
          〜
        </span>
        {form.scoreRange.max.toLocaleString()}
      </div>
      {form.lb !== undefined && (
        <div className="mt-1 text-xs tabular-nums text-slate-500">
          LB {form.lb}
          <LbCostNote lbCost={form.lb} />
        </div>
      )}
    </div>
  );
}

/** 複数回プラン（multi）のユニット一覧。keep=FormationUnchangedBadge、rebuildは各回の目標ボーナスを表示。 */
function MultiChoiceBody({ plan, kind }: { plan: MultiLivePlan; kind: ModeAChoice["kind"] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="tabular-nums">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
          <LbCostNote lbCost={plan.lbCost} /> ・ 合計 {plan.totalPt.toLocaleString()} Pt
        </span>
        {kind === "keep" && <FormationUnchangedBadge />}
      </div>
      <ol className="space-y-2">
        {plan.units.map((u, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <span className="font-bold tabular-nums" style={{ color: "var(--unit-color)" }}>
              {u.bonus !== undefined ? `${u.bonus}%` : "現在のボーナス"}
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜{u.maxScore.toLocaleString()}
              {" "}× {u.count}回（1回 {u.pt.toLocaleString()} Pt）
            </span>
            <ScoreBandTag band={scoreBandBadge(u)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 採択中カード（detailed）。formで出し分ける（本書コメントの3形）。 */
function AdoptedChoiceCard({
  choice,
  jacketSrc,
  songTitle,
}: {
  choice: ModeAChoice;
  jacketSrc?: string;
  songTitle?: string;
}) {
  return (
    <div className="rounded-xl ring-2 [--tw-ring-color:var(--unit-color)]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold" style={{ color: "var(--unit-color)" }}>
          ▸ 採択中
        </span>
      </div>
      {choice.form.type === "current" && <CurrentChoiceBody form={choice.form} />}
      {choice.form.type === "single" && (
        <div>
          {choice.kind === "keep" && (
            <div className="mb-2 flex justify-center">
              <FormationUnchangedBadge />
            </div>
          )}
          <PlanCard variant="detailed" plan={choice.form.plan} jacketSrc={jacketSrc} songTitle={songTitle} />
        </div>
      )}
      {choice.form.type === "multi" && (
        <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
          <MultiChoiceBody plan={choice.form.plan} kind={choice.kind} />
        </div>
      )}
    </div>
  );
}

/** 一覧用のコンパクトカード（「編成そのままの他の案」・折りたたみ内で共通利用）。 */
function CompactChoiceCard({ choice, onAdopt }: { choice: ModeAChoice; onAdopt: () => void }) {
  if (choice.form.type === "current") {
    const form = choice.form;
    return (
      <div
        {...clickableProps(onAdopt)}
        className="neu-panel neu-tactile cursor-pointer p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-slate-500">編成そのまま・1回</span>
          {form.lb !== undefined && (
            <span className="font-mono text-xs tabular-nums text-slate-500">LB{form.lb}</span>
          )}
        </div>
        <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-800">
          {form.scoreRange.min.toLocaleString()}〜{form.scoreRange.max.toLocaleString()}
        </div>
      </div>
    );
  }
  if (choice.form.type === "single") {
    return <PlanCard variant="compact" plan={choice.form.plan} onClick={onAdopt} />;
  }
  const plan = choice.form.plan;
  return (
    <div className="rounded-xl bg-neu p-3 shadow-neu-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="tabular-nums">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
          <LbCostNote lbCost={plan.lbCost} />
        </span>
        <NeuButton className="!px-2.5 !py-1 !text-[11px]" onClick={onAdopt}>
          この案にする
        </NeuButton>
      </div>
      <div className="space-y-0.5 text-xs text-slate-600">
        {plan.units.map((u, j) => (
          <div key={j} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-bold" style={{ color: "var(--unit-color)" }}>
              {u.bonus !== undefined ? `${u.bonus}%` : "現在"}
            </span>
            <span className="font-mono tabular-nums">
              {u.liveBonus}炊き・{u.minScore.toLocaleString()}〜{u.maxScore.toLocaleString()}×{u.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 単発（single）候補だけを UniversalPlan として取り出す（PlanListModal に渡すため）。 */
function singlePlanOf(choice: ModeAChoice): AdjustmentPlan | undefined {
  return choice.form.type === "single" ? choice.form.plan : undefined;
}

/** UniversalPlan の内容署名（PlanListModal からの選択結果を ModeAChoice へ引き戻すためのキー）。 */
function planKey(plan: UniversalPlan): string {
  return `${plan.bonus}/${plan.liveBonus}/${plan.minScore}`;
}

export function ModeAChoicePanel({
  choices,
  selected,
  onSelect,
  jacketSrc,
  songTitle,
}: {
  choices: ModeAChoice[];
  /** 既定選択（先頭）へのフォールバックは呼び出し側（BonusSweepPanel）が済ませて渡す。 */
  selected: ModeAChoice;
  onSelect: (choice: ModeAChoice) => void;
  jacketSrc?: string;
  songTitle?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const keeps = choices.filter((c) => c.kind === "keep");
  const rebuild = choices.filter((c) => c.kind === "rebuild");
  const otherKeeps = keeps.filter((c) => c.id !== selected.id);

  // 折りたたみの先頭表示: 統合ソート順の先頭 RECOMMEND_LIMIT 件 ＋ rebuild複数回の全件。
  const headIds = new Set(rebuild.slice(0, RECOMMEND_LIMIT).map((c) => c.id));
  for (const c of rebuild) if (c.form.type === "multi") headIds.add(c.id);
  const rebuildHead = rebuild.filter((c) => headIds.has(c.id) && c.id !== selected.id);

  const rebuildSingles = rebuild
    .map((c) => ({ choice: c, plan: singlePlanOf(c) }))
    .filter((x): x is { choice: ModeAChoice; plan: AdjustmentPlan } => x.plan !== undefined);
  const rebuildSingleByKey = new Map(rebuildSingles.map(({ choice, plan }) => [planKey(plan), choice]));

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-neu p-3 text-xs text-slate-500 shadow-neu-inset">
        サポート編成・メンバーの入れ替えで合計ボーナスを候補の値ちょうどに合わせます（0.5%刻み）。
        <span className="font-bold text-amber-600">
          どのボーナスが実際に組めるかはこのツールでは判定できません。
        </span>
        お手持ちのカードで組めそうな案を選んでください。
      </p>

      <AdoptedChoiceCard choice={selected} jacketSrc={jacketSrc} songTitle={songTitle} />

      {keeps.length === 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          現在のボーナスのままでは組めません（下の組み替え案から選んでください）。
        </p>
      )}

      {otherKeeps.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            編成そのままの他の案
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherKeeps.map((c) => (
              <CompactChoiceCard key={c.id} choice={c} onAdopt={() => onSelect(c)} />
            ))}
          </div>
        </div>
      )}

      {rebuild.length > 0 && (
        <details className="rounded-xl bg-neu p-3 shadow-neu-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">
            編成を組み替える案（下げ幅が小さい順・{rebuild.length}件）
          </summary>
          <div className="mt-3 space-y-3">
            {rebuildHead.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rebuildHead.map((c) => (
                  <CompactChoiceCard key={c.id} choice={c} onAdopt={() => onSelect(c)} />
                ))}
              </div>
            )}
            {rebuildSingles.length > 0 && (
              <NeuButton className="w-full !py-2 !text-xs" onClick={() => setModalOpen(true)}>
                <span className="inline-flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  すべての組み替え案を確認（{rebuildSingles.length}）
                </span>
              </NeuButton>
            )}
          </div>
        </details>
      )}

      <PlanListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="ライブ調整・組み替え案一覧"
        plans={rebuildSingles.map(({ plan }) => plan)}
        onSelect={(plan) => {
          const found = rebuildSingleByKey.get(planKey(plan));
          if (found) onSelect(found);
          setModalOpen(false);
        }}
      />
    </div>
  );
}
