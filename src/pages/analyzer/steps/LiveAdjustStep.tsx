import { useRef, useState } from "react";
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
import type { FinalRunPlan } from "../lib/finalRun";
import { drawPlanCanvas } from "../../refresh/lib/planCanvas";
import { buildAdjustPlanCanvasData } from "../lib/adjustPlanCanvas";

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

/**
 * LB消費の現実コスト換算（R3-1）。
 * ゲーム仕様: 自然回復30分/個・クリスタル購入10個/個・所持上限10個。
 * 生の個数だけでは重さが伝わらない（480個＝自然回復10日）ため、時間と
 * クリスタルの両換算を併記する。lbCost 0 のときは換算不要なので出さない。
 */
function LbCostNote({ lbCost }: { lbCost: number }) {
  if (lbCost <= 0) return null;
  // 0.5刻みの時間は「7.5時間」のように小数で表示する。
  return (
    <>
      （回復 約{(lbCost * 0.5).toLocaleString()}時間 ・ クリスタル約
      {(lbCost * 10).toLocaleString()}個）
    </>
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
  planCount,
  selected,
  onSelect,
}: {
  plan: MultiLivePlan;
  index: number;
  /** 前線全体の件数。両端バッジ（回数最少/LB最安）の判定に使う。 */
  planCount: number;
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
        {/* plans は回数昇順のパレート前線（R3-2）: 先頭＝回数最小案・末尾＝LB最安案。
            1件しかない場合は両者が一致するので「回数最少」だけを出す。 */}
        {index === 0 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ backgroundColor: "var(--unit-color)" }}
          >
            回数最少
          </span>
        )}
        {index === planCount - 1 && planCount > 1 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ backgroundColor: "var(--unit-color)" }}
          >
            LB最安
          </span>
        )}
        <span className="ml-auto tabular-nums text-slate-500">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
          <LbCostNote lbCost={plan.lbCost} />
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
  finalSong,
  finalRunPlan,
}: {
  result: CalculationResultV6;
  /** 曲サジェスト用の楽曲リスト。省略時はサジェストなしで動く。 */
  musics?: ReadonlyArray<SuggestMusic>;
  /** 曲検索モーダルの絞り込み用エイリアス。 */
  aliases?: AliasEntry[];
  /** ラストランの最終楽曲。画像にラストランを含めるために使う。 */
  finalSong?: SuggestMusic;
  /**
   * Step③で採択中のラストランプラン（未選択なら推奨順の先頭）。
   * 画像が「ユーザーが選んだ案」を描くために親から受け取る。
   */
  finalRunPlan?: FinalRunPlan;
}) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  // 採択中の複数回プラン。既定は0番＝回数最少（並びは回数昇順のパレート前線。R3-2）。
  // 再計算でプラン数が減っても壊れないよう、参照時にクランプする。
  const [multiIndex, setMultiIndex] = useState(0);
  // 基礎点ごとに「実際に叩く曲」の選択を覚える。基礎点をキーにすることで、
  // 同じ基礎点が複数ユニット・複数プランに出ても選択が引き継がれる。
  const [songByBase, setSongByBase] = useState<Record<number, string>>({});
  // 曲選択モーダルを開いている基礎点。null で閉じる。
  const [pickerBase, setPickerBase] = useState<number | null>(null);
  // 画像コピー/保存の結果表示（他ツールと同じ挙動）。
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  // PNG書き出し専用のオフスクリーンcanvas（refresh の PlanTimeline と同じパターン）。
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const live = result.liveAdjustment;
  const plans = live.adjustmentPlans ?? [];
  // 複数回プラン（曲側・第1候補）。calculator が OFF 時のみ設定するが、
  // 表示の出し分けはこのコンポーネントでも useMySekai を見て明示しておく。
  const multi = result.useMySekai === false ? live.multi : undefined;
  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (live.status === "OK" ? live.requiredPt : 0);

  /**
   * 採択中の複数回プランをPNGで保存する（R3-5.1）。
   * 曲・LB・スコア帯・回数・合計Pt・総回数・LB合計が画像単体で読めること。
   * canvas生成→toDataURL→ダウンロードの流れは refresh の PlanTimeline を踏襲。
   */
  const renderAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return null;
    // 画面のユニットカラーを画像のアクセントにも使う（PlanTimeline と同じ取得方法。
    // display:none だと --unit-color が取れないブラウザがあるため canvas は画面外配置）。
    const accent =
      getComputedStyle(canvas).getPropertyValue("--unit-color").trim() || "#ff9900";
    await drawPlanCanvas(
      canvas,
      buildAdjustPlanCanvasData({
        plan: chosen,
        requiredPt: live.requiredPt,
        targetPt: result.targetPt,
        currentPt: result.currentPt,
        maxScore: result.maxScore,
        songForBase: (basePoint) => {
          // 画面の UnitSong と同じ解決規則: 選択済みがあればそれ、なければ先頭候補。
          const candidates = musics.filter((m) => m && m.basePoint === basePoint);
          const picked =
            candidates.find((m) => m.id === songByBase[basePoint]) ?? candidates[0];
          return picked
            ? { title: picked.title, jacketUrl: `${JACKET_BASE}${picked.jacketLink}` }
            : undefined;
        },
        // ラストランは別ステップだが、共有したいのは「この1枚で完結するプラン」なので同じ画像に載せる。
        finalRun:
          result.finalRunPt > 0
            ? {
                pt: result.finalRunPt,
                basePoint: result.finalBase,
                song: finalSong
                  ? { title: finalSong.title, jacketUrl: `${JACKET_BASE}${finalSong.jacketLink}` }
                  : undefined,
                plan: finalRunPlan,
                planCount: result.finalRunPlans.length,
              }
            : undefined,
        accent,
      })
    );
    return canvas;
  };

  const copyAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = await renderAdoptedPlanImage(chosen);
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setImageNotice("画像をコピーしました。");
      } catch {
        setImageNotice("コピーに失敗しました（保存をお使いください）。");
      }
    }, "image/png");
  };

  const saveAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = await renderAdoptedPlanImage(chosen);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "adjust-plan.png";
    a.click();
  };

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
                planCount={multi.plans.length}
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
                    全{chosen.liveCount}回 ・ ライブボーナス合計{chosen.lbCost}個
                    <LbCostNote lbCost={chosen.lbCost} /> ・ 合計{" "}
                    {chosen.totalPt.toLocaleString()} Pt
                  </span>
                </div>
                {/* LB消費の現実コストを隠さない（R3-1）。所持上限10個・ラストラン側の
                    消費（planFinalRun は LB 0〜10 を使う）まで含めた総量をここで開示する。 */}
                {chosen.lbCost > 10 && (
                  <p className="mb-2 text-xs text-amber-600">
                    所持上限10個を超えるため、自然回復待ちまたはクリスタルでの補充が必要です
                  </p>
                )}
                {result.finalRunPt > 0 && (
                  <p className="mb-2 text-xs text-slate-500">
                    ラストラン分（選ぶプランにより 0〜10）を含めた総LB消費は {chosen.lbCost}〜
                    {chosen.lbCost + 10}
                  </p>
                )}
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
                {/* 「n回すべてで狙い撃つ」重さと、外したときの実損を明示する（R3-4 MEDIUM）。 */}
                <p className="mt-3 text-[11px] text-slate-400">
                  全{chosen.liveCount}
                  回それぞれでスコア帯（2万点幅）を狙い撃つ必要があります。帯を外した回のLBは戻りません。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NeuButton
                    className="!py-1.5 !text-xs"
                    onClick={() => void copyAdoptedPlanImage(chosen)}
                  >
                    画像をコピー
                  </NeuButton>
                  <NeuButton
                    className="!py-1.5 !text-xs"
                    onClick={() => void saveAdoptedPlanImage(chosen)}
                  >
                    画像で保存
                  </NeuButton>
                  <span className="text-[11px] text-slate-400">
                    {imageNotice ??
                      (result.finalRunPt > 0 ? "ラストランも含めた1枚になります" : null)}
                  </span>
                </div>
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
      {/* NO_EXACT は2ケースで出し分ける（R3-3）。
          死角ケース: 必要調整量が1回の最小獲得Ptを下回り、原理的に着地不能。
          「数ポイントずらす」では絶対に抜けられないため、必要なズラし幅を具体値で示す。
          それ以外: 探索範囲内で見つからなかっただけなので、断定を避けた案内にする。 */}
      {multi && multi.reason === "NO_EXACT" && (
        <div
          className={`mb-6 rounded-xl p-6 text-center text-sm ${
            live.status === "OK" ? "bg-neu text-slate-500 shadow-neu-inset" : "bg-rose-50 text-rose-600"
          }`}
        >
          {live.requiredPt > 0 && multi.minPtPerLive > 0 && live.requiredPt < multi.minPtPerLive ? (
            <>
              必要調整量{" "}
              <span className="font-bold tabular-nums">{live.requiredPt.toLocaleString()} Pt</span>{" "}
              は1回のライブの最小獲得{" "}
              <span className="font-bold tabular-nums">
                {multi.minPtPerLive.toLocaleString()} Pt
              </span>{" "}
              を下回るため着地できません。
              <span className="mt-1 block">
                目標を {live.requiredPt.toLocaleString()} Pt 下げて調整不要にするか、
                {(multi.minPtPerLive - live.requiredPt).toLocaleString()} Pt 以上引き上げてください。
              </span>
            </>
          ) : (
            <>
              探索範囲（最大{multi.liveCountCap}回・Pt値2種類の組合せ）では厳密一致が
              見つかりませんでした。
              <span className="mt-1 block">
                {live.status === "OK"
                  ? "下の編成組み替え案（第2候補）で着地できます。"
                  : "目標を見直して再計算するか、下の編成組み替え案（第2候補）を確認してください。"}
              </span>
            </>
          )}
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

      {/* 画像書き出し専用。display:none だと getComputedStyle が --unit-color を返さない
          ブラウザがあるため、レンダリングは保つ画面外配置にする（PlanTimeline と同じ）。 */}
      <canvas
        ref={exportCanvasRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
      />

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
