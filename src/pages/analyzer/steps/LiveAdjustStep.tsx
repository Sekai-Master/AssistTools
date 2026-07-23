import { useState } from "react";
import { StepSection } from "./StepSection";
import { NeuButton } from "../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../components/SongSearchModal";
import type { AliasEntry } from "../../bingo/useBingoMusics";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byBonusDesc, recommendPlans } from "../lib/recommendPlans";
import { onJacketError } from "../../../lib/img";
import type { CalculationResultV6 } from "../lib/calculator";
import type { MultiLivePlan } from "../lib/multiLiveAdjust";

const ENVY_JACKET = `${import.meta.env.BASE_URL}MusicDatas/jacket/jacket_s_074.webp`;

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** 曲サジェスト用に必要な最小の楽曲情報。検索モーダルに渡すのでジャケットも要る。 */
interface SuggestMusic {
  id: string;
  title: string;
  basePoint: number;
  jacketLink: string;
  pronunciation?: string;
  artistName?: string;
}

/**
 * 採択プランの1ユニットで実際に叩く曲。
 * 「基礎点113を叩け」だけでは実行できないので具体的な1曲を出し、
 * 候補が何曲あっても検索モーダルから選び直せるようにする（「他N曲」で切り捨てない）。
 */
function UnitSong({
  candidates,
  basePoint,
  chosen,
  onPick,
}: {
  candidates: ReadonlyArray<SuggestMusic>;
  basePoint: number;
  chosen: SuggestMusic | undefined;
  onPick: () => void;
}) {
  if (!chosen) {
    return (
      <p className="mt-2 text-xs text-amber-600">
        基礎点 {basePoint} に一致する曲が見つかりません（配信停止曲は候補から除外しています）。
      </p>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg bg-neu p-2 shadow-neu-sm">
      <img
        src={`${JACKET_BASE}${chosen.jacketLink}`}
        alt=""
        className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-neu-sm"
        onError={onJacketError}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-700">{chosen.title}</p>
        <p className="text-[11px] text-slate-500">
          基礎点 {basePoint} の曲 {candidates.length} 曲から選択
        </p>
      </div>
      <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={onPick}>
        変更
      </NeuButton>
    </div>
  );
}

/** 1ユニット（同一条件でまとめて叩くライブ群）の要約行。 */
function UnitLine({ u }: { u: MultiLivePlan["units"][number] }) {
  return (
    <span className="font-mono tabular-nums">
      基礎点{u.basePoint} ・ {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜
      {u.maxScore.toLocaleString()} × {u.count}回（1回 {u.pt.toLocaleString()} Pt）
    </span>
  );
}

/**
 * 複数回プラン1件ぶんの選択カード。
 * 一覧では要約だけを出し、曲候補は採択したプランにだけ出す（一覧が曲名で埋まると選べないため）。
 */
function MultiPlanCard({
  plan,
  index,
  selected,
  onSelect,
}: {
  plan: MultiLivePlan;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-xl bg-neu p-4 text-left transition ${
        selected ? "shadow-neu-inset" : "shadow-neu-sm hover:shadow-neu"
      }`}
      style={
        selected
          ? { outline: "2px solid var(--unit-color)", outlineOffset: "-2px" }
          : undefined
      }
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-slate-700">
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
          style={{ backgroundColor: selected ? "var(--unit-color)" : "#cbd5e1" }}
          aria-hidden
        >
          {selected ? "✓" : ""}
        </span>
        プラン{index + 1}
        {index === 0 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ backgroundColor: "var(--unit-color)" }}
          >
            LB最安
          </span>
        )}
        <span className="ml-auto tabular-nums text-slate-500">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
        </span>
      </div>
      <div className="space-y-0.5 text-xs text-slate-600">
        {plan.units.map((u, j) => (
          <div key={j}>
            <UnitLine u={u} />
          </div>
        ))}
      </div>
    </button>
  );
}

/** Step2: ライブでの端数調整。マイセカイOFF時は複数回・楽曲自由のプランを第1候補として出す。 */
export function LiveAdjustStep({
  result,
  musics = [],
  aliases = [],
}: {
  result: CalculationResultV6;
  /** 曲サジェスト用の楽曲リスト。省略時はサジェストなしで動く。 */
  musics?: ReadonlyArray<SuggestMusic>;
  /** 曲検索モーダルの絞り込み用エイリアス。 */
  aliases?: AliasEntry[];
}) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  // 採択中の複数回プラン。既定は0番＝LB最安（並びは lbCost 昇順）。
  // 再計算でプラン数が減っても壊れないよう、参照時にクランプする。
  const [multiIndex, setMultiIndex] = useState(0);
  // 基礎点ごとに「実際に叩く曲」の選択を覚える。基礎点をキーにすることで、
  // 同じ基礎点が複数ユニット・複数プランに出ても選択が引き継がれる。
  const [songByBase, setSongByBase] = useState<Record<number, string>>({});
  // 曲選択モーダルを開いている基礎点。null で閉じる。
  const [pickerBase, setPickerBase] = useState<number | null>(null);
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
          <p className="mb-2 text-xs text-slate-500">
            どれか1つを選ぶと、叩く曲の候補が下に出ます。
            どのプランも合計は {live.requiredPt.toLocaleString()} Pt ちょうどです。
          </p>
          <div className="space-y-2">
            {multi.plans.map((p, i) => (
              <MultiPlanCard
                key={i}
                plan={p}
                index={i}
                selected={i === Math.min(multiIndex, multi.plans.length - 1)}
                onSelect={() => setMultiIndex(i)}
              />
            ))}
          </div>

          {/* 採択したプランの実行手順。曲候補はここにだけ出す。 */}
          {(() => {
            const idx = Math.min(multiIndex, multi.plans.length - 1);
            const chosen = multi.plans[idx];
            return (
              <div className="mt-3 rounded-xl bg-neu p-4 shadow-neu-inset">
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--unit-color)" }}
                  >
                    採択: プラン{idx + 1}
                  </span>
                  <span className="text-xs tabular-nums text-slate-500">
                    全{chosen.liveCount}回 ・ ライブボーナス合計{chosen.lbCost}個 ・ 合計{" "}
                    {chosen.totalPt.toLocaleString()} Pt
                  </span>
                </div>
                <ol className="space-y-3">
                  {chosen.units.map((u, j) => {
                    const candidates = musics.filter((m) => m && m.basePoint === u.basePoint);
                    const picked =
                      candidates.find((m) => m.id === songByBase[u.basePoint]) ?? candidates[0];
                    return (
                      <li key={j}>
                        <div className="text-sm text-slate-700">
                          <span className="mr-1.5 font-bold" style={{ color: "var(--unit-color)" }}>
                            {j + 1}.
                          </span>
                          <UnitLine u={u} />
                        </div>
                        <UnitSong
                          candidates={candidates}
                          basePoint={u.basePoint}
                          chosen={picked}
                          onPick={() => setPickerBase(u.basePoint)}
                        />
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-[11px] text-slate-400">
                  各回とも、表示されたスコア帯（2万点幅）に収める必要があります。
                </p>
              </div>
            );
          })()}
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

      {/* NO_EXACT でも第2候補が成立していれば着地はできる。その場合まで赤エラーを出すと
          「検証済み(isVerified)なのに失敗表示」という矛盾になるので、深刻度を出し分ける。 */}
      {multi && multi.reason === "NO_EXACT" && (
        <div
          className={`mb-6 rounded-xl p-6 text-center text-sm ${
            live.status === "OK" ? "bg-neu text-slate-500 shadow-neu-inset" : "bg-rose-50 text-rose-600"
          }`}
        >
          <span className="font-bold tabular-nums">{live.requiredPt.toLocaleString()} Pt</span> に
          厳密一致する複数回プランは
          {multi.searchedUpToCount != null && <>最小回数から {multi.searchedUpToCount} 回まで</>}
          探した範囲では見つかりませんでした。
          <span className="mt-1 block">
            {live.status === "OK"
              ? "下の編成組み替え案（第2候補）で着地できます。"
              : "目標を数ポイントずらすか、下の編成組み替え案を確認してください。"}
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

      {pickerBase !== null && (
        <SongSearchModal
          musics={musics.filter((m) => m && m.basePoint === pickerBase)}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title={`基礎点 ${pickerBase} の曲を選択`}
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            setSongByBase((prev) => ({ ...prev, [pickerBase]: m.id }));
            setPickerBase(null);
          }}
          onClose={() => setPickerBase(null)}
        />
      )}
    </StepSection>
  );
}
