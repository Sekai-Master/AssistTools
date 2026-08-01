import { useState } from "react";
import { Search } from "lucide-react";
import { clickableProps } from "../../../../lib/a11y";
import { NeuButton } from "../../../../components/ui/NeuButton";
import { PlanListModal } from "../../plan/PlanListModal";
import type { UniversalPlan } from "../../plan/types";
import { RECOMMEND_LIMIT } from "../../lib/recommendPlans";

/**
 * 「すべての端数候補」モーダルに描く上限。大きい残額では端数候補が数千件になり
 * （破壊者 HIGH-2: req34,567 で 2,297件）、仮想化なしの全描画はモバイルでジャンクする。
 * 候補は下げ幅の小さい順なので、上位だけ見せれば現実的な編成はカバーできる
 * （下位＝下げ幅が大きく組みにくい編成は切ってよい）。
 */
const MODAL_MAX_CANDIDATES = 120;
import { scoreBandBadge } from "../../lib/scoreBandBadge";
import type { MultiLivePlan, MultiLiveUnit } from "../../lib/multiLiveAdjust";
import {
  bulkUnitOf,
  fractionUnitOf,
  splitModeAChoices,
  type ModeAChoice,
  type ModeAChoiceForm,
} from "../../lib/modeAChoices";
import { FormationUnchangedBadge, LbCostNote, ScoreBandTag } from "./badges";

/**
 * モードA「現編成N回（バルク・固定表示）＋端数1回（選択）」の選択UI
 * （R6 モードA バルク＋端数 §4）。
 *
 * buildModeAChoices が返す候補は bulkFraction（主役・選択軸）と multi（従来複数回プラン・畳み）の
 * 2形のみ（current/single は canvas 分岐互換のため型としては残るが、このパネルは生成されない
 * 前提で bulkFraction/multi のみを描く）。
 */

type BulkFractionForm = Extract<ModeAChoiceForm, { type: "bulkFraction" }>;

/** choice.form を bulkFraction として取り出す。呼び出し側は splitModeAChoices で絞り込み済み。 */
function bulkFractionFormOf(choice: ModeAChoice): BulkFractionForm {
  if (choice.form.type !== "bulkFraction") {
    throw new Error("bulkFractionFormOf: choice.form.type is not bulkFraction");
  }
  return choice.form;
}

/**
 * 端数 unit のボーナス表記。bonus キー無し＝現ボーナスのまま＝編成をいじらない。
 * バルク行の「編成そのまま」と用語を揃える（「現在の編成」と「現在のボーナス」の
 * 不統一が同じものを違うものに見せていた）。組み替え時のみボーナス値を出す。
 */
function fractionBonusLabel(unit: MultiLiveUnit): string {
  return unit.bonus !== undefined ? `ボーナス${unit.bonus}%に組み替え` : "編成そのまま";
}

/** UniversalPlan への変換（PlanListModal 用）。bonus は fractionBonus を採用（現ボーナスでも数値）。 */
function fractionPlanOf(choice: ModeAChoice): UniversalPlan | undefined {
  if (choice.form.type !== "bulkFraction") return undefined;
  const f = fractionUnitOf(choice.form);
  return { bonus: choice.minTargetBonus, liveBonus: f.liveBonus, minScore: f.minScore, maxScore: f.maxScore };
}

/** UniversalPlan の内容署名（PlanListModal からの選択結果を ModeAChoice へ引き戻すためのキー）。 */
function planKey(plan: UniversalPlan): string {
  return `${plan.bonus}/${plan.liveBonus}/${plan.minScore}`;
}

/**
 * 採択中カード・bulkFraction 本体。
 * バルク行（N≥1 のときだけ・固定表示）＋端数行（1回・選択済み編成）＋合計行。
 */
