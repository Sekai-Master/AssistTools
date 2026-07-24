import { useState } from "react";
import { NeuButton } from "../../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../../components/SongSearchModal";
import { onJacketError } from "../../../../lib/img";
import type { AliasEntry } from "../../../bingo/useBingoMusics";
import { PlanSelectionUI } from "../../plan/PlanSelectionUI";
import type { UniversalPlan } from "../../plan/types";
import { byBonusDesc, recommendPlans } from "../../lib/recommendPlans";
import type { CalculationResultV6 } from "../../lib/calculator";
import type { MultiLivePlan } from "../../lib/multiLiveAdjust";
import { scoreBandBadge } from "../../lib/scoreBandBadge";
import { LbCostNote, ScoreBandTag } from "./badges";
import type { SuggestMusic } from "./types";

/**
 * モードA複数回化（R6 §1・§6）の表示。
 *
 * 単発（targetScoreRange・adjustmentPlans）がどちらも組めないが multiA（曲固定・
 * ボーナス可変・複数回）が組めるときだけ出す。各回で狙うボーナス値が違う
 * （u.bonus）ため、単発掃引カードとは別の見せ方にする。まずは動く叩き台
 * （見た目の最終調整は次ラウンド・R6ブリーフ §4-3 の対象外）。
 */
function ModeAMultiPlanCard({
  plan,
  jacketSrc,
  songTitle,
}: {
  plan: MultiLivePlan;
  jacketSrc?: string;
  songTitle?: string;
}) {
  return (
    <div className="mb-6 rounded-xl bg-neu p-4 shadow-neu-inset">
      <div className="mb-3 flex items-center gap-3">
        {jacketSrc ? (
          <img
            src={jacketSrc}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-neu-sm"
            onError={onJacketError}
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-neu shadow-neu-inset" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            複数回に分けてボーナス調整（{songTitle ?? "選択曲"}を{plan.liveCount}回）
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            1回では組めないため、ボーナスを変えて複数回に分けて合わせます
          </p>
        </div>
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
      <p className="mt-3 text-xs tabular-nums text-slate-500">
        合計 {plan.liveCount}回 ・ LB合計{plan.lbCost}
        <LbCostNote lbCost={plan.lbCost} /> ・ 合計 {plan.totalPt.toLocaleString()} Pt
      </p>
    </div>
  );
}

/**
 * Step2 モードA（任意の曲＋ボーナス選択）のパネル。
 *
 * 曲を1曲固定し、ボーナスを掃引して「今の編成のままでも狙えるスコア帯」
 * （5.1・targetScoreRange）と「編成を組み替えて別のボーナス値にする」候補
 * （5.2・adjustmentPlans）を提示する。ボーナス逆引き（どのカードで組むか）の
 * エンジンは作らない（楽曲マスタしか持たないツールの責務外）。
 */
export function BonusSweepPanel({
  live,
  musics,
  aliases,
  jacketBase,
  song,
  onChangeSong,
  selectedPlan,
  onSelectPlan,
}: {
  live: CalculationResultV6["liveAdjustment"];
  musics: ReadonlyArray<SuggestMusic>;
  aliases: AliasEntry[];
  jacketBase: string;
  song?: SuggestMusic;
  onChangeSong: (id: string) => void;
  selectedPlan: UniversalPlan | null;
  onSelectPlan: (plan: UniversalPlan | null) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const plans = live.adjustmentPlans ?? [];
  const jacketSrc = song ? `${jacketBase}${song.jacketLink}` : undefined;

  return (
    <div className="mb-2">
      <div className="mb-3 flex items-center gap-3">
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
          <p className="truncate font-bold text-slate-700">{song ? song.title : "楽曲未選択"}</p>
          <p className="text-xs text-slate-500">基礎点 {song?.basePoint ?? "-"}</p>
        </div>
        <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setModalOpen(true)}>
          曲を変更
        </NeuButton>
      </div>

      {live.targetScoreRange && (
        <div className="mb-6 rounded-xl bg-neu p-5 text-center shadow-neu-inset">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            編成そのままでOK・目標スコア範囲
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-800 sm:text-3xl">
            {live.targetScoreRange.min.toLocaleString()}
            <span className="mx-2" style={{ color: "var(--unit-color)" }}>
              〜
            </span>
            {live.targetScoreRange.max.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            現在のボーナス・0〜{live.maxLiveBonus}炊きで達成可能です
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">
            サポート編成・メンバーを入れ替えて、合計ボーナスを表示の値ちょうどに合わせてください（0.5%刻み）。
          </p>
          <PlanSelectionUI
            plans={plans}
            recommendedPlans={recommendPlans(plans, byBonusDesc)}
            selectedPlan={selectedPlan}
            onSelectPlan={onSelectPlan}
            modalTitle="ライブ調整プラン一覧"
            jacketSrc={jacketSrc}
            songTitle={song?.title}
          />
        </div>
      )}

      {/* 単発（編成そのまま・組み替え）がどちらも組めないが、複数回なら組める場合の代替案。 */}
      {plans.length === 0 &&
        !live.targetScoreRange &&
        live.multiA?.status === "OK" &&
        live.multiA.plans.length > 0 && (
          <ModeAMultiPlanCard
            plan={live.multiA.plans[0]}
            jacketSrc={jacketSrc}
            songTitle={song?.title}
          />
        )}

      {modalOpen && (
        <SongSearchModal
          musics={[...musics]}
          aliases={aliases}
          jacketBase={jacketBase}
          title="調整に使う楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            onChangeSong(m.id);
            onSelectPlan(null);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
