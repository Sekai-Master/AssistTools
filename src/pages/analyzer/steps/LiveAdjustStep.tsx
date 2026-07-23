import { useRef, useState } from "react";
import { StepSection } from "./StepSection";
import { NeuButton } from "../../../components/ui/NeuButton";
import { SongSearchModal } from "../../../components/SongSearchModal";
import type { AliasEntry } from "../../bingo/useBingoMusics";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byBonusDesc, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";
import type { MultiLiveAdjustResult, MultiLivePlan, MultiLiveUnit } from "../lib/multiLiveAdjust";
import type { FinalRunPlan } from "../lib/finalRun";
import { drawPlanCanvas } from "../../refresh/lib/planCanvas";
import { buildAdjustPlanCanvasData } from "../lib/adjustPlanCanvas";
import { formatApproxMinutes, planDurationSec, type TimeForBase } from "../lib/planDuration";

const ENVY_JACKET = `${import.meta.env.BASE_URL}MusicDatas/jacket/jacket_s_074.webp`;

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** 曲サジェスト用に必要な最小の楽曲情報。検索モーダルに渡すのでジャケットも要る。 */
interface SuggestMusic {
  id: string;
  title: string;
  basePoint: number;
  jacketLink: string;
  /** 演奏秒数。0/欠損は「時間不明」として扱う（音源未確定曲などが該当）。 */
  musicTime: number;
  pronunciation?: string;
  artistName?: string;
}

/**
 * 採択中プランの参照先。
 * plans[0]（主役）・sameCountVariants（同一本数の内訳違い）・plans[1..]（本数違い）の
 * どこを見ているかをこの1値だけで表す。参照時は範囲外クランプで壊れないようにする。
 */
type Adopted = { kind: "primary" } | { kind: "variant"; index: number } | { kind: "frontier"; index: number };