function BulkFractionBody({ choice }: { choice: ModeAChoice }) {
  const form = bulkFractionFormOf(choice);
  const bulk = bulkUnitOf(form);
  const fraction = fractionUnitOf(form);
  return (
    <div className="space-y-3 rounded-xl bg-neu p-4 shadow-neu-inset">
      {bulk && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
          <FormationUnchangedBadge />
          <span className="font-bold" style={{ color: "var(--unit-color)" }}>
            編成そのままで{form.bulkCount}回
          </span>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {bulk.liveBonus}炊き ・ スコア {bulk.minScore.toLocaleString()}〜{bulk.maxScore.toLocaleString()}
            {" "}・ 1回 {bulk.pt.toLocaleString()} Pt
          </span>
          {/* バルク行も実行難易度を出す（端数行と対称）。0炊きで中間帯を狙う行の
              「狙い撃ち」が隠れると、一番手加減が要る行の難しさが伝わらない。 */}
          <ScoreBandTag band={scoreBandBadge(bulk)} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
        <span className="text-xs font-bold text-slate-500">端数 1回</span>
        <span className="font-bold tabular-nums" style={{ color: "var(--unit-color)" }}>
          {fractionBonusLabel(fraction)}
        </span>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {fraction.liveBonus}炊き ・ スコア {fraction.minScore.toLocaleString()}〜{fraction.maxScore.toLocaleString()}
          {" "}・ {fraction.pt.toLocaleString()} Pt
        </span>
        <ScoreBandTag band={scoreBandBadge(fraction)} />
      </div>
      <div className="border-t border-slate-200/60 pt-2 text-xs tabular-nums text-slate-500">
        合計{choice.liveCount}回 ・ LB合計{choice.lbCost}
        <LbCostNote lbCost={choice.lbCost} /> ・ {choice.totalPt.toLocaleString()} Pt
      </div>
    </div>
  );
}

/** 従来の複数回プラン（multi）のユニット一覧。採択中カード・畳みセクションの両方から使う。 */
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
              {fractionBonusLabel(u)}
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

/** 採択中カード。bulkFraction / multi の2形で出し分ける（それ以外は構造上生成されない）。 */
function AdoptedChoiceCard({ choice }: { choice: ModeAChoice }) {
  return (
    <div className="rounded-xl ring-2 [--tw-ring-color:var(--unit-color)]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-bold" style={{ color: "var(--unit-color)" }}>
          ▸ 採択中
        </span>
      </div>
      {choice.form.type === "bulkFraction" && <BulkFractionBody choice={choice} />}
      {choice.form.type === "multi" && (
        <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
          <MultiChoiceBody plan={choice.form.plan} kind={choice.kind} />
        </div>
      )}
    </div>
  );
}

/** 端数候補のコンパクトカード（下げ幅小順の先頭・モーダル外の一覧）。 */
function BulkFractionCandidateCard({ choice, onAdopt }: { choice: ModeAChoice; onAdopt: () => void }) {
  const form = bulkFractionFormOf(choice);
  const fraction = fractionUnitOf(form);
  return (
    <div
      {...clickableProps(onAdopt)}
      className="neu-panel neu-tactile cursor-pointer p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold tabular-nums" style={{ color: "var(--unit-color)" }}>
          {fractionBonusLabel(fraction)}
        </span>
        <ScoreBandTag band={scoreBandBadge(fraction)} />
      </div>
      <div className="mt-1 font-mono text-xs tabular-nums text-slate-600">
        {fraction.liveBonus}炊き ・ {fraction.minScore.toLocaleString()}〜{fraction.maxScore.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] tabular-nums text-slate-500">
        合計{choice.liveCount}回 ・ LB合計{choice.lbCost}
      </div>
    </div>
  );
}

/** 従来の複数回プラン（畳みセクション）のコンパクトカード。旧 CompactChoiceCard の multi 分岐を踏襲。 */
function CompactMultiCard({ plan, onAdopt }: { plan: MultiLivePlan; onAdopt: () => void }) {
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

export function ModeAChoicePanel({
  choices,
  selected,
  onSelect,
}: {
  choices: ModeAChoice[];
  /** 既定選択（先頭＝下げ幅最小）へのフォールバックは呼び出し側（BonusSweepPanel）が済ませて渡す。 */
  selected: ModeAChoice;
  onSelect: (choice: ModeAChoice) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const { bulkFraction, legacy } = splitModeAChoices(choices);
  const bfCandidates = bulkFraction.filter((c) => c.id !== selected.id);
  const bfHead = bfCandidates.slice(0, RECOMMEND_LIMIT);

  // 下げ幅の小さい順の上位のみモーダルへ（数千件の全描画を避ける・破壊者 HIGH-2）。
  const bfPlans = bfCandidates
    .slice(0, MODAL_MAX_CANDIDATES)
    .map((c) => ({ choice: c, plan: fractionPlanOf(c) }))
    .filter((x): x is { choice: ModeAChoice; plan: UniversalPlan } => x.plan !== undefined);
  const bfChoiceByKey = new Map(bfPlans.map(({ choice, plan }) => [planKey(plan), choice]));
  const modalCount = bfPlans.length;
  const modalTruncated = bfCandidates.length > modalCount;

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-neu p-3 text-xs text-slate-500 shadow-neu-inset">
        端数1回分の編成（ボーナス）を選んでください（バルク回数は自動）。
        <span className="font-bold text-amber-600">
          組めるボーナスかはツールでは判定できません。
        </span>
      </p>

      <AdoptedChoiceCard choice={selected} />

      {bulkFraction.length === 0 && legacy.length > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          現在の編成N回＋端数1回では作れない残額です。下の複数回プラン（従来形式）から選んでください。
        </p>
      )}

      {bfCandidates.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            端数の編成を選ぶ（下げ幅が小さい順・{bfCandidates.length}件）
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {bfHead.map((c) => (
              <BulkFractionCandidateCard key={c.id} choice={c} onAdopt={() => onSelect(c)} />
            ))}
          </div>
          {bfCandidates.length > bfHead.length && (
            <NeuButton className="mt-2 w-full !py-2 !text-xs" onClick={() => setModalOpen(true)}>
              <span className="inline-flex items-center gap-2">
                <Search className="h-4 w-4" />
                {modalTruncated
                  ? `端数候補を確認（下げ幅の小さい上位 ${modalCount} 件）`
                  : `すべての端数候補を確認（${modalCount}）`}
              </span>
            </NeuButton>
          )}
        </div>
      )}

      {legacy.length > 0 && (
        <details className="rounded-xl bg-neu p-3 shadow-neu-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">
            その他の複数回プラン（従来形式・{legacy.length}件）
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {legacy.map((c) =>
              c.form.type === "multi" ? (
                <CompactMultiCard key={c.id} plan={c.form.plan} onAdopt={() => onSelect(c)} />
              ) : null
            )}
          </div>
        </details>
      )}

      <PlanListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="端数編成の候補一覧"
        plans={bfPlans.map(({ plan }) => plan)}
        annotate={(plan) => {
          const c = bfChoiceByKey.get(planKey(plan));
          return c ? `合計${c.liveCount}回` : undefined;
        }}
        onSelect={(plan) => {
          const found = bfChoiceByKey.get(planKey(plan));
          if (found) onSelect(found);
          setModalOpen(false);
        }}
      />
    </div>
  );
}
