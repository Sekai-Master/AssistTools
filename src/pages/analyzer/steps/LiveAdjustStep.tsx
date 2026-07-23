import { useState } from "react";
import { StepSection } from "./StepSection";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byBonusDesc, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";
import type { MultiLivePlan } from "../lib/multiLiveAdjust";

const ENVY_JACKET = `${import.meta.env.BASE_URL}MusicDatas/jacket/jacket_s_074.webp`;

/** 曲サジェスト用に必要な最小の楽曲情報。 */
interface SuggestMusic {
  id: string;
  title: string;
  basePoint: number;
}

/**
 * プランの基礎点に一致する実在曲のサジェスト（R2-2.3）。
 * 「基礎点113の曲を叩け」だけでは実行できないので、タイトルを3件まで具体的に出す。
 */
function SongSuggestion({
  musics,
  basePoint,
}: {
  musics: ReadonlyArray<SuggestMusic>;
  basePoint: number;
}) {
  const matched = musics.filter((m) => m && m.basePoint === basePoint);
  if (matched.length === 0) return null;
  const rest = matched.length - 3;
  return (
    <p className="mt-0.5 text-xs text-slate-500">
      曲例: {matched.slice(0, 3).map((m) => m.title).join(" / ")}
      {rest > 0 ? ` 他${rest}曲` : ""}
    </p>
  );
}

/** 複数回プラン1件ぶんのカード。各ライブの曲・LB・スコア帯が読み取れることが受け入れ条件（R2-5）。 */
function MultiPlanCard({
  plan,
  index,
  musics,
}: {
  plan: MultiLivePlan;
  index: number;
  musics: ReadonlyArray<SuggestMusic>;
}) {
  return (
    <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
      <div className="mb-2 text-sm font-bold text-slate-700">
        プラン{index + 1} ・ 全{plan.liveCount}回 ・ LB合計{plan.lbCost}
      </div>
      <div className="space-y-2">
        {plan.units.map((u, j) => (
          <div key={j} className="text-sm text-slate-600">
            <div className="font-mono tabular-nums">
              基礎点{u.basePoint} ・ {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜
              {u.maxScore.toLocaleString()} × {u.count}回（1回 {u.pt.toLocaleString()} Pt）
            </div>
            <SongSuggestion musics={musics} basePoint={u.basePoint} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Step2: ライブでの端数調整。マイセカイOFF時は複数回・楽曲自由のプランを第1候補として出す。 */
export function LiveAdjustStep({
  result,
  musics = [],
}: {
  result: CalculationResultV6;
  /** 曲サジェスト用の楽曲リスト。省略時はサジェストなしで動く。 */
  musics?: ReadonlyArray<SuggestMusic>;
}) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  const live = result.liveAdjustment;
  const plans = live.adjustmentPlans ?? [];
  // 複数回プラン（曲側・第1候補）。calculator が OFF 時のみ設定するが、
  // 表示の出し分けはこのコンポーネントでも useMySekai を見て明示しておく。
  const multi = result.useMySekai === false ? live.multi : undefined;
  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (live.status === "OK" ? live.requiredPt : 0);

  // 第2候補（編成組み替え・ボーナス掃引）。ON時は従来どおりこれが唯一の表示なので
  // マークアップは一切変えず、OFF時のみ小見出しの下に降格させる（R2-5: 現編成のまま解ける案が上）。
  const secondCandidate = (
    <>
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
          {/* 許容するライブボーナス消費幅は計算モードで変わる（マイセカイOFF時は0〜10）ため動的に表示。 */}
          <div className="mt-1 text-xs text-slate-500">
            現在のボーナス・0〜{live.maxLiveBonus}炊きで達成可能です
          </div>
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
    </>
  );

  return (
    <StepSection
      unit="ln"
      title={multi ? "② ライブ調整" : "② ライブ調整（独りんぼエンヴィー）"}
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-bold" style={{ color: "var(--unit-color)" }}>
          {live.requiredPt.toLocaleString()}
        </span>{" "}
        Pt を獲得します。
      </p>

      {/* OFF時のNG案内は multi 側（理由つき）を正とし、従来の汎用NGパネルはON時のみ出す。 */}
      {!multi && live.status === "NG" && !selectedPlan ? (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          このポイント（<span className="font-bold">{live.requiredPt.toLocaleString()} Pt</span>
          ）は0〜{live.maxLiveBonus}炊きでは調整できません。
          <span className="mt-1 block">
            目標ポイントを数ポイントずらすか、下の一覧から編成を組み替えるプランを選んでください。
          </span>
        </div>
      ) : null}

      {multi && multi.status === "OK" && multi.plans.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            複数回プラン（現在の編成のまま曲を選ぶ・第1候補）
          </div>
          <div className="space-y-3">
            {multi.plans.map((p, i) => (
              <MultiPlanCard key={i} plan={p} index={i} musics={musics} />
            ))}
          </div>
        </div>
      )}

      {multi && multi.reason === "OVER_CAP" && (
        <div className="mb-6 rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          調整には最低{" "}
          <span className="font-bold tabular-nums">
            {(multi.requiredLiveCount ?? 0).toLocaleString()}
          </span>{" "}
          回のライブが必要で、上限 {multi.liveCountCap} 回を超えます。
          <span className="mt-1 block">
            マイセカイを利用する設定に切り替えるか、通常の周回で差分を縮めてから再計算してください。
          </span>
        </div>
      )}

      {multi && multi.reason === "NO_EXACT" && (
        <div className="mb-6 rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          <span className="font-bold tabular-nums">{live.requiredPt.toLocaleString()} Pt</span> に
          厳密一致する組合せは
          {multi.searchedUpToCount != null && <>最小回数から {multi.searchedUpToCount} 回まで</>}
          探した範囲では見つかりませんでした。
          <span className="mt-1 block">
            目標を数ポイントずらすか、下の編成組み替え案を確認してください。
          </span>
        </div>
      )}

      {multi ? (
        (live.targetScoreRange || plans.length > 0) && (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              編成を組み替える場合（第2候補）
            </div>
            {secondCandidate}
          </div>
        )
      ) : (
        secondCandidate
      )}
    </StepSection>
  );
}