/** 基礎点でフィルタした曲候補を「短い順（時間不明は末尾）・同値はid順」で返す。 */
function candidatesForBase(
  musics: ReadonlyArray<SuggestMusic>,
  basePoint: number
): SuggestMusic[] {
  return musics
    .filter((m) => m && m.basePoint === basePoint)
    .slice()
    .sort((a, b) => {
      const at = a.musicTime > 0 ? a.musicTime : Infinity;
      const bt = b.musicTime > 0 ? b.musicTime : Infinity;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
}

/** 採択曲があればそれ、なければ最短曲（候補ゼロなら undefined）。 */
function resolveSong(
  candidates: ReadonlyArray<SuggestMusic>,
  songByBase: Record<number, string>,
  basePoint: number
): SuggestMusic | undefined {
  return candidates.find((m) => m.id === songByBase[basePoint]) ?? candidates[0];
}

/** 採択中プランを Adopted から実体へ解決する。範囲外は primary へフォールバックする。 */
function getAdoptedPlan(multi: MultiLiveAdjustResult, adopted: Adopted): MultiLivePlan | undefined {
  if (multi.plans.length === 0) return undefined;
  if (adopted.kind === "variant" && multi.sameCountVariants.length > 0) {
    const i = Math.min(adopted.index, multi.sameCountVariants.length - 1);
    return multi.sameCountVariants[i];
  }
  if (adopted.kind === "frontier" && multi.plans.length > 1) {
    const i = Math.min(Math.max(adopted.index, 1), multi.plans.length - 1);
    return multi.plans[i];
  }
  return multi.plans[0];
}

/**
 * 「同じN回で組み替える」「本数を増やしてLBを節約」で使うコンパクトカード。
 * 主役カードと違い曲候補までは出さず、採択して昇格するための最小限の情報だけ出す。
 */
function CompactPlanCard({
  plan,
  timeLabel,
  onAdopt,
}: {
  plan: MultiLivePlan;
  /** 「約N分」や「約N分（主役比 +M分）」など、呼び出し側で組み立てた時間表示。 */
  timeLabel: string;
  onAdopt: () => void;
}) {
  return (
    <div className="rounded-xl bg-neu p-3 shadow-neu-sm">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="tabular-nums">
          全{plan.liveCount}回 ・ LB合計{plan.lbCost}
          <LbCostNote lbCost={plan.lbCost} /> ・ {timeLabel}
        </span>
        <NeuButton className="ml-auto !px-2.5 !py-1 !text-[11px]" onClick={onAdopt}>
          この案にする
        </NeuButton>
      </div>
      <div className="space-y-0.5 text-xs text-slate-600">
        {plan.units.map((u, j) => (
          <div key={j}>
            <UnitLine u={u} />
          </div>
        ))}
      </div>
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
function UnitLine({ u }: { u: MultiLiveUnit }) {
  return (
    <span className="font-mono tabular-nums">
      基礎点{u.basePoint} ・ {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜
      {u.maxScore.toLocaleString()} × {u.count}回（1回 {u.pt.toLocaleString()} Pt）
    </span>
  );
}

/**
 * 主役カードの1ユニット行（ブリーフP0-3）。
 * 「基礎点130」で止めず「メルト（182秒）」まで曲名をインライン表示する。
 * 曲が引けない場合のみ従来どおり基礎点表記に落ちる。
 */
function AdoptedUnitLine({
  u,
  candidates,
  chosen,
  onPick,
}: {
  u: MultiLiveUnit;
  candidates: ReadonlyArray<SuggestMusic>;
  chosen: SuggestMusic | undefined;
  onPick: () => void;
}) {
  // 短い順の代替曲を副次表示する（同一基礎点、採択中の曲を除く先頭2件）。
  const alternatives = candidates.filter((m) => m.id !== chosen?.id).slice(0, 2);
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
        {chosen ? (
          <span className="font-bold">
            {chosen.title}
            {chosen.musicTime > 0 && (
              <span className="ml-1 font-mono text-xs font-normal text-slate-500">
                （{Math.round(chosen.musicTime)}秒）
              </span>
            )}
          </span>
        ) : (
          <span className="font-bold text-amber-600">基礎点{u.basePoint}（曲未確定）</span>
        )}
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜{u.maxScore.toLocaleString()}
          {" "}× {u.count}回（1回 {u.pt.toLocaleString()} Pt）
        </span>
        <NeuButton className="!px-2.5 !py-1 !text-[11px]" onClick={onPick}>
          変更
        </NeuButton>
      </div>
      {!chosen && (
        <p className="mt-1 text-xs text-amber-600">
          基礎点 {u.basePoint} に一致する曲が見つかりません（配信停止曲は候補から除外しています）。
        </p>
      )}
      {alternatives.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">
          代替曲:{" "}
          {alternatives
            .map((m) => (m.musicTime > 0 ? `${m.title}（${Math.round(m.musicTime)}秒）` : m.title))
            .join(" / ")}
        </p>
      )}
    </li>
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
  // 採択中の複数回プラン。既定は主役（plans[0]）。plans/variants が再計算で
  // 減っても壊れないよう、参照は getAdoptedPlan 側でクランプする。
  const [adopted, setAdopted] = useState<Adopted>({ kind: "primary" });
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

  // 基礎点 → 採択曲の秒数（planDurationSec に渡す純関数）。曲が引けない/時間不明なら undefined。
  const timeForBase: TimeForBase = (basePoint) => {
    const chosen = resolveSong(candidatesForBase(musics, basePoint), songByBase, basePoint);
    return chosen && chosen.musicTime > 0 ? chosen.musicTime : undefined;
  };

  const primaryPlan = multi && multi.plans.length > 0 ? multi.plans[0] : undefined;
  const primaryDurationSec = primaryPlan ? planDurationSec(primaryPlan, timeForBase) : undefined;

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
          // 画面の曲解決と同じ規則: 選択済みがあればそれ、なければ短い順の先頭候補。
          const picked = resolveSong(candidatesForBase(musics, basePoint), songByBase, basePoint);
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

      {multi && multi.status === "OK" && multi.plans.length > 0 && primaryPlan && (() => {
        const chosen = getAdoptedPlan(multi, adopted);
        if (!chosen) return null;
        const isPrimary = adopted.kind === "primary" || chosen === primaryPlan;
        const durationSec = planDurationSec(chosen, timeForBase);

        return (
          <div className="mb-6">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              複数回プラン（現在の編成のまま曲を選ぶ・第1候補）
            </div>

            {/* 主役カード（ブリーフP0-2）。常時展開・採択中プランを常にここに描画する。 */}
            <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-bold" style={{ color: "var(--unit-color)" }}>
                  {isPrimary ? "▸ 主役" : "▸ 採択中"}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {chosen.liveCount}回 ・{" "}
                  {durationSec !== undefined ? formatApproxMinutes(durationSec) : "所要時間不明"}
                  {" "}・ LB合計{chosen.lbCost}
                  <LbCostNote lbCost={chosen.lbCost} /> ・ 合計{" "}
                  {chosen.totalPt.toLocaleString()} Pt
                </span>
                {isPrimary && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] text-white"
                    style={{ backgroundColor: "var(--unit-color)" }}
                  >
                    編成変更なし
                  </span>
                )}
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
                  const candidates = candidatesForBase(musics, u.basePoint);
                  const picked = resolveSong(candidates, songByBase, u.basePoint);
                  return (
                    <AdoptedUnitLine
                      key={j}
                      u={u}
                      candidates={candidates}
                      chosen={picked}
                      onPick={() => setPickerBase(u.basePoint)}
                    />
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

            {/* 同じN回で組み替える（LB内訳違い）。既定で畳む。0件なら非表示（ブリーフP0-2）。 */}
            {multi.sameCountVariants.length > 0 && (
              <details className="mt-3 rounded-xl bg-neu p-3 shadow-neu-sm">
                <summary className="cursor-pointer text-xs font-bold text-slate-600">
                  同じ{primaryPlan.liveCount}回で組み替える（{multi.sameCountVariants.length}件）
                </summary>
                <div className="mt-2 space-y-2">
                  {multi.sameCountVariants.map((v, i) => {
                    const sec = planDurationSec(v, timeForBase);
                    return (
                      <CompactPlanCard
                        key={i}
                        plan={v}
                        timeLabel={sec !== undefined ? formatApproxMinutes(sec) : "所要時間不明"}
                        onAdopt={() => setAdopted({ kind: "variant", index: i })}
                      />
                    );
                  })}
                </div>
              </details>
            )}

            {/* 本数を増やしてLBを節約（非推奨）。畳んだうえで追加時間を明示する（ブリーフP0-2・診断1）。 */}
            {multi.plans.length > 1 && (
              <details className="mt-3 rounded-xl bg-neu p-3 shadow-neu-sm">
                <summary className="cursor-pointer text-xs font-bold text-slate-600">
                  本数を増やしてLBを節約（非推奨
                  {(() => {
                    const lastSec = planDurationSec(multi.plans[multi.plans.length - 1], timeForBase);
                    if (primaryDurationSec === undefined || lastSec === undefined) return "";
                    const deltaMin = Math.ceil((lastSec - primaryDurationSec) / 60);
                    return deltaMin > 0 ? `・+${deltaMin}分〜` : "";
                  })()}
                  ）
                </summary>
                <div className="mt-2 space-y-2">
                  {multi.plans.slice(1).map((p, i) => {
                    const sec = planDurationSec(p, timeForBase);
                    let timeLabel = sec !== undefined ? formatApproxMinutes(sec) : "所要時間不明";
                    if (sec !== undefined && primaryDurationSec !== undefined) {
                      const deltaMin = Math.ceil((sec - primaryDurationSec) / 60);
                      timeLabel += deltaMin > 0 ? `（主役比 +${deltaMin}分）` : "";
                    } else if (sec === undefined || primaryDurationSec === undefined) {
                      timeLabel += "（主役比 時間増）";
                    }
                    return (
                      <CompactPlanCard
                        key={i}
                        plan={p}
                        timeLabel={timeLabel}
                        onAdopt={() => setAdopted({ kind: "frontier", index: i + 1 })}
                      />
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        );
      })()}

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
      {/* NO_EXACT は landability で出し分ける（R3-3 / P2-7）。
          UNREACHABLE: 原理的に着地不能。「数ポイントずらす」では絶対に抜けられないため、
          必要なズラし幅を具体値で断定形で示す。
          UNPROVEN: 探索範囲内で見つからなかっただけなので、断定を避けた案内にする。 */}
      {multi && multi.reason === "NO_EXACT" && (
        <div
          className={`mb-6 rounded-xl p-6 text-center text-sm ${
            live.status === "OK" ? "bg-neu text-slate-500 shadow-neu-inset" : "bg-rose-50 text-rose-600"
          }`}
        >
          {multi.landability === "UNREACHABLE" ? (
            live.requiredPt > 0 && multi.minPtPerLive > 0 && live.requiredPt < multi.minPtPerLive ? (
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
                この残額はどの組合せでも着地できません（1回の最小獲得{" "}
                <span className="font-bold tabular-nums">
                  {multi.minPtPerLive.toLocaleString()} Pt
                </span>
                ・3回以内の全組合せを確認済み）。
                <span className="mt-1 block">
                  {live.status === "OK"
                    ? "下の編成組み替え案（第2候補）で着地できます。"
                    : "目標を見直して再計算するか、下の編成組み替え案（第2候補）を確認してください。"}
                </span>
              </>
            )
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
